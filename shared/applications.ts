/**
 * Une application supervisée : un ensemble d'éléments (services, serveurs, bases…)
 * qu'on déclare soi-même. Tickets, journaux et déploiements s'y rattachent.
 */
export interface Application {
  /** Identifiant lisible tiré du nom (« officina »), stable. */
  id: string;
  nom: string;
  description: string;
  /** Projet Docker Compose de ses conteneurs, pour rattacher les déploiements. */
  projet: string | null;
  /** Éléments de configuration (CI) : un élément n'appartient qu'à une application. */
  services: string[];
  creeLe: number;
  par: string;
}

export interface VueApplication extends Application {
  /** Tickets ouverts rattachés. */
  ouverts: number;
}

/** « Mon Appli n°2 » → « mon-appli-n-2 ». */
export function identifiantDe(nom: string): string {
  const id = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return id || 'application';
}
