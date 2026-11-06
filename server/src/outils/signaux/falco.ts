import { LECTURE_VIDE, type SourceSignal } from './signal';

// À écrire : Falco.
export const falco: SourceSignal = {
  cle: 'falco',
  nom: 'Falco',
  categorie: 'securite',
  variables: 'FALCO_METRICS_URL',
  url: () => null,
  configure: () => false,
  lire: async () => LECTURE_VIDE,
  demo: () => LECTURE_VIDE,
};
