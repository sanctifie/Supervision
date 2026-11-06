/**
 * Les outils d'orchestration lus par la supervision : GitLab (pipelines
 * CI/CD, demandes de fusion), AWX (jobs Ansible) et Control-M (jobs
 * planifiés). Chacun livre ses exécutions dans un même modèle, pour une seule
 * chronologie et un seul voyant « Orchestration » sur le tableau de bord.
 */
import type { Statut } from './types';

export type CleOutil = 'gitlab' | 'awx' | 'controlm';
export type EtatExecution = 'succes' | 'echec' | 'en-cours' | 'attente' | 'annule' | 'inconnu';

export const NOM_OUTIL: Record<CleOutil, string> = { gitlab: 'GitLab', awx: 'AWX', controlm: 'Control-M' };

export const LIBELLE_EXECUTION: Record<EtatExecution, string> = {
  succes: 'Réussi',
  echec: 'Échoué',
  'en-cours': 'En cours',
  attente: 'En attente',
  annule: 'Annulé',
  inconnu: 'Inconnu',
};

export const STATUT_EXECUTION: Record<EtatExecution, Statut> = {
  succes: 'vert',
  echec: 'rouge',
  'en-cours': 'vert',
  attente: 'inconnu',
  annule: 'inconnu',
  inconnu: 'inconnu',
};

/** Un pipeline GitLab, un job AWX ou un job Control-M. */
export interface Execution {
  outil: CleOutil;
  id: string;
  nom: string;
  /** Branche (GitLab), modèle de job (AWX), dossier (Control-M). */
  contexte: string;
  etat: EtatExecution;
  /** Le statut tel que l'outil le nomme (success, failed, Ended Not OK…). */
  statutBrut: string;
  debut: number | null;
  fin: number | null;
  par: string | null;
  lien: string | null;
}

export interface EtatOutil {
  cle: CleOutil;
  nom: string;
  url: string | null;
  configure: boolean;
  /** Démonstration : l'outil n'est pas configuré, les données sont fictives. */
  demo: boolean;
  joignable: boolean;
  erreur: string | null;
}

/** Ce qu'on peut lancer : un modèle de job AWX, une branche GitLab. */
export interface Lancable {
  outil: CleOutil;
  id: string;
  nom: string;
  description: string;
}

export interface DemandeFusion {
  iid: number;
  titre: string;
  auteur: string;
  source: string;
  cible: string;
  majLe: number;
  lien: string;
  /** Statut du dernier pipeline de la branche, si connu. */
  pipeline: EtatExecution | null;
}

export interface VueOutils {
  statut: Statut;
  outils: EtatOutil[];
  executions: Execution[];
  lancables: Lancable[];
  demandesFusion: DemandeFusion[];
}
