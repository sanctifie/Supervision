import type { CleOutil, DemandeFusion, EtatExecution, Execution, Lancable } from '../../../shared/outils';

/**
 * Ce qu'un outil d'orchestration sait faire. Trois implémentations réelles
 * (GitLab, AWX, Control-M) et une de démonstration, dans le même modèle.
 */
export interface Outil {
  readonly cle: CleOutil;
  readonly url: string | null;
  /** Les dernières exécutions, de la plus récente à la plus ancienne. */
  executions(): Promise<Execution[]>;
  /** Ce qu'on peut lancer (modèles AWX, branches GitLab) ; vide si rien. */
  lancables(): Promise<Lancable[]>;
  lancer(id: string): Promise<Execution>;
  relancer(id: string): Promise<Execution>;
  demandesFusion?(): Promise<DemandeFusion[]>;
}

/** Horodatage ISO (ou vide) → millisecondes, ou null. */
export function instant(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export const FINI: EtatExecution[] = ['succes', 'echec', 'annule'];
