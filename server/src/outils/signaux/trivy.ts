import { LECTURE_VIDE, type SourceSignal } from './signal';

// À écrire : Trivy / Grype.
export const trivy: SourceSignal = {
  cle: 'trivy',
  nom: 'Trivy / Grype',
  categorie: 'vulnerabilites',
  variables: 'TRIVY_RAPPORT',
  url: () => null,
  configure: () => false,
  lire: async () => LECTURE_VIDE,
  demo: () => LECTURE_VIDE,
};
