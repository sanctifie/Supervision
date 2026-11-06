import { LECTURE_VIDE, type SourceSignal } from './signal';

// À écrire : AIDE.
export const aide: SourceSignal = {
  cle: 'aide',
  nom: 'AIDE',
  categorie: 'securite',
  variables: 'AIDE_RAPPORT',
  url: () => null,
  configure: () => false,
  lire: async () => LECTURE_VIDE,
  demo: () => LECTURE_VIDE,
};
