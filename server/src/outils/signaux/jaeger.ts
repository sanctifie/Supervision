import { LECTURE_VIDE, type SourceSignal } from './signal';

// À écrire : Jaeger.
export const jaeger: SourceSignal = {
  cle: 'jaeger',
  nom: 'Jaeger',
  categorie: 'traces',
  variables: 'JAEGER_URL, JAEGER_SERVICE',
  url: () => null,
  configure: () => false,
  lire: async () => LECTURE_VIDE,
  demo: () => LECTURE_VIDE,
};
