import { LECTURE_VIDE, type SourceSignal } from './signal';

// À écrire : Wazuh.
export const wazuh: SourceSignal = {
  cle: 'wazuh',
  nom: 'Wazuh',
  categorie: 'securite',
  variables: 'WAZUH_URL, WAZUH_UTILISATEUR, WAZUH_MOT_DE_PASSE',
  url: () => null,
  configure: () => false,
  lire: async () => LECTURE_VIDE,
  demo: () => LECTURE_VIDE,
};
