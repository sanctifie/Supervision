import type { Statut } from './types';

/** Sondes configurables : la supervision vérifie elle-même une adresse web ou un port, à intervalle régulier. */

export type TypeSonde = 'http' | 'tcp';
export const INTERVALLES_MIN = [1, 5, 15, 60];
/** Échecs de suite avant de déclarer la sonde en panne (évite l'alerte sur un raté isolé). */
export const ECHECS_AVANT_PANNE = 3;

export interface Controle {
  t: number;
  ok: boolean;
  dureeMs: number;
  detail: string;
}

export interface Sonde {
  id: string;
  nom: string;
  type: TypeSonde;
  /** http : une adresse http(s). tcp : « hôte:port ». */
  cible: string;
  /** http : code attendu ; 0 = tout code inférieur à 400. */
  codeAttendu: number;
  intervalleMin: number;
  actif: boolean;
  /** Ouvrir un incident quand la sonde tombe en panne. */
  incident: boolean;
  statut: Statut;
  echecs: number;
  /** Les 100 derniers contrôles, du plus ancien au plus récent. */
  historique: Controle[];
  /** Incident ouvert par la panne en cours. */
  ticket: string | null;
}
