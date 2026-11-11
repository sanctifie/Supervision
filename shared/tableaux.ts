import type { Point } from './types';

/** Tableaux de bord personnalisés : des panneaux qui tracent une requête PromQL. */

export type TypePanneau = 'courbe' | 'valeur';

export interface Panneau {
  id: string;
  titre: string;
  type: TypePanneau;
  /** Requête PromQL, lue dans Prometheus. */
  requete: string;
  unite: string;
}

export interface TableauPerso {
  id: string;
  nom: string;
  panneaux: Panneau[];
}

export interface SeriePanneau {
  nom: string;
  points: Point[];
}

export interface VueTableau {
  tableau: TableauPerso;
  /** Par identifiant de panneau : ses séries, ou le message d'erreur de la requête. */
  donnees: Record<string, { series: SeriePanneau[]; erreur: string | null }>;
}

export const PERIODES: { heures: number; libelle: string }[] = [
  { heures: 1, libelle: '1 h' },
  { heures: 6, libelle: '6 h' },
  { heures: 24, libelle: '24 h' },
  { heures: 168, libelle: '7 j' },
];

/** Des requêtes prêtes à l'emploi (exporteurs installés par la supervision d'Officina). */
export const EXEMPLES_REQUETES = [
  '100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100',
  '100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)',
  '100 * (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})',
  'sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[5m])) * 100',
  'sum by (name) (container_memory_working_set_bytes{name!=""})',
  'sum(rate(http_requests_total[5m]))',
  'pg_stat_activity_count',
  'up',
];
