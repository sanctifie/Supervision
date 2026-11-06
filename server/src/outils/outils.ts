import { config } from '../config';
import type { Stockage } from '../stockage';
import { Gitlab } from './gitlab';
import { Github } from './github';
import { Awx } from './awx';
import { Controlm } from './controlm';
import { OutilDemo } from './demo';
import { Sonar, configureSonar, qualiteDemo } from './sonar';
import { SOURCES } from './signaux';
import { LECTURE_VIDE } from './signaux/signal';
import { FINI, type Outil } from './outil';
import { ErreurMetier } from '../erreurs';
import { NOM_OUTIL, cleJob, type CleOutil, type EtatOutil, type Execution, type QualiteCode, type Signal, type VueOutils } from '../../../shared/outils';
import { pire } from '../../../shared/seuils';
import type { Statut } from '../../../shared/types';

const CLES: CleOutil[] = ['gitlab', 'github', 'awx', 'controlm'];
const CONFIGURE: Record<CleOutil, () => boolean> = {
  gitlab: () => !!(config.gitlabUrl && config.gitlabJeton && config.gitlabProjet),
  github: () => !!(config.githubJeton && config.githubDepot),
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
  private readonly sonar = new Sonar();
  private cache: { expire: number; valeur: Promise<VueOutils> } | null = null;

  constructor(
    private readonly stockage: Stockage,
    private readonly modeDemo: () => boolean,
    reels?: Partial<Record<CleOutil, Outil>>,
  ) {
    this.reels = { gitlab: new Gitlab(), github: new Github(), awx: new Awx(), controlm: new Controlm(), ...reels };
    this.demos = { gitlab: new OutilDemo('gitlab'), github: new OutilDemo('github'), awx: new OutilDemo('awx'), controlm: new OutilDemo('controlm') };
  }

  private actif(cle: CleOutil): { outil: Outil; demo: boolean } | null {
    if (CONFIGURE[cle]()) return { outil: this.reels[cle], demo: false };
    // En démo, GitLab tient le rôle de la CI ; GitHub reste « non configuré » pour ne pas doubler les pipelines.
    if (this.modeDemo() && cle !== 'github') return { outil: this.demos[cle], demo: true };
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
    const [qualite, signaux] = await Promise.all([this.qualite(), this.signaux()]);
    const vue: VueOutils = { statut: 'inconnu', outils: [], executions: [], lancables: [], demandesFusion: [], tickets: {}, qualite, signaux, etapes: [] };
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
    // Les jobs du dernier pipeline : premier outil CI actif (GitLab, puis GitHub).
    for (const cle of ['gitlab', 'github'] as const) {
      const a = this.actif(cle);
      if (!a?.outil.etapes) continue;
      vue.etapes = await a.outil.etapes().catch(() => []);
      if (vue.etapes.length) break;
    }
    vue.outils.sort((x, y) => CLES.indexOf(x.cle) - CLES.indexOf(y.cle));
    vue.executions.sort((x, y) => (y.debut ?? 0) - (x.debut ?? 0));
    vue.statut = statutOrchestration(vue);
    return vue;
  }

  private async qualite(): Promise<QualiteCode> {
    const q: QualiteCode = {
      nom: 'SonarQube',
      url: this.sonar.url || null,
      configure: configureSonar(),
      demo: false,
      joignable: false,
      erreur: null,
      projet: this.sonar.projet(),
      porte: null,
      conditions: [],
      mesures: [],
      lien: null,
    };
    if (!q.configure) {
      if (!this.modeDemo()) return q;
      return { ...q, demo: true, joignable: true, projet: 'officina', ...qualiteDemo() };
    }
    try {
      return { ...q, joignable: true, ...(await this.sonar.lire()) };
    } catch (e) {
      return { ...q, erreur: (e as Error).message || 'injoignable' };
    }
  }

  /** Les autres outils (Sentry, sondes, sécurité, GitOps…), chacun en un signal. */
  private signaux(): Promise<Signal[]> {
    return Promise.all(
      SOURCES.map(async (src): Promise<Signal> => {
        const base = {
          cle: src.cle,
          nom: src.nom,
          categorie: src.categorie,
          variables: src.variables,
          url: src.url(),
          configure: src.configure(),
          demo: false,
          joignable: false,
          erreur: null,
        };
        if (!base.configure) return this.modeDemo() ? { ...base, ...src.demo(), demo: true, joignable: true } : { ...base, ...LECTURE_VIDE };
        try {
          return { ...base, ...(await src.lire()), joignable: true };
        } catch (e) {
          return { ...base, ...LECTURE_VIDE, erreur: (e as Error).message || 'injoignable' };
        }
      }),
    );
  }

  /** Les cases que les outils vérifient seuls (« securite:cve », « checklist:sentry »…). */
  async verifications(): Promise<Record<string, { statut: Statut; detail: string }>> {
    const r: Record<string, { statut: Statut; detail: string }> = {};
    for (const s of (await this.vue()).signaux) for (const v of s.verifie) r[v.cle] = { statut: v.statut, detail: `${s.nom} : ${v.detail}` };
    return r;
  }

  async agirSignal(cle: string, action: string, cible: string, auteur: string): Promise<string> {
    const src = SOURCES.find((s) => s.cle === cle);
    if (!src || !src.configure() || !src.agir) throw new ErreurMetier(`${src?.nom ?? cle} : action impossible (outil non configuré)`);
    const message = await src.agir(action, cible, auteur);
    this.invalider();
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: message, detail: src.nom, statut: 'vert' });
    return message;
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
export function statutOrchestration(vue: Pick<VueOutils, 'outils' | 'executions'> & { qualite?: Pick<QualiteCode, 'configure' | 'demo' | 'joignable' | 'porte'> }): Statut {
  const actifs = vue.outils.filter((o) => o.configure || o.demo);
  const q = vue.qualite && (vue.qualite.configure || vue.qualite.demo) ? vue.qualite : null;
  if (!actifs.length && !q) return 'inconnu';
  if (actifs.some((o) => !o.joignable) || (q && (!q.joignable || q.porte === 'ERROR'))) return 'orange';
  const dernieres = new Map<string, Execution>();
  for (const e of vue.executions) {
    if (!FINI.includes(e.etat)) continue;
    const cle = cleJob(e);
    if (!dernieres.has(cle)) dernieres.set(cle, e);
  }
  return [...dernieres.values()].some((e) => e.etat === 'echec') ? 'orange' : 'vert';
}

