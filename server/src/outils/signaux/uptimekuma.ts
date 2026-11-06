import { LECTURE_VIDE, type SourceSignal } from './signal';

// À écrire : Uptime Kuma.
export const uptimekuma: SourceSignal = {
  cle: 'uptimekuma',
  nom: 'Uptime Kuma',
  categorie: 'sondes',
  variables: 'UPTIMEKUMA_URL, UPTIMEKUMA_CLE',
  url: () => null,
  configure: () => false,
  lire: async () => LECTURE_VIDE,
  demo: () => LECTURE_VIDE,
};
