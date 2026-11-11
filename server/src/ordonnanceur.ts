import crypto from 'node:crypto';
import { ErreurMetier } from './erreurs';
import type { Stockage } from './stockage';
import { cronCorrespond, cronValide, instantLocal, type Agent, type Execution, type Job, type VueOrdonnanceur } from '../../shared/ordonnanceur';

/**
 * Jobs, agents et exécutions. Seul un administrateur écrit une commande ;
 * un agent du service desk peut lancer un job existant. L'agent installé sur
 * le serveur s'authentifie par un jeton dont on ne garde que l'empreinte.
 */

export interface AgentStocke {
  id: string;
  nom: string;
  empreinte: string;
  creeLe: number;
  vuLe: number | null;
}
export type JobStocke = Job & { derniereMinute?: number };

const EN_LIGNE_MS = 60_000;
const SORTIE_MAX = 20_000;
const EXECUTIONS_GARDEES = 500;
const empreinteDe = (jeton: string) => crypto.createHash('sha256').update(jeton).digest('hex');
const fini = (e: Execution) => e.statut !== 'en-attente' && e.statut !== 'en-cours';

export class Ordonnanceur {
  constructor(
    private readonly stockage: Stockage,
    private readonly fuseau: string,
  ) {}

  private get agents(): AgentStocke[] {
    return this.stockage.donnees.agents ?? [];
  }
  private get jobs(): JobStocke[] {
    return this.stockage.donnees.jobs ?? [];
  }
  private get executions(): Execution[] {
    return this.stockage.donnees.executions ?? [];
  }
  private job(id: string): JobStocke {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) throw new ErreurMetier('Job introuvable');
    return j;
  }

  vue(maintenant = Date.now()): VueOrdonnanceur {
    return {
      agents: this.agents.map(({ empreinte: _e, ...a }): Agent => ({ ...a, enLigne: a.vuLe !== null && maintenant - a.vuLe < EN_LIGNE_MS })),
      jobs: this.jobs.map(({ derniereMinute: _d, ...j }) => j),
      executions: this.executions.slice(0, 200).map(({ sortie: _s, ...e }) => e),
      fuseau: this.fuseau,
    };
  }

  execution(id: string): Execution {
    const e = this.executions.find((x) => x.id === id);
    if (!e) throw new ErreurMetier('Exécution introuvable');
    return e;
  }

  // --- Agents ---------------------------------------------------------------
  /** Le jeton n'est donné qu'ici, une seule fois. */
  creerAgent(nomBrut: unknown, par: string): { agent: Agent; jeton: string } {
    const nom = String(nomBrut ?? '')
      .trim()
      .slice(0, 60);
    if (!nom) throw new ErreurMetier('Nom du serveur obligatoire');
    if (this.agents.some((a) => a.nom.toLowerCase() === nom.toLowerCase())) throw new ErreurMetier('Un agent porte déjà ce nom');
    const jeton = crypto.randomBytes(32).toString('base64url');
    const agent: AgentStocke = { id: crypto.randomUUID(), nom, empreinte: empreinteDe(jeton), creeLe: Date.now(), vuLe: null };
    this.stockage.modifier((e) => {
      e.agents = [...(e.agents ?? []), agent];
    });
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: `Agent ${nom} créé`, detail: `Par ${par}`, statut: 'vert' });
    const { empreinte: _e, ...propre } = agent;
    return { agent: { ...propre, enLigne: false }, jeton };
  }

  supprimerAgent(id: string, par: string): void {
    const a = this.agents.find((x) => x.id === id);
    if (!a) throw new ErreurMetier('Agent introuvable');
    if (this.jobs.some((j) => j.agentId === id)) throw new ErreurMetier('Des jobs utilisent cet agent : supprimez-les ou déplacez-les d’abord');
    this.stockage.modifier((e) => {
      e.agents = this.agents.filter((x) => x.id !== id);
    });
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: `Agent ${a.nom} supprimé`, detail: `Par ${par} ; son jeton ne marche plus`, statut: 'orange' });
  }

  // --- Jobs -----------------------------------------------------------------
  private propre(corps: Record<string, unknown>, id: string): Omit<Job, 'id'> {
    const nom = String(corps.nom ?? '')
      .trim()
      .slice(0, 80);
    if (!nom) throw new ErreurMetier('Nom du job obligatoire');
    const commande = String(corps.commande ?? '').trim();
    if (!commande || commande.length > 4000) throw new ErreurMetier('Commande obligatoire (4 000 caractères au plus)');
    const agentId = String(corps.agentId ?? '');
    if (!this.agents.some((a) => a.id === agentId)) throw new ErreurMetier('Choisissez l’agent (le serveur) qui exécute le job');
    const cron = String(corps.cron ?? '').trim();
    if (cron && !cronValide(cron)) throw new ErreurMetier('Planification invalide : 5 champs « minute heure jour mois jour-de-semaine », par exemple « 0 2 * * * »');
    const apres = corps.apres ? String(corps.apres) : null;
    // Une chaîne qui revient sur elle-même tournerait sans fin.
    for (let suivant = apres, pas = 0; suivant; suivant = this.job(suivant).apres, pas++) {
      if (suivant === id || pas > this.jobs.length) throw new ErreurMetier('Cette dépendance forme une boucle');
    }
    const delaiMax = Math.min(3600, Math.max(5, Math.round(Number(corps.delaiMax) || 300)));
    return { nom, commande, agentId, cron, apres, delaiMax, actif: corps.actif !== false };
  }

  creerJob(corps: Record<string, unknown>, par: string): Job {
    const id = crypto.randomUUID();
    const job: JobStocke = { id, ...this.propre(corps, id) };
    this.stockage.modifier((e) => {
      e.jobs = [...(e.jobs ?? []), job];
    });
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: `Job « ${job.nom} » créé`, detail: `Par ${par}`, statut: 'vert' });
    return job;
  }

  modifierJob(id: string, corps: Record<string, unknown>, par: string): Job {
    const ancien = this.job(id);
    const nouveau = this.propre({ ...ancien, ...corps }, id);
    this.stockage.modifier(() => Object.assign(ancien, nouveau));
    // La commande est ce qui s'exécute sur le serveur : chaque changement est tracé.
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: `Job « ${nouveau.nom} » modifié`, detail: `Par ${par}`, statut: 'vert' });
    return ancien;
  }

  supprimerJob(id: string, par: string): void {
    const j = this.job(id);
    this.stockage.modifier((e) => {
      e.jobs = this.jobs.filter((x) => x.id !== id);
      for (const x of e.jobs) if (x.apres === id) x.apres = null;
      for (const x of this.executions) if (x.jobId === id && x.statut === 'en-attente') x.statut = 'annule';
    });
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: `Job « ${j.nom} » supprimé`, detail: `Par ${par}`, statut: 'orange' });
  }

  // --- Exécutions -------------------------------------------------------------
  /** Met le job en file ; rien si une exécution du même job n'est pas encore finie. */
  lancer(id: string, declenchePar: string, maintenant = Date.now()): Execution | null {
    const j = this.job(id);
    if (this.executions.some((e) => e.jobId === id && !fini(e))) return null;
    const x: Execution = {
      id: crypto.randomUUID(),
      jobId: id,
      nomJob: j.nom,
      agentId: j.agentId,
      statut: 'en-attente',
      demandeLe: maintenant,
      debutLe: null,
      finLe: null,
      code: null,
      declenchePar,
    };
    this.stockage.modifier((e) => {
      e.executions = [x, ...(e.executions ?? [])].slice(0, EXECUTIONS_GARDEES);
    });
    return x;
  }

  lancerALaMain(id: string, par: string): Execution {
    const x = this.lancer(id, par);
    if (!x) throw new ErreurMetier('Ce job est déjà en file ou en cours');
    return x;
  }

  annuler(id: string, par: string): Execution {
    const x = this.execution(id);
    if (x.statut !== 'en-attente') throw new ErreurMetier('Seule une exécution en attente peut être annulée');
    this.stockage.modifier(() => Object.assign(x, { statut: 'annule', finLe: Date.now(), sortie: `Annulée par ${par}` }));
    return x;
  }

  private terminer(x: Execution, statut: 'reussi' | 'echoue' | 'expire', code: number | null, sortie: string, maintenant: number): void {
    this.stockage.modifier(() => Object.assign(x, { statut, code, sortie: sortie.slice(-SORTIE_MAX), finLe: maintenant }));
    if (statut === 'reussi') {
      for (const suite of this.jobs.filter((j) => j.apres === x.jobId && j.actif)) this.lancer(suite.id, `suite de « ${x.nomJob} »`, maintenant);
    } else {
      this.stockage.ajouterEvenement({
        t: maintenant,
        type: 'info',
        titre: `Job « ${x.nomJob} » ${statut === 'expire' ? 'sans réponse' : 'en échec'}`,
        detail: statut === 'expire' ? 'L’agent n’a pas rendu de résultat dans le délai' : `Code de sortie ${code}`,
        statut: 'rouge',
      });
    }
  }

  /** Toutes les 20 s : lance les jobs dont l'heure est venue, clôt ceux qui ne répondent plus. */
  tic(maintenant = Date.now()): void {
    const minute = Math.floor(maintenant / 60_000);
    const instant = instantLocal(maintenant, this.fuseau);
    for (const j of this.jobs) {
      if (!j.actif || !j.cron || j.derniereMinute === minute || !cronCorrespond(j.cron, instant)) continue;
      this.stockage.modifier(() => {
        j.derniereMinute = minute;
      });
      this.lancer(j.id, 'planification', maintenant);
    }
    for (const x of this.executions) {
      const delai = (this.jobs.find((j) => j.id === x.jobId)?.delaiMax ?? 300) * 1000 + 60_000;
      if (x.statut === 'en-cours' && maintenant - (x.debutLe ?? maintenant) > delai) this.terminer(x, 'expire', null, '', maintenant);
    }
  }

  // --- Côté agent -------------------------------------------------------------
  private agentDe(jeton: unknown): AgentStocke {
    const a = typeof jeton === 'string' && jeton ? this.agents.find((x) => x.empreinte === empreinteDe(jeton)) : undefined;
    if (!a) throw new ErreurMetier('Jeton d’agent inconnu');
    return a;
  }

  /** L'agent vient chercher son travail : la plus ancienne exécution en attente, ou rien. */
  travail(jeton: unknown, maintenant = Date.now()): { id: string; commande: string; delaiMax: number } | null {
    const a = this.agentDe(jeton);
    const x = [...this.executions].reverse().find((e) => e.agentId === a.id && e.statut === 'en-attente');
    const j = x && this.jobs.find((y) => y.id === x.jobId);
    this.stockage.modifier(() => {
      a.vuLe = maintenant;
      if (x && j) Object.assign(x, { statut: 'en-cours', debutLe: maintenant });
    });
    return x && j ? { id: x.id, commande: j.commande, delaiMax: j.delaiMax } : null;
  }

  resultat(jeton: unknown, corps: { id?: unknown; code?: unknown; sortie?: unknown }, maintenant = Date.now()): void {
    const a = this.agentDe(jeton);
    const x = this.executions.find((e) => e.id === corps.id && e.agentId === a.id && e.statut === 'en-cours');
    if (!x) throw new ErreurMetier('Exécution introuvable pour cet agent');
    const code = Number.isInteger(corps.code) ? (corps.code as number) : null;
    this.terminer(x, code === 0 ? 'reussi' : 'echoue', code, String(corps.sortie ?? ''), maintenant);
  }
}