/** Le résumé du voyant sur le tableau de bord. */
export function resumeOrchestration(vue: VueOutils): string {
  const actifs = vue.outils.filter((o) => o.configure || o.demo);
  const q = vue.qualite.configure || vue.qualite.demo ? vue.qualite : null;
  if (!actifs.length && !q) return 'Non configuré';
  const muets = [...actifs, ...(q && !q.joignable ? [q] : [])].filter((o) => !o.joignable);
  if (muets.length) return `${muets.map((o) => o.nom).join(', ')} injoignable`;
  if (q?.porte === 'ERROR') return 'Porte qualité SonarQube en échec';
  const jour = Date.now() - 86_400_000;
  const recentes = vue.executions.filter((e) => (e.debut ?? 0) > jour);
  const echecs = recentes.filter((e) => e.etat === 'echec').length;
  return echecs ? `${echecs} échec${echecs > 1 ? 's' : ''} sur 24 h` : `${recentes.length} exécution${recentes.length > 1 ? 's' : ''} sur 24 h, aucun échec`;
}

/** Le voyant « Outils connectés » : le pire des signaux actifs, inconnu si aucun. */
export function statutSignaux(signaux: Signal[]): { statut: Statut; resume: string } {
  const actifs = signaux.filter((s) => s.configure || s.demo);
  if (!actifs.length) return { statut: 'inconnu', resume: 'Aucun outil configuré' };
  const muets = actifs.filter((s) => !s.joignable);
  const statut = pire('vert', ...actifs.map((s) => (s.joignable ? s.statut : 'orange')));
  if (muets.length) return { statut, resume: `${muets.map((s) => s.nom).join(', ')} injoignable` };
  const alarmes = actifs.filter((s) => s.statut === 'orange' || s.statut === 'rouge');
  return { statut, resume: alarmes.length ? `À voir : ${alarmes.map((s) => s.nom).join(', ')}` : `${actifs.length} outil(s) relié(s), rien à signaler` };
}
