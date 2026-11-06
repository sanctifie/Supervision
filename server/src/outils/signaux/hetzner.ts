import { LECTURE_VIDE, type SourceSignal } from './signal';

// À écrire : Hetzner Cloud.
export const hetzner: SourceSignal = {
  cle: 'hetzner',
  nom: 'Hetzner Cloud',
  categorie: 'infrastructure',
  variables: 'HETZNER_JETON',
  url: () => null,
  configure: () => false,
  lire: async () => LECTURE_VIDE,
  demo: () => LECTURE_VIDE,
};
