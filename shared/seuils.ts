import type { Statut } from './types';

/**
 * Les seuils du guide « Automatisation & Supervision » (chapitres 2 et 3),
 * en un seul endroit. `warning` donne l'orange, `critique` le rouge.
 * `sens: 'bas'` : la valeur est mauvaise quand elle descend (jours avant
 * expiration, taux de cache…).
 */
export interface Seuil {
  warning: number;
  critique: number;
  sens?: 'haut' | 'bas';
  unite: string;
  libelleWarning: string;
  libelleCritique: string;
}

export const SEUILS = {
  cpu: { warning: 80, critique: 95, unite: '%', libelleWarning: '> 80 % sur 10 min', libelleCritique: '> 95 % sur 5 min' },
  memoire: { warning: 85, critique: 95, unite: '%', libelleWarning: '> 85 %', libelleCritique: '> 95 % ou OOM détecté' },
  disque: { warning: 80, critique: 90, unite: '%', libelleWarning: '> 80 %', libelleCritique: '> 90 % ou plein dans < 24 h' },
  inodes: { warning: 80, critique: 90, unite: '%', libelleWarning: '> 80 %', libelleCritique: '> 90 %' },
  disqueLatence: { warning: 20, critique: 100, unite: 'ms', libelleWarning: 'latence > 20 ms', libelleCritique: '> 100 ms ou erreurs SMART' },
  descripteurs: { warning: 80, critique: 95, unite: '%', libelleWarning: '> 80 % de la limite', libelleCritique: '> 95 %' },
  horloge: { warning: 0.1, critique: 1, unite: 's', libelleWarning: '> 100 ms', libelleCritique: '> 1 s' },
  charge: { warning: 1.5, critique: 3, unite: '/cœur', libelleWarning: '> 1,5 par cœur', libelleCritique: '> 3 par cœur' },
  swap: { warning: 50, critique: 80, unite: '%', libelleWarning: '> 50 %', libelleCritique: '> 80 %' },
  erreurs5xx: { warning: 1, critique: 5, unite: '%', libelleWarning: '5xx > 1 % sur 5 min', libelleCritique: '5xx > 5 %' },
  latenceP95: { warning: 800, critique: 2000, unite: 'ms', libelleWarning: 'p95 > 800 ms sur 10 min', libelleCritique: 'p95 > 2 s' },
  eventLoop: { warning: 100, critique: 500, unite: 'ms', libelleWarning: '> 100 ms', libelleCritique: '> 500 ms' },
  connexionsBdd: { warning: 80, critique: 90, unite: '%', libelleWarning: '> 80 % du maximum', libelleCritique: 'pool > 90 % occupé' },
  cacheHit: { warning: 95, critique: 90, sens: 'bas', unite: '%', libelleWarning: '< 95 %', libelleCritique: '< 90 %' },
  certificat: { warning: 30, critique: 7, sens: 'bas', unite: 'j', libelleWarning: 'J-30 / J-14', libelleCritique: 'J-7' },
  sauvegarde: { warning: 26, critique: 48, unite: 'h', libelleWarning: 'plus de 26 h', libelleCritique: 'plus de 48 h' },
  memoireConteneur: { warning: 85, critique: 95, unite: '%', libelleWarning: '> 85 % de la limite', libelleCritique: '> 95 % de la limite' },
  chuteTrafic: { warning: 50, critique: 80, unite: '%', libelleWarning: 'chute > 50 % vs J-7', libelleCritique: 'chute > 80 % vs J-7' },
  connexionsRefusees: { warning: 20, critique: 100, unite: '/h', libelleWarning: '> 20 par heure', libelleCritique: '> 100 par heure' },
} satisfies Record<string, Seuil>;

export type CleSeuil = keyof typeof SEUILS;

/** Compare une valeur à son seuil. `null` (non mesuré) donne « inconnu ». */
export function evaluer(valeur: number | null | undefined, seuil: Seuil): Statut {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) return 'inconnu';
  if (seuil.sens === 'bas') {
    if (valeur <= seuil.critique) return 'rouge';
    if (valeur <= seuil.warning) return 'orange';
    return 'vert';
  }
  if (valeur >= seuil.critique) return 'rouge';
  if (valeur >= seuil.warning) return 'orange';
  return 'vert';
}

const POIDS: Record<Statut, number> = { inconnu: 0, vert: 1, orange: 2, rouge: 3 };

/** Le pire de plusieurs statuts ; « inconnu » ne l'emporte que s'il est seul. */
export function pire(...statuts: Statut[]): Statut {
  let resultat: Statut = 'inconnu';
  for (const s of statuts) if (POIDS[s] > POIDS[resultat]) resultat = s;
  return resultat;
}

export const LIBELLE_STATUT: Record<Statut, string> = {
  vert: 'Nominal',
  orange: 'Dégradé',
  rouge: 'Incident',
  inconnu: 'Non mesuré',
};

/** Objectif de disponibilité du site (SLO), comme dans le guide : 99,5 %. */
export const SLO_DISPONIBILITE = 0.995;
