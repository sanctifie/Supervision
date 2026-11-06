import type { CategorieSignal, LectureSignal } from '../../../../shared/outils';

/**
 * Une source de signal : un outil lu en un état, un résumé, des mesures et
 * des lignes. Même règle que les autres outils : configuré → lu pour de
 * vrai ; sinon simulé en mode démonstration ; sinon « non configuré ».
 */
export interface SourceSignal {
  readonly cle: string;
  readonly nom: string;
  readonly categorie: CategorieSignal;
  /** Variables .env, pour l'aide à l'écran. */
  readonly variables: string;
  url(): string | null;
  configure(): boolean;
  lire(): Promise<LectureSignal>;
  demo(): LectureSignal;
  /** Une action réelle (synchroniser, résoudre…) ; renvoie le message à afficher. */
  agir?(action: string, cible: string, auteur: string): Promise<string>;
}

export const LECTURE_VIDE: LectureSignal = { statut: 'inconnu', resume: '', mesures: [], lignes: [], lien: null, verifie: [] };
