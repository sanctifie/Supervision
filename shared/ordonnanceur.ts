/**
 * L'ordonnanceur : des jobs (une commande sur un serveur), lancés à la main,
 * à heure fixe ou à la suite d'un autre job. Un petit agent installé sur
 * chaque serveur vient chercher son travail : aucun port à ouvrir sur le serveur.
 */

export type StatutExecution = 'en-attente' | 'en-cours' | 'reussi' | 'echoue' | 'expire' | 'annule';

export const LIBELLE_EXECUTION: Record<StatutExecution, string> = {
  'en-attente': 'En attente',
  'en-cours': 'En cours',
  reussi: 'Réussi',
  echoue: 'Échoué',
  expire: 'Sans réponse',
  annule: 'Annulé',
};

export interface Agent {
  id: string;
  nom: string;
  creeLe: number;
  /** Dernier passage de l'agent. */
  vuLe: number | null;
  enLigne: boolean;
}

export interface Job {
  id: string;
  nom: string;
  agentId: string;
  /** Exécutée par `sh -c` sur le serveur de l'agent. */
  commande: string;
  /** Expression cron à 5 champs (minute heure jour mois jour-de-semaine), ou vide : à la demande. */
  cron: string;
  /** Lancé quand cet autre job réussit. */
  apres: string | null;
  /** Durée maximale, en secondes. */
  delaiMax: number;
  /** Nouvelles tentatives après un échec ou une absence de réponse (0 à 5). */
  relances: number;
  /** La planification saute les jours de repos et les jours fériés du calendrier de service. */
  joursOuvres: boolean;
  actif: boolean;
}

export interface Execution {
  id: string;
  jobId: string;
  nomJob: string;
  agentId: string;
  statut: StatutExecution;
  demandeLe: number;
  debutLe: number | null;
  finLe: number | null;
  /** Code de sortie de la commande. */
  code: number | null;
  declenchePar: string;
  /** 1 pour le premier essai, 2 pour la première relance… */
  tentative?: number;
  /** Sortie de la commande (fin tronquée) ; absente des listes. */
  sortie?: string;
}

export interface VueOrdonnanceur {
  agents: Agent[];
  jobs: Job[];
  executions: Execution[];
  fuseau: string;
}

const BORNES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
];

function champ(expr: string, [min, max]: [number, number]): Set<number> | null {
  const valeurs = new Set<number>();
  for (const part of expr.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const a = m[1] === '*' ? min : Number(m[2]);
    const b = m[1] === '*' ? max : m[3] !== undefined ? Number(m[3]) : m[4] ? max : a;
    const pas = m[4] ? Number(m[4]) : 1;
    if (a < min || b > max || a > b || pas < 1) return null;
    for (let i = a; i <= b; i += pas) valeurs.add(i);
  }
  return valeurs;
}

export function cronValide(expr: string): boolean {
  const champs = expr.trim().split(/\s+/);
  return champs.length === 5 && champs.every((c, i) => champ(c, BORNES[i]) !== null);
}

export interface Instant {
  minute: number;
  heure: number;
  jour: number;
  mois: number;
  /** 0 = dimanche. */
  jourSemaine: number;
}

/** Comme cron : si le jour du mois ET le jour de semaine sont précisés, l'un des deux suffit. */
export function cronCorrespond(expr: string, i: Instant): boolean {
  if (!cronValide(expr)) return false;
  const c = expr.trim().split(/\s+/);
  const dans = (n: number, v: number) => champ(c[n], BORNES[n])!.has(v);
  const jour = c[2] !== '*' && c[4] !== '*' ? dans(2, i.jour) || dans(4, i.jourSemaine) : dans(2, i.jour) && dans(4, i.jourSemaine);
  return dans(0, i.minute) && dans(1, i.heure) && dans(3, i.mois) && jour;
}

const JOURS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function instantLocal(t: number, fuseau: string): Instant {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: fuseau, hourCycle: 'h23', minute: 'numeric', hour: 'numeric', day: 'numeric', month: 'numeric', weekday: 'short' })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return { minute: Number(p.minute), heure: Number(p.hour), jour: Number(p.day), mois: Number(p.month), jourSemaine: JOURS.indexOf(p.weekday) };
}
