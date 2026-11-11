import type { Statut } from './types';

/**
 * Les outils externes reliés à la supervision. Chaque connecteur lit l'API
 * publique et documentée de l'outil avec un jeton en lecture seule.
 */

export type Outil = 'jira' | 'gitlab' | 'sonarqube' | 'awx' | 'zabbix' | 'grafana' | 'controlm';

export interface DescriptionOutil {
  cle: Outil;
  nom: string;
  /** Ce que la supervision y lit. */
  contenu: string;
  exempleUrl: string;
  aideJeton: string;
  /** Jira Cloud : adresse e-mail du compte, en plus du jeton. */
  utilisateur?: string;
}

export const OUTILS: DescriptionOutil[] = [
  {
    cle: 'jira',
    nom: 'Jira',
    contenu: 'Tickets modifiés depuis 30 jours',
    exempleUrl: 'https://monequipe.atlassian.net',
    aideJeton: 'Jira Cloud : jeton d’API + e-mail du compte. Jira Data Center : jeton d’accès personnel, sans e-mail.',
    utilisateur: 'E-mail du compte (Jira Cloud seulement)',
  },
  {
    cle: 'gitlab',
    nom: 'GitLab',
    contenu: 'Dernier pipeline des 20 projets les plus actifs',
    exempleUrl: 'https://gitlab.exemple.fr',
    aideJeton: 'Jeton d’accès avec la portée read_api.',
  },
  {
    cle: 'sonarqube',
    nom: 'SonarQube',
    contenu: 'Porte qualité, bugs, vulnérabilités et couverture par projet',
    exempleUrl: 'https://sonar.exemple.fr',
    aideJeton: 'Jeton utilisateur (Mon compte → Sécurité).',
  },
  {
    cle: 'awx',
    nom: 'AWX',
    contenu: 'Dernières exécutions de jobs Ansible',
    exempleUrl: 'https://awx.exemple.fr',
    aideJeton: 'Jeton OAuth2 personnel, portée Lecture.',
  },
  {
    cle: 'zabbix',
    nom: 'Zabbix',
    contenu: 'Problèmes en cours',
    exempleUrl: 'https://zabbix.exemple.fr',
    aideJeton: 'Jeton d’API (Zabbix 6.4 ou plus récent).',
  },
  {
    cle: 'grafana',
    nom: 'Grafana',
    contenu: 'Tableaux de bord',
    exempleUrl: 'https://grafana.exemple.fr',
    aideJeton: 'Jeton de compte de service, rôle Viewer.',
  },
  {
    cle: 'controlm',
    nom: 'Control-M',
    contenu: 'État des jobs ordonnancés',
    exempleUrl: 'https://controlm.exemple.fr:8443',
    aideJeton: 'Jeton d’API de Control-M Automation API (9.0.21 ou plus récent).',
  },
];

/** Une ligne lue dans un outil : ticket, pipeline, projet, job, problème, tableau. */
export interface ElementExterne {
  id: string;
  titre: string;
  detail: string;
  /** L'état tel que l'outil le nomme (« Ended Not OK », « failed »…). */
  etat: string;
  /** bleu : en cours, ni bon ni mauvais. */
  statut: Statut | 'bleu';
  lien: string | null;
  le: number | null;
}

/** Ce que l'interface voit d'un connecteur : jamais le jeton. */
export interface VueConnecteur extends DescriptionOutil {
  configure: boolean;
  url: string;
  identifiant: string;
  actif: boolean;
}

export interface LectureConnecteur {
  elements: ElementExterne[];
  erreur: string | null;
  luLe: number;
}
