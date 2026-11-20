/**
 * Analyse de code (à la manière de Coverity) : les défauts trouvés par les
 * analyseurs du CI (Semgrep, CodeQL, ESLint… au format SARIF), suivis d'une
 * analyse à l'autre, triés par l'équipe et reliés aux tickets.
 */

export type Impact = 'eleve' | 'moyen' | 'faible';
/** Le verdict de l'équipe sur un défaut. */
export type Classification = 'non-classe' | 'bug' | 'faux-positif' | 'intentionnel';
export type Action = 'non-definie' | 'a-corriger' | 'a-ignorer';
export type Gravite = 'non-definie' | 'majeure' | 'moderee' | 'mineure';
/**
 * nouveau : apparu à la dernière analyse ; en-cours : toujours présent ;
 * corrige : absent de la dernière analyse ; ecarte : faux positif ou intentionnel.
 */
export type EtatDefaut = 'nouveau' | 'en-cours' | 'corrige' | 'ecarte';

export interface TraceDefaut {
  t: number;
  par: string;
  texte: string;
}

export interface Defaut {
  /** Numéro stable, comme le CID de Coverity. */
  cid: number;
  empreinte: string;
  projet: string;
  outil: string;
  regle: string;
  titreRegle: string;
  categorie: string;
  cwe: string | null;
  impact: Impact;
  message: string;
  fichier: string;
  ligne: number | null;
  /** Analyse où il est apparu, et dernière où il était encore là. */
  premiereAnalyse: number;
  derniereAnalyse: number;
  detecteLe: number;
  vuLe: number;
  corrigeLe: number | null;
  classification: Classification;
  action: Action;
  gravite: Gravite;
  proprietaire: string | null;
  ticket: string | null;
  historique: TraceDefaut[];
}

export interface Analyse {
  id: number;
  projet: string;
  branche: string;
  commit: string;
  outils: string[];
  le: number;
  par: string;
  /** Défauts présents dans cette analyse. */
  total: number;
  nouveaux: number;
  corriges: number;
  /** Politique de qualité : aucun nouveau défaut d'impact élevé non écarté. */
  politique: { respectee: boolean; raison: string };
}

export interface DefautVue extends Defaut {
  etat: EtatDefaut;
}

export interface VueQualite {
  projets: string[];
  analyses: Analyse[];
  /** Défauts à traiter (présents, non écartés), par impact. */
  aTraiter: Record<Impact, number>;
  nonClasses: number;
  corriges30j: number;
  parCategorie: { nom: string; valeur: number }[];
  parFichier: { nom: string; valeur: number }[];
  parCwe: { nom: string; valeur: number }[];
}

export const LIBELLE_IMPACT: Record<Impact, string> = { eleve: 'Élevé', moyen: 'Moyen', faible: 'Faible' };
export const LIBELLE_CLASSIFICATION: Record<Classification, string> = {
  'non-classe': 'Non classé',
  bug: 'Bug (à traiter)',
  'faux-positif': 'Faux positif',
  intentionnel: 'Intentionnel',
};
export const LIBELLE_ACTION: Record<Action, string> = { 'non-definie': 'Non définie', 'a-corriger': 'À corriger', 'a-ignorer': 'À ignorer' };
export const LIBELLE_GRAVITE: Record<Gravite, string> = { 'non-definie': 'Non définie', majeure: 'Majeure', moderee: 'Modérée', mineure: 'Mineure' };
export const LIBELLE_ETAT_DEFAUT: Record<EtatDefaut, string> = { nouveau: 'Nouveau', 'en-cours': 'À traiter', corrige: 'Corrigé', ecarte: 'Écarté' };

export function etatDefaut(d: Defaut, derniere: number | undefined): EtatDefaut {
  if (d.corrigeLe !== null) return 'corrige';
  if (d.classification === 'faux-positif' || d.classification === 'intentionnel') return 'ecarte';
  return d.premiereAnalyse === derniere ? 'nouveau' : 'en-cours';
}
