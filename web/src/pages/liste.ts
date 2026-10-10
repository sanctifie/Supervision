import {
  Activity,
  Archive,
  Bell,
  Boxes,
  ClipboardList,
  GitPullRequest,
  Headset,
  Users,
  Wrench,
  Cpu,
  Database,
  Flag,
  LayoutDashboard,
  Radar,
  ScrollText,
  ShieldCheck,
  ShoppingBag,
  Siren,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '../../../shared/comptes';

/** Le menu : une entrée par vue, rangées comme dans le guide. */
export interface DescriptionPage {
  chemin: string;
  titre: string;
  description: string;
  groupe: string;
  icone: LucideIcon;
  /** Le domaine de l'état global dont le voyant s'affiche dans le menu. */
  domaine?: string;
  /** Compteur ITSM affiché dans le menu (clé de /itsm/tableau → compteurs). */
  compteur?: 'incidents' | 'problemes' | 'changements' | 'demandes';
  /** Page sans entrée de menu (fiche ticket, création). */
  cachee?: boolean;
  /** Permission nécessaire pour voir l'entrée du menu. */
  permission?: Permission;
  motsCles?: string;
}

export const PAGES: DescriptionPage[] = [
  {
    chemin: '/',
    titre: 'Tableau de bord',
    description: 'L’état global, lisible en 3 secondes.',
    groupe: 'Vue d’ensemble',
    icone: LayoutDashboard,
    motsCles: 'accueil direction vert orange rouge slo',
  },
  {
    chemin: '/itsm',
    titre: 'Service desk',
    description: 'Mes tickets, les incidents majeurs, les SLA, les changements à venir.',
    groupe: 'Service desk',
    icone: Headset,
    motsCles: 'itsm accueil tickets sla mes tickets',
  },
  {
    chemin: '/incidents',
    titre: 'Incidents',
    description: 'Rétablir le service au plus vite : P1 à P4, SLA, résolution, post-mortem.',
    groupe: 'Service desk',
    icone: Siren,
    compteur: 'incidents',
    motsCles: 'inc incident panne p1 p2 mtta mttr',
  },
  {
    chemin: '/problemes',
    titre: 'Problèmes',
    description: 'Trouver la cause racine des incidents qui reviennent ; erreurs connues et contournements.',
    groupe: 'Service desk',
    icone: Wrench,
    compteur: 'problemes',
    motsCles: 'prb problème cause racine erreur connue',
  },
  {
    chemin: '/changements',
    titre: 'Changements',
    description: 'Planifier, approuver (CAB) et mener les changements ; calendrier et retours arrière.',
    groupe: 'Service desk',
    icone: GitPullRequest,
    compteur: 'changements',
    motsCles: 'chg changement cab déploiement calendrier rfc',
  },
  {
    chemin: '/demandes',
    titre: 'Demandes',
    description: 'Les demandes de service : comptes, postes, paramétrage, formation.',
    groupe: 'Service desk',
    icone: ClipboardList,
    compteur: 'demandes',
    motsCles: 'req demande service compte',
  },
  {
    chemin: '/equipe',
    titre: 'Équipe',
    description: 'Les personnes assignables et les groupes d’affectation.',
    groupe: 'Service desk',
    icone: Users,
    permission: 'agir',
    motsCles: 'membres groupes affectation',
  },
  { chemin: '/profil', titre: 'Mon profil', description: 'Coordonnées, notifications et mot de passe.', groupe: 'Service desk', icone: Users, cachee: true },
  { chemin: '/tickets', titre: 'Ticket', description: 'Fiche du ticket.', groupe: 'Service desk', icone: ClipboardList, cachee: true },
  {
    chemin: '/serveur',
    titre: 'Serveur',
    description: 'Processeur, mémoire, disques, réseau, horloge — avec les seuils du guide.',
    groupe: 'Infrastructure',
    icone: Cpu,
    domaine: 'serveur',
    motsCles: 'cpu ram disque inodes réseau ntp uptime',
  },
  {
    chemin: '/conteneurs',
    titre: 'Conteneurs',
    description: 'Chaque conteneur Docker : consommation, limites, redémarrages.',
    groupe: 'Infrastructure',
    icone: Boxes,
    domaine: 'conteneurs',
    motsCles: 'docker cadvisor',
  },
  {
    chemin: '/services',
    titre: 'Services et sondes',
    description: 'Les 15 services répondent-ils ? Le site est-il joignable en HTTPS ?',
    groupe: 'Infrastructure',
    icone: Radar,
    domaine: 'services',
    motsCles: 'health blackbox ssl certificat disponibilité sonde',
  },
  {
    chemin: '/bdd',
    titre: 'Base de données',
    description: 'PostgreSQL : connexions, cache, verrous, taille des bases.',
    groupe: 'Infrastructure',
    icone: Database,
    domaine: 'bdd',
    motsCles: 'postgres postgresql',
  },
  {
    chemin: '/sauvegardes',
    titre: 'Sauvegardes',
    description: 'La dernière sauvegarde, sa taille, et le test de restauration.',
    groupe: 'Infrastructure',
    icone: Archive,
    domaine: 'sauvegardes',
    motsCles: 'backup restauration',
  },
  {
    chemin: '/application',
    titre: 'API',
    description: 'Métriques RED par service : débit, erreurs, latence — et le runtime Node.js.',
    groupe: 'Application',
    icone: Activity,
    domaine: 'application',
    motsCles: 'red latence p95 erreurs 5xx node event loop',
  },
  {
    chemin: '/metier',
    titre: 'Métier',
    description: 'Les ventes et les connexions : souvent les signaux les plus parlants.',
    groupe: 'Application',
    icone: ShoppingBag,
    domaine: 'metier',
    motsCles: 'ventes paiements',
  },
  {
    chemin: '/journaux',
    titre: 'Journaux',
    description: 'Les journaux de tous les conteneurs, filtrables (Loki).',
    groupe: 'Application',
    icone: ScrollText,
    motsCles: 'logs loki erreurs',
  },
  {
    chemin: '/alertes',
    titre: 'Alertes',
    description: 'Ce qui sonne maintenant, les silences, et un runbook par alerte.',
    groupe: 'Réagir',
    icone: Bell,
    motsCles: 'alertmanager silence runbook telegram',
  },
  {
    chemin: '/securite',
    titre: 'Sécurité',
    description: 'Accès, réseau, détection, vulnérabilités, données.',
    groupe: 'Améliorer',
    icone: ShieldCheck,
    domaine: 'securite',
    motsCles: 'ssh fail2ban crowdsec cve trivy',
  },
  {
    chemin: '/automatisations',
    titre: 'Automatisations',
    description: 'Ce qui tourne tout seul côté serveur, et le pipeline CI/CD.',
    groupe: 'Améliorer',
    icone: Workflow,
    motsCles: 'ci cd pipeline ansible terraform',
  },
  {
    chemin: '/feuille-de-route',
    titre: 'Feuille de route',
    description: 'Les 5 phases du guide et la checklist avant mise en production.',
    groupe: 'Améliorer',
    icone: Flag,
    motsCles: 'checklist phases roadmap',
  },
];
