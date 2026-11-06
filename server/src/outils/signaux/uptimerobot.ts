import { LECTURE_VIDE, type SourceSignal } from './signal';

// À écrire : UptimeRobot.
export const uptimerobot: SourceSignal = {
  cle: 'uptimerobot',
  nom: 'UptimeRobot',
  categorie: 'sondes',
  variables: 'UPTIMEROBOT_CLE',
  url: () => null,
  configure: () => false,
  lire: async () => LECTURE_VIDE,
  demo: () => LECTURE_VIDE,
};
