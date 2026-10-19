/**
 * Le suivi des déploiements (inspiré d'Argo CD) : la version qui tourne, la
 * version prévue par un changement, l'écart entre les deux, l'historique.
 */

/** Une version vue en production pour un service (CI). */
export interface Deploiement {
  ci: string;
  version: string;
  image: string;
  le: number;
  /** Changement qui couvrait ce déploiement ; null = déploiement hors changement. */
  changement: string | null;
  /** Première observation : on ne sait pas d'où l'on vient. */
  initial?: boolean;
}

/** À jour · en attente de déploiement (changement prévu) · écart non prévu · aucune version prévue. */
export type EtatSynchro = 'synchronise' | 'a-deployer' | 'ecart' | 'non-suivi';

/** Santé du service, comme dans Argo CD : déploiement en cours, sain, dégradé, absent (arrêté), inconnu. */
export type SanteDeploiement = 'en-cours' | 'sain' | 'degrade' | 'absent' | 'inconnu';

/** Ce que Prometheus voit tourner pour un service. */
export interface ImageEnMarche {
  image: string;
  /** Projet Docker Compose du conteneur (l'application à laquelle il appartient). */
  projet: string | null;
}

export type DeploiementVue = Deploiement & { changementTitre: string | null };

export interface VueDeploiement {
  ci: string;
  projet: string | null;
  image: string | null;
  version: string | null;
  enMarche: boolean | null;
  sante: SanteDeploiement;
  prevue: string | null;
  changementPrevu: string | null;
  titrePrevu: string | null;
  synchro: EtatSynchro;
  /** Du plus récent au plus ancien. */
  historique: DeploiementVue[];
}

export const LIBELLE_SYNCHRO: Record<EtatSynchro, string> = {
  synchronise: 'À jour',
  'a-deployer': 'À déployer',
  ecart: 'Écart',
  'non-suivi': 'Non suivi',
};

/** « registry/officina/sales:1.8.3 » → « 1.8.3 » ; une empreinte devient « sha256:abcdef123456 ». */
export function versionDeImage(image: string): string {
  const [base, empreinte] = image.split('@');
  const apresDernierSlash = base.slice(base.lastIndexOf('/') + 1);
  const tag = apresDernierSlash.includes(':') ? apresDernierSlash.split(':')[1] : '';
  if (tag) return tag;
  return empreinte ? empreinte.slice(0, 19) : 'latest';
}
