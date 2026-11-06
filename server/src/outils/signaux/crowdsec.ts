import { LECTURE_VIDE, type SourceSignal } from './signal';

// À écrire : CrowdSec.
export const crowdsec: SourceSignal = {
  cle: 'crowdsec',
  nom: 'CrowdSec',
  categorie: 'securite',
  variables: 'CROWDSEC_URL, CROWDSEC_CLE',
  url: () => null,
  configure: () => false,
  lire: async () => LECTURE_VIDE,
  demo: () => LECTURE_VIDE,
};
