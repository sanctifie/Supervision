import {
  Activity,
  Archive,
  Bell,
  Boxes,
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

/** Le menu : une entrée par vue, rangées comme dans le guide. */
export interface DescriptionPage {
  chemin: string;
  titre: string;
  description: string;
  groupe: string;
  icone: LucideIcon;
  /** Le domaine de l'état global dont le voyant s'affiche dans le menu. */
  domaine?: string;
  motsCles?: string;
}

export const PAGES: DescriptionPage[] = [
  { chemin: '/', titre: 'Tableau de bord', description: 'L’état global, lisible en 3 secondes.', groupe: 'Vue d’ensemble', icone: LayoutDashboard, motsCles: 'accueil direction vert orange rouge slo' },
  { chemin: '/serveur', titre: 'Serveur', description: 'Processeur, mémoire, disques, réseau, horloge — avec les seuils du guide.', groupe: 'Infrastructure', icone: Cpu, domaine: 'serveur', motsCles: 'cpu ram disque inodes réseau ntp uptime' },
  { chemin: '/conteneurs', titre: 'Conteneurs', description: 'Chaque conteneur Docker : consommation, limites, redémarrages.', groupe: 'Infrastructure', icone: Boxes, domaine: 'conteneurs', motsCles: 'docker cadvisor' },
  { chemin: '/services', titre: 'Services et sondes', description: 'Les 15 services répondent-ils ? Le site est-il joignable en HTTPS ?', groupe: 'Infrastructure', icone: Radar, domaine: 'services', motsCles: 'health blackbox ssl certificat disponibilité sonde' },
  { chemin: '/bdd', titre: 'Base de données', description: 'PostgreSQL : connexions, cache, verrous, taille des bases.', groupe: 'Infrastructure', icone: Database, domaine: 'bdd', motsCles: 'postgres postgresql' },
  { chemin: '/sauvegardes', titre: 'Sauvegardes', description: 'La dernière sauvegarde, sa taille, et le test de restauration.', groupe: 'Infrastructure', icone: Archive, domaine: 'sauvegardes', motsCles: 'backup restauration' },
  { chemin: '/application', titre: 'API', description: 'Métriques RED par service : débit, erreurs, latence — et le runtime Node.js.', groupe: 'Application', icone: Activity, domaine: 'application', motsCles: 'red latence p95 erreurs 5xx node event loop' },
  { chemin: '/metier', titre: 'Métier', description: 'Les ventes et les connexions : souvent les signaux les plus parlants.', groupe: 'Application', icone: ShoppingBag, domaine: 'metier', motsCles: 'ventes paiements' },
  { chemin: '/journaux', titre: 'Journaux', description: 'Les journaux de tous les conteneurs, filtrables (Loki).', groupe: 'Application', icone: ScrollText, motsCles: 'logs loki erreurs' },
  { chemin: '/alertes', titre: 'Alertes', description: 'Ce qui sonne maintenant, les silences, et un runbook par alerte.', groupe: 'Réagir', icone: Bell, motsCles: 'alertmanager silence runbook telegram' },
  { chemin: '/incidents', titre: 'Incidents', description: 'Détection → acquittement → résolution → post-mortem. MTTA et MTTR.', groupe: 'Réagir', icone: Siren, motsCles: 'mtta mttr post-mortem astreinte' },
  { chemin: '/securite', titre: 'Sécurité', description: 'Accès, réseau, détection, vulnérabilités, données.', groupe: 'Améliorer', icone: ShieldCheck, domaine: 'securite', motsCles: 'ssh fail2ban crowdsec cve trivy' },
  { chemin: '/automatisations', titre: 'Automatisations', description: 'Ce qui tourne tout seul côté serveur, et le pipeline CI/CD.', groupe: 'Améliorer', icone: Workflow, motsCles: 'ci cd pipeline ansible terraform' },
  { chemin: '/feuille-de-route', titre: 'Feuille de route', description: 'Les 5 phases du guide et la checklist avant mise en production.', groupe: 'Améliorer', icone: Flag, motsCles: 'checklist phases roadmap' },
];
