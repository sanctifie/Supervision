/**
 * Tâches automatisées (à la manière d'AWX) : des modèles de tâches qui
 * lancent un script autorisé, à la demande ou selon un planning, avec
 * approbation pour les plus sensibles et la sortie en direct.
 */

export interface ParametreTache {
  /** Nom passé au script (dernier argument). */
  nom: string;
  libelle: string;
  /** Seules ces valeurs sont acceptées : jamais de saisie libre vers un script. */
  choix: string[];
}

export interface ModeleTache {
  id: string;
  nom: string;
  description: string;
  /** Chemin du script, relatif au dossier des scripts (DOSSIER_SCRIPTS). */
  script: string;
  /** Arguments fixes, passés tels quels (pas de shell). */
  arguments: string[];
  parametre: ParametreTache | null;
  /** Un approbateur (autre que le demandeur) doit valider chaque lancement manuel. */
  approbation: boolean;
  delaiMinutes: number;
  actif: boolean;
}

export type Frequence = 'horaire' | 'quotidien' | 'hebdomadaire';

export interface Planning {
  id: string;
  modeleId: string;
  frequence: Frequence;
  /** « HH:MM » (minute seule pour l'horaire). */
  heure: string;
  /** 0 = dimanche … 6 = samedi (hebdomadaire). */
  jour: number;
  valeur: string | null;
  actif: boolean;
  prochain: number;
  creePar: string;
}

export type StatutTravail = 'approbation' | 'attente' | 'en-cours' | 'reussi' | 'echoue' | 'annule' | 'refuse';

export interface Travail {
  id: number;
  modeleId: string;
  nom: string;
  valeur: string | null;
  statut: StatutTravail;
  lancePar: string;
  approuvePar: string | null;
  planifie: boolean;
  creeLe: number;
  debut: number | null;
  fin: number | null;
  code: number | null;
  /** Sortie du script (stdout et stderr mêlés), tronquée au-delà de 200 Ko. */
  sortie: string;
  /** Mode démonstration : exécution simulée, aucun script lancé. */
  simule: boolean;
}

export const LIBELLE_STATUT_TRAVAIL: Record<StatutTravail, string> = {
  approbation: 'À approuver',
  attente: 'En file',
  'en-cours': 'En cours',
  reussi: 'Réussi',
  echoue: 'Échoué',
  annule: 'Annulé',
  refuse: 'Refusé',
};

export const LIBELLE_FREQUENCE: Record<Frequence, string> = { horaire: 'Toutes les heures', quotidien: 'Tous les jours', hebdomadaire: 'Toutes les semaines' };
export const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function estTermine(s: StatutTravail): boolean {
  return s === 'reussi' || s === 'echoue' || s === 'annule' || s === 'refuse';
}

/**
 * Prochaine exécution d'un planning après `apres`, à l'heure locale du fuseau.
 * shortcut: recherche minute par minute sur 8 jours (≤ 11 520 pas), suffisant pour ces trois fréquences.
 */
export function prochaineExecution(p: Pick<Planning, 'frequence' | 'heure' | 'jour'>, apres: number, fuseau: string): number {
  const [h, m] = p.heure.split(':').map(Number);
  const format = new Intl.DateTimeFormat('en-GB', { timeZone: fuseau, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const jours = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let t = Math.floor(apres / 60_000) * 60_000 + 60_000;
  for (let i = 0; i < 8 * 24 * 60; i++, t += 60_000) {
    const parts = Object.fromEntries(format.formatToParts(t).map((x) => [x.type, x.value]));
    const hh = Number(parts.hour);
    const mm = Number(parts.minute);
    if (mm !== m) continue;
    if (p.frequence === 'horaire') return t;
    if (hh !== h) continue;
    if (p.frequence === 'quotidien' || jours.indexOf(parts.weekday) === p.jour) return t;
  }
  throw new Error('Planning impossible');
}
