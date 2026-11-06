import { LECTURE_VIDE, type SourceSignal } from './signal';

// À écrire : Lynis.
export const lynis: SourceSignal = {
  cle: 'lynis',
  nom: 'Lynis',
  categorie: 'vulnerabilites',
  variables: 'LYNIS_RAPPORT',
  url: () => null,
  configure: () => false,
  lire: async () => LECTURE_VIDE,
  demo: () => LECTURE_VIDE,
};
