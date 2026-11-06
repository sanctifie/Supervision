import { config } from '../config';
import type { Stockage } from '../stockage';
import { Gitlab } from './gitlab';
import { Awx } from './awx';
import { Controlm } from './controlm';
import { OutilDemo } from './demo';
import { FINI, type Outil } from './outil';
import { ErreurMetier } from '../erreurs';
import { NOM_OUTIL, type CleOutil, type EtatOutil, type Execution, type VueOutils } from '../../../shared/outils';
import type { Statut } from '../../../shared/types';

const CLES: CleOutil[] = ['gitlab', 'awx', 'controlm'];
const CONFIGURE: Record<CleOutil, () => boolean> = {
  gitlab: () => !!(config.gitlabUrl && config.gitlabJeton && config.gitlabProjet),
  awx: () => !!(config.awxUrl && config.awxJeton),
  controlm: () => !!(config.controlmUrl && config.controlmJeton),
};

/**
 * Les outils d'orchestration, derrière une seule vue : un outil configuré
 * est lu pour de vrai ; sinon, en mode démonstration, il est simulé ; sinon
 * il est « non configuré ». Les échecs nouveaux vont dans le fil d'activité.
 */
export class Outils {
  private readonly reels: Record<CleOutil, Outil>;
  private readonly demos: Record<CleOutil, Outil>;
  private cache: { expire: number; valeur: Promise<VueOutils> } | null = null;

  constructor(
    private readonly stockage: Stockage,
    private readonly modeDemo: () => boolean,
    reels?: Partial<Record<CleOutil, Outil>>,
  ) {
    this.reels = { gitlab: new Gitlab(), awx: new Awx(), controlm: new Controlm(), ...reels };
    this.demos = { gitlab: new OutilDemo('gitlab'), awx: new OutilDemo('awx'), controlm: new OutilDemo('controlm') };
  }

  private actif(cle: CleOutil): { outil: Outil; demo: boolean } | null {
    if (CONFIGURE[cle]()) return { outil: this.reels[cle], demo: false };
    if (this.modeDemo()) return { outil: this.demos[cle], demo: true };
    return null;
  }

  invalider(): void {
    this.cache = null;
  }

  vue(): Promise<VueOutils> {
    if (this.cache && this.cache.expire > Date.now()) return this.cache.valeur;
    const valeur = this.assembler();
    this.cache = { expire: Date.now() + 15_000, valeur };
    valeur.catch(() => (this.cache = null));
    return valeur;
  }

  private async assembler(): Promise<VueOutils> {
    const vue: VueOutils = { statut: 'inconnu', outils: [], executions: [], lancables: [], demandesFusion: [] };
    await Promise.all(
      CLES.map(async (cle) => {
        const a = this.actif(cle);
        const etat: EtatOutil = { cle, nom: NOM_OUTIL[cle], url: a?.outil.url ?? null, configure: !!a && !a.demo, demo: !!a?.demo, joignable: false, erreur: null };
        vue.outils.push(etat);
        if (!a) return;
        try {
          const [executions, lancables, mrs] = await Promise.all([a.outil.executions(), a.outil.lancables().catch(() => []), a.outil.demandesFusion?.().catch(() => []) ?? []]);
          etat.joignable = true;
          vue.executions.push(...executions);
          vue.lancables.push(...lancables);
          vue.demandesFusion.push(...mrs);
        } catch (e) {
          etat.erreur = (e as Error).message || 'injoignable';
        }
      }),
    );
    vue.outils.sort((x, y) => CLES.indexOf(x.cle) - CLES.indexOf(y.cle));
    vue.executions.sort((x, y) => (y.debut ?? 0) - (x.debut ?? 0));
    vue.statut = statutOrchestration(vue);
    return vue;
  }

  private exiger(cle: string): Outil {
    const a = CLES.includes(cle as CleOutil) ? this.actif(cle as CleOutil) : null;
    if (!a) throw new ErreurMetier(`Outil ${cle} non configuré`);
    return a.outil;
  }

  async lancer(cle: string, id: string, auteur: string): Promise<Execution> {
    const e = await this.exiger(cle).lancer(id);
    this.tracer(`${e.nom} lancé par ${auteur}`, e);
    return e;
  }

  async relancer(cle: string, id: string, auteur: string): Promise<Execution> {
    const e = await this.exiger(cle).relancer(id);
    this.tracer(`${e.nom} relancé par ${auteur}`, e);
    return e;
  }

  private tracer(titre: string, e: Execution): void {
    this.invalider();
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'deploiement', titre, detail: `${NOM_OUTIL[e.outil]} · ${e.contexte}`, statut: 'vert' });
  }

  /** Boucle de fond : chaque échec est publié une fois dans le fil d'activité. */
  async surveiller(): Promise<void> {
    const vue = await this.vue();
    const vus = this.stockage.donnees.vus.executions ?? {};
    const nouveaux = vue.executions.filter((e) => e.etat === 'echec' && !vus[`${e.outil}:${e.id}`]);
    if (!nouveaux.length) return;
    this.stockage.modifier((etat) => {
      const v = (etat.vus.executions ??= {});
      for (const e of nouveaux) v[`${e.outil}:${e.id}`] = e.fin ?? e.debut ?? Date.now();
      // On oublie ce qui a plus de 30 jours.
      for (const [k, t] of Object.entries(v)) if (Date.now() - t > 30 * 86_400_000) delete v[k];
    });
    for (const e of nouveaux.reverse()) {
      this.stockage.ajouterEvenement({
        t: e.fin ?? e.debut ?? Date.now(),
        type: 'deploiement',
        titre: `Échec : ${e.nom}`,
        detail: `${NOM_OUTIL[e.outil]} · ${e.contexte} · ${e.statutBrut}`,
        statut: 'rouge',
      });
    }
  }
}

/**
 * Le voyant « Orchestration » : orange si la dernière exécution terminée d'un
 * job a échoué ou si un outil configuré ne répond pas ; inconnu si rien n'est
 * configuré ; vert sinon.
 */
export function statutOrchestration(vue: Pick<VueOutils, 'outils' | 'executions'>): Statut {
  const actifs = vue.outils.filter((o) => o.configure || o.demo);
  if (!actifs.length) return 'inconnu';
  if (actifs.some((o) => !o.joignable)) return 'orange';
  const dernieres = new Map<string, Execution>();
  for (const e of vue.executions) {
    if (!FINI.includes(e.etat)) continue;
    const cle = `${e.outil}:${e.contexte}:${e.nom.replace(/#\d+$/, '')}`;
    if (!dernieres.has(cle)) dernieres.set(cle, e);
  }
  return [...dernieres.values()].some((e) => e.etat === 'echec') ? 'orange' : 'vert';
}

/** Le résumé du voyant sur le tableau de bord. */
export function resumeOrchestration(vue: VueOutils): string {
  const actifs = vue.outils.filter((o) => o.configure || o.demo);
  if (!actifs.length) return 'Non configuré';
  const muets = actifs.filter((o) => !o.joignable);
  if (muets.length) return `${muets.map((o) => o.nom).join(', ')} injoignable`;
  const jour = Date.now() - 86_400_000;
  const recentes = vue.executions.filter((e) => (e.debut ?? 0) > jour);
  const echecs = recentes.filter((e) => e.etat === 'echec').length;
  return echecs ? `${echecs} échec${echecs > 1 ? 's' : ''} sur 24 h` : `${recentes.length} exécution${recentes.length > 1 ? 's' : ''} sur 24 h, aucun échec`;
}
