import type { TicketResume } from './itsm';

/**
 * Projets, backlog et sprints (façon Scrum) : les tâches sont des tickets de
 * type « tache », rangées dans un projet, puis dans un sprint quand on les planifie.
 */

export interface Projet {
  /** 2 à 6 lettres majuscules, par exemple « OPS ». */
  cle: string;
  nom: string;
  description: string;
  creeLe: number;
}

export type StatutSprint = 'prevu' | 'actif' | 'termine';

export interface Sprint {
  id: string;
  projet: string;
  nom: string;
  objectif: string;
  statut: StatutSprint;
  debut: number | null;
  fin: number | null;
  /** Rempli à la clôture : la vélocité est `points`. */
  bilan?: { terminees: number; reportees: number; points: number };
}

export type ResumeProjet = Projet & { ouvertes: number; sprintActif: string | null };

export interface VueProjet {
  projet: Projet;
  /** Actif d'abord, puis prévus, puis les 5 derniers terminés. */
  sprints: Sprint[];
  /** Les tâches ouvertes, et toutes celles des sprints non terminés. */
  taches: TicketResume[];
}
