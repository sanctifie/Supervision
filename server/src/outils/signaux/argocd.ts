import { LECTURE_VIDE, type SourceSignal } from './signal';

// À écrire : Argo CD.
export const argocd: SourceSignal = {
  cle: 'argocd',
  nom: 'Argo CD',
  categorie: 'gitops',
  variables: 'ARGOCD_URL, ARGOCD_JETON',
  url: () => null,
  configure: () => false,
  lire: async () => LECTURE_VIDE,
  demo: () => LECTURE_VIDE,
};
