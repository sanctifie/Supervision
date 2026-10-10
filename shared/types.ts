/**
 * Le modèle partagé entre le serveur de supervision et l'interface.
 *
 * Les « fournisseurs » (Prometheus réel ou démonstration) livrent des valeurs
 * brutes ; le module `analyse` les compare aux seuils du guide et les
 * transforme en mesures colorées (vert / orange / rouge) que l'interface
 * affiche telles quelles.
 */

export type Statut = 'vert' | 'orange' | 'rouge' | 'inconnu';
export type Priorite = 'P1' | 'P2' | 'P3' | 'Info';
export type Mode = 'reel' | 'demo';

/** Un point de série : horodatage en millisecondes, valeur. */
export interface Point {
  t: number;
  v: number;
}

export interface Serie {
  nom: string;
  points: Point[];
}

/** Une mesure affichable, déjà comparée à ses seuils. */
export interface Mesure {
  cle: string;
  libelle: string;
  valeur: number | null;
  unite: string;
  statut: Statut;
  /** Ce qu'on mesure, en une phrase. */
  detail?: string;
  seuilWarning?: string;
  seuilCritique?: string;
}

// ---------------------------------------------------------------------------
// Valeurs brutes livrées par les fournisseurs
// ---------------------------------------------------------------------------

export interface BrutPartition {
  point: string;
  utilisePct: number | null;
  inodesPct: number | null;
  tailleOctets: number | null;
  /** Jours avant d'être plein au rythme des 6 dernières heures (null : ne se remplit pas). */
  joursAvantPlein: number | null;
}

export interface BrutServeur {
  hote: string;
  coeurs: number | null;
  cpuPct: number | null;
  iowaitPct: number | null;
  stealPct: number | null;
  chargeParCoeur: number | null;
  memoirePct: number | null;
  memoireTotaleOctets: number | null;
  swapPct: number | null;
  oom1h: number | null;
  partitions: BrutPartition[];
  disqueLatenceMs: number | null;
  disqueOccupePct: number | null;
  descripteursPct: number | null;
  processus: number | null;
  zombies: number | null;
  uptimeSecondes: number | null;
  redemarrageRequis: boolean | null;
  derivHorlogeSecondes: number | null;
  horlogeSynchronisee: boolean | null;
  reseau: {
    entreeOctetsS: number | null;
    sortieOctetsS: number | null;
    erreursS: number | null;
    pertesS: number | null;
    tcpEtablies: number | null;
    tcpTimeWait: number | null;
  };
  series: {
    cpu: Point[];
    memoire: Point[];
    disque: Point[];
    reseauEntree: Point[];
    reseauSortie: Point[];
  };
}

export interface BrutConteneur {
  nom: string;
  cpuPct: number | null;
  memoireOctets: number | null;
  limiteOctets: number | null;
  redemarrages1h: number | null;
  enMarche: boolean;
}

export interface BrutSondeInterne {
  service: string;
  ok: boolean | null;
  dureeMs: number | null;
}

export interface BrutSondePublique {
  url: string;
  ok: boolean | null;
  code: number | null;
  dureeMs: number | null;
  joursCertificat: number | null;
}

export interface BrutServices {
  internes: BrutSondeInterne[];
  publiques: BrutSondePublique[];
  /** Disponibilité du site public sur 30 jours (0..1). */
  disponibilite30j: number | null;
  serieDisponibilite: Point[];
}

