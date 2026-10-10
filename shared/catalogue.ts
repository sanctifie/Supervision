import type { Niveau } from './itsm';

/**
 * Le catalogue de demandes : des demandes prêtes à commander, chacune avec
 * son formulaire. Une commande crée une demande (REQ) déjà routée vers le
 * bon groupe, avec les réponses du formulaire.
 */

export type TypeVariable = 'texte' | 'zone' | 'choix' | 'date' | 'nombre' | 'case';

export interface Variable {
  cle: string;
  libelle: string;
  type: TypeVariable;
  obligatoire: boolean;
  /** Pour « choix ». */
  options?: string[];
  aide?: string;
}

export type IconeCatalogue = 'utilisateur' | 'depart' | 'cle' | 'poste' | 'materiel' | 'produit' | 'export' | 'formation' | 'autre';

export interface ArticleCatalogue {
  id: string;
  nom: string;
  description: string;
  categorie: string;
  icone: IconeCatalogue;
  groupe: string | null;
  impact: Niveau;
  urgence: Niveau;
  /** Titre de la demande ; {cle} est remplacé par la réponse. */
  modeleTitre: string;
  variables: Variable[];
  actif: boolean;
  ordre: number;
}

export interface ReponseVariable {
  libelle: string;
  valeur: string;
}

export const ICONES_CATALOGUE: IconeCatalogue[] = ['utilisateur', 'depart', 'cle', 'poste', 'materiel', 'produit', 'export', 'formation', 'autre'];

export const LIBELLE_TYPE_VARIABLE: Record<TypeVariable, string> = {
  texte: 'Texte court',
  zone: 'Texte long',
  choix: 'Liste de choix',
  date: 'Date',
  nombre: 'Nombre',
  case: 'Case à cocher',
};

/** Remplace {cle} par les réponses (titre de la demande). */
export function remplirModele(modele: string, valeurs: Record<string, string>): string {
  return modele
    .replace(/\{(\w+)\}/g, (_, cle: string) => valeurs[cle] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}
