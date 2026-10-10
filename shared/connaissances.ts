/** La base de connaissances : articles de solution, erreurs connues, procédures. */

export type StatutArticle = 'brouillon' | 'publie' | 'retire';
/** equipe : réservé aux agents ; tous : visible aussi des demandeurs. */
export type Audience = 'equipe' | 'tous';

export interface VersionArticle {
  t: number;
  auteur: string;
  titre: string;
  contenu: string;
}

export interface Article {
  id: string;
  numero: string;
  titre: string;
  resume: string;
  /** Texte en Markdown simple (titres, listes, code, gras, liens). */
  contenu: string;
  categorie: string;
  ci: string | null;
  motsCles: string[];
  statut: StatutArticle;
  audience: Audience;
  auteur: string;
  /** Dernière personne à l'avoir modifié. */
  modifiePar?: string;
  creeLe: number;
  majLe: number;
  publieLe: number | null;
  /** Les versions précédentes (les 20 dernières). */
  versions: VersionArticle[];
  /** Numéros des tickets liés (INC, PRB…). */
  tickets: string[];
  vues: number;
  avis: { utile: number; inutile: number };
  /** Comptes ayant déjà donné leur avis. */
  votants?: string[];
}

export type ArticleResume = Pick<Article, 'id' | 'numero' | 'titre' | 'resume' | 'categorie' | 'ci' | 'statut' | 'audience' | 'auteur' | 'majLe' | 'vues' | 'avis'> & {
  tickets: number;
  pertinence?: number;
};

export const CATEGORIES_ARTICLES = [
  'Caisse / comptoir',
  'Paiements',
  'Synchronisation',
  'Impression',
  'Comptes et accès',
  'Serveur et sauvegardes',
  'Base de données',
  'Procédure',
  'Autre',
];

export const LIBELLE_STATUT_ARTICLE: Record<StatutArticle, string> = { brouillon: 'Brouillon', publie: 'Publié', retire: 'Retiré' };

/** Minuscules, sans accents : « Réseau » et « reseau » se retrouvent. */
export function normaliser(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const MOTS_VIDES = new Set([
  'les',
  'des',
  'une',
  'pour',
  'dans',
  'avec',
  'sur',
  'pas',
  'plus',
  'que',
  'qui',
  'est',
  'sont',
  'aux',
  'par',
  'mon',
  'mes',
  'ne',
  'le',
  'la',
  'de',
  'du',
  'un',
  'et',
  'en',
  'au',
]);

export function motsDe(t: string): string[] {
  return [
    ...new Set(
      normaliser(t)
        .split(/[^a-z0-9]+/)
        .filter((m) => m.length > 2 && !MOTS_VIDES.has(m)),
    ),
  ];
}