export interface BrutRouteService {
  service: string;
  debitRps: number | null;
  /** Part des réponses 5xx (0..1). */
  erreurs5xx: number | null;
  /** Part des réponses 401/403/429 (0..1). */
  refus4xx: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface BrutApplication {
  routes: BrutRouteService[];
  debitTotalRps: number | null;
  debitJ7Rps: number | null;
  runtime: {
    eventLoopLagS: number | null;
    heapOctets: number | null;
    memoireOctets: number | null;
    handles: number | null;
    gcSecondesParS: number | null;
    redemarrages24h: number | null;
  };
  series: {
    debit: Point[];
    debitJ7: Point[];
    erreurs: Point[];
    p95: Point[];
  };
}

export interface BrutBdd {
  enMarche: boolean | null;
  connexions: number | null;
  connexionsMax: number | null;
  deadlocksParMin: number | null;
  cacheHit: number | null;
  verrous: number | null;
  bases: { nom: string; tailleOctets: number }[];
  serieConnexions: Point[];
}

export interface BrutMetier {
  ventesHeure: number | null;
  ventesJour: number | null;
  ventesJ7MemeHeure: number | null;
  connexionsRefusees1h: number | null;
  serieVentes: Point[];
  serieVentesJ7: Point[];
}

export interface BrutSauvegardes {
  derniereReussite: number | null;
  tailleOctets: number | null;
}

export interface BrutAlerte {
  id: string;
  nom: string;
  gravite: string;
  priorite?: string;
  resume: string;
  action: string;
  debut: number;
  labels: Record<string, string>;
  silencieuse: boolean;
}

export interface Silence {
  id: string;
  commentaire: string;
  auteur: string;
  debut: number;
  fin: number;
  correspondances: { nom: string; valeur: string }[];
}

export interface LigneJournal {
  t: number;
  service: string;
  niveau: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

export interface FiltreJournaux {
  service?: string;
  niveau?: string;
  texte?: string;
  minutes?: number;
  limite?: number;
}

// ---------------------------------------------------------------------------
// Réponses de l'API (ce que voit l'interface)
// ---------------------------------------------------------------------------

export interface EtatSources {
  mode: Mode;
  prometheus: boolean;
  alertmanager: boolean;
  loki: boolean;
  grafanaUrl: string | null;
}

export interface Domaine {
  cle: string;
  libelle: string;
  statut: Statut;
  resume: string;
  lien: string;
}

export interface Evenement {
  t: number;
  type: 'alerte' | 'incident' | 'resolution' | 'sauvegarde' | 'deploiement' | 'info';
  titre: string;
  detail: string;
  statut: Statut;
}

export interface Kpi {
  cle: string;
  libelle: string;
  valeur: string;
  sousTexte: string;
  statut: Statut;
  tendance: Point[];
}

export interface VueEtat {
  majLe: number;
  sources: EtatSources;
  statut: Statut;
  raison: string;
  kpis: Kpi[];
  domaines: Domaine[];
  trafic: { debit: Point[]; debitJ7: Point[] };
  activite: Evenement[];
  services: { nom: string; statut: Statut; detail: string }[];
  slo: { objectif: number; disponibilite: number | null; budgetConsomme: number | null };
}

export interface VueServeur {
  hote: string;
  statut: Statut;
  groupes: { titre: string; mesures: Mesure[] }[];
  partitions: (BrutPartition & { statut: Statut })[];
  series: BrutServeur['series'];
  memoireTotaleOctets: number | null;
  coeurs: number | null;
}

export interface VueConteneurs {
  statut: Statut;
  conteneurs: (BrutConteneur & { statut: Statut; memoirePctLimite: number | null })[];
}

export interface VueServices {
  statut: Statut;
  internes: (BrutSondeInterne & { statut: Statut })[];
  publiques: (BrutSondePublique & { statut: Statut; statutCertificat: Statut })[];
  disponibilite30j: number | null;
  serieDisponibilite: Point[];
}

export interface VueApplication {
  statut: Statut;
  routes: (BrutRouteService & { statut: Statut })[];
  resume: Mesure[];
  runtime: Mesure[];
  series: BrutApplication['series'];
}

export interface VueBdd {
  statut: Statut;
  mesures: Mesure[];
  bases: { nom: string; tailleOctets: number }[];
  serieConnexions: Point[];
}

export interface VueMetier {
  statut: Statut;
  mesures: Mesure[];
  anomalie: string | null;
  serieVentes: Point[];
  serieVentesJ7: Point[];
}

export interface VueSauvegardes {
  statut: Statut;
  mesures: Mesure[];
  derniereReussite: number | null;
}

export interface Controle {
  cle: string;
  couche: string;
  libelle: string;
  statut: Statut;
  detail: string;
  outil: string;
}

export interface VueSecurite {
  statut: Statut;
  mesures: Mesure[];
  controles: Controle[];
}

export interface Alerte extends BrutAlerte {
  priorite: Priorite;
  runbook: string | null;
}

export interface VueAlertes {
  alertes: Alerte[];
  silences: Silence[];
}

export type StatutIncident = 'ouvert' | 'acquitte' | 'resolu';

export interface NoteIncident {
  t: number;
  auteur: string;
  texte: string;
}

export interface Incident {
  id: string;
  titre: string;
  priorite: Priorite;
  statut: StatutIncident;
  detecteLe: number;
  acquitteLe: number | null;
  resoluLe: number | null;
  alertes: string[];
  journal: NoteIncident[];
  postMortem: string;
  automatique: boolean;
}

export interface ElementChecklist {
  id: string;
  libelle: string;
  phase: number;
  /** Vérifié automatiquement à partir des mesures, si possible. */
  auto: Statut | null;
  autoDetail: string | null;
  coche: boolean;
  cocheLe: number | null;
  note: string;
}

export interface Phase {
  numero: number;
  titre: string;
  periode: string;
  objectif: string;
  livrables: string[];
}

export interface VueFeuilleDeRoute {
  phases: Phase[];
  checklist: ElementChecklist[];
  avancement: number;
}

export interface Automatisation {
  cle: string;
  domaine: string;
  libelle: string;
  outil: string;
  statut: Statut;
  detail: string;
  commande: string | null;
}

export interface VueAutomatisations {
  serveur: Automatisation[];
  pipeline: { cle: string; etape: string; contenu: string; bloquant: string; statut: Statut }[];
}
