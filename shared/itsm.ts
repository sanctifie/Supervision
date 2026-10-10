/**
 * Le modèle ITSM (inspiré d'ITIL / ServiceNow) : incidents, problèmes,
 * changements et demandes. Partagé entre le serveur (règles) et l'interface
 * (formulaires, barres d'étapes).
 */

export type TypeTicket = 'incident' | 'probleme' | 'changement' | 'demande';
export type PrioriteTicket = 'P1' | 'P2' | 'P3' | 'P4';
/** 1 = élevé, 2 = moyen, 3 = faible. */
export type Niveau = 1 | 2 | 3;
export type TypeChangement = 'standard' | 'normal' | 'urgent';
export type Risque = 'faible' | 'moyen' | 'eleve';
export type ResultatChangement = 'reussi' | 'echoue' | 'retour-arriere';
export type EtatSla = 'ok' | 'a-risque' | 'depasse' | 'tenu' | 'non-applicable';

export interface ActiviteTicket {
  t: number;
  auteur: string;
  /** note : interne à l'équipe ; commentaire : visible du demandeur ; systeme : trace automatique. */
  type: 'note' | 'commentaire' | 'systeme';
  texte: string;
}

export interface Approbation {
  par: string;
  decision: 'approuve' | 'rejete';
  commentaire: string;
  le: number;
}

export interface Ticket {
  id: string;
  numero: string;
  type: TypeTicket;
  titre: string;
  description: string;
  statut: string;
  impact: Niveau;
  urgence: Niveau;
  priorite: PrioriteTicket;
  categorie: string;
  /** Élément de configuration touché (service, serveur, base…). */
  ci: string | null;
  groupe: string | null;
  assigneA: string | null;
  demandeur: string;
  creeLe: number;
  majLe: number;
  prisEnChargeLe: number | null;
  resoluLe: number | null;
  closLe: number | null;
  echeanceReponse: number | null;
  echeanceResolution: number | null;
  activite: ActiviteTicket[];
  /** Numéros des tickets liés (incident ↔ problème ↔ changement). */
  liens: string[];
  /** Empreintes des alertes Alertmanager à l'origine (incidents automatiques). */
  alertes: string[];
  automatique: boolean;

  // Incident
  codeResolution?: string;
  notesResolution?: string;
  postMortem?: string;

  // Problème
  causeRacine?: string;
  contournement?: string;

  // Changement
  typeChangement?: TypeChangement;
  risque?: Risque;
  justification?: string;
  planMiseEnOeuvre?: string;
  planRetourArriere?: string;
  planTest?: string;
  debutPrevu?: number | null;
  finPrevue?: number | null;
  approbations?: Approbation[];
  resultat?: ResultatChangement | null;
  /** Mettre en silence les alertes du CI pendant la fenêtre. */
  silencerAlertes?: boolean;
  silenceId?: string | null;
}

/** Version allégée pour les listes. */
export type TicketResume = Pick<
  Ticket,
  'id' | 'numero' | 'type' | 'titre' | 'statut' | 'priorite' | 'ci' | 'groupe' | 'assigneA' | 'demandeur' | 'creeLe' | 'majLe' | 'automatique' | 'typeChangement' | 'debutPrevu' | 'finPrevue' | 'risque'
> & { sla: EtatSla; echeance: number | null; liens: number };

export interface EtapeStatut {
  cle: string;
  libelle: string;
  /** Statut terminal (le ticket n'est plus « ouvert »). */
  final?: boolean;
  /** Hors du parcours normal (rejeté, annulé) : pas dans la barre d'étapes. */
  horsParcours?: boolean;
}

export const STATUTS: Record<TypeTicket, EtapeStatut[]> = {
  incident: [
    { cle: 'nouveau', libelle: 'Nouveau' },
    { cle: 'en-cours', libelle: 'En cours' },
    { cle: 'en-attente', libelle: 'En attente' },
    { cle: 'resolu', libelle: 'Résolu', final: true },
    { cle: 'clos', libelle: 'Clos', final: true },
    { cle: 'annule', libelle: 'Annulé', final: true, horsParcours: true },
  ],
  probleme: [
    { cle: 'nouveau', libelle: 'Nouveau' },
    { cle: 'analyse', libelle: 'Analyse' },
    { cle: 'erreur-connue', libelle: 'Erreur connue' },
    { cle: 'resolu', libelle: 'Résolu', final: true },
    { cle: 'clos', libelle: 'Clos', final: true },
    { cle: 'annule', libelle: 'Annulé', final: true, horsParcours: true },
  ],
  changement: [
    { cle: 'brouillon', libelle: 'Brouillon' },
    { cle: 'evaluation', libelle: 'Évaluation' },
    { cle: 'approuve', libelle: 'Approuvé' },
    { cle: 'planifie', libelle: 'Planifié' },
    { cle: 'en-cours', libelle: 'En cours' },
    { cle: 'revue', libelle: 'Revue' },
    { cle: 'clos', libelle: 'Clos', final: true },
    { cle: 'rejete', libelle: 'Rejeté', final: true, horsParcours: true },
    { cle: 'annule', libelle: 'Annulé', final: true, horsParcours: true },
  ],
  demande: [
    { cle: 'nouveau', libelle: 'Nouvelle' },
    { cle: 'en-cours', libelle: 'En cours' },
    { cle: 'en-attente', libelle: 'En attente' },
    { cle: 'resolu', libelle: 'Traitée', final: true },
    { cle: 'clos', libelle: 'Close', final: true },
    { cle: 'annule', libelle: 'Annulée', final: true, horsParcours: true },
  ],
};

/** Transitions permises : statut actuel → statuts suivants. */
export const TRANSITIONS: Record<TypeTicket, Record<string, string[]>> = {
  incident: {
    nouveau: ['en-cours', 'resolu', 'annule'],
    'en-cours': ['en-attente', 'resolu'],
    'en-attente': ['en-cours', 'resolu'],
    resolu: ['clos', 'en-cours'],
    clos: [],
    annule: [],
  },
  probleme: {
    nouveau: ['analyse', 'annule'],
    analyse: ['erreur-connue', 'resolu', 'annule'],
    'erreur-connue': ['resolu', 'analyse'],
    resolu: ['clos', 'analyse'],
    clos: [],
    annule: [],
  },
  changement: {
    brouillon: ['evaluation', 'planifie', 'annule'],
    evaluation: ['approuve', 'rejete', 'brouillon', 'annule'],
    approuve: ['planifie', 'annule'],
    planifie: ['en-cours', 'annule'],
    'en-cours': ['revue'],
    revue: ['clos'],
    clos: [],
    rejete: ['brouillon'],
    annule: [],
  },
  demande: {
    nouveau: ['en-cours', 'resolu', 'annule'],
    'en-cours': ['en-attente', 'resolu'],
    'en-attente': ['en-cours', 'resolu'],
    resolu: ['clos', 'en-cours'],
    clos: [],
    annule: [],
  },
};

export const PREFIXES: Record<TypeTicket, string> = { incident: 'INC', probleme: 'PRB', changement: 'CHG', demande: 'REQ' };

export const LIBELLE_TYPE: Record<TypeTicket, { un: string; des: string; nouveau: string }> = {
  incident: { un: 'Incident', des: 'Incidents', nouveau: 'Nouvel incident' },
  probleme: { un: 'Problème', des: 'Problèmes', nouveau: 'Nouveau problème' },
  changement: { un: 'Changement', des: 'Changements', nouveau: 'Nouveau changement' },
  demande: { un: 'Demande', des: 'Demandes', nouveau: 'Nouvelle demande' },
};

export const LIBELLE_NIVEAU: Record<Niveau, string> = { 1: '1 — Élevé', 2: '2 — Moyen', 3: '3 — Faible' };
export const AIDE_IMPACT: Record<Niveau, string> = {
  1: 'Toute l’officine ou plusieurs sites (caisse, paiements, synchronisation)',
  2: 'Un service ou un groupe de postes',
  3: 'Une personne ou un poste',
};
export const AIDE_URGENCE: Record<Niveau, string> = {
  1: 'Bloque le travail maintenant, pas de contournement',
  2: 'Gêne forte, contournement possible',
  3: 'Peut attendre',
};

/** Matrice impact × urgence → priorité (comme ServiceNow). */
export function prioriteDeMatrice(impact: Niveau, urgence: Niveau): PrioriteTicket {
  const s = impact + urgence;
  if (s <= 2) return 'P1';
  if (s === 3) return 'P2';
  if (s === 4) return 'P3';
  return 'P4';
}

/** Niveaux par défaut pour une priorité donnée (incident ouvert par une alerte). */
export function niveauxDePriorite(p: PrioriteTicket): { impact: Niveau; urgence: Niveau } {
  return { P1: { impact: 1, urgence: 1 }, P2: { impact: 1, urgence: 2 }, P3: { impact: 2, urgence: 2 }, P4: { impact: 3, urgence: 3 } }[p] as {
    impact: Niveau;
    urgence: Niveau;
  };
}

const MIN = 60_000;
const H = 60 * MIN;
/**
 * Engagements de service (SLA), en temps calendaire (24 h/24) :
 * délai de prise en charge et délai de résolution. Repris du guide (7.1)
 * pour la prise en charge.
 */
export const SLA: Record<'incident' | 'demande', Record<PrioriteTicket, { reponse: number; resolution: number }>> = {
  incident: {
    P1: { reponse: 15 * MIN, resolution: 4 * H },
    P2: { reponse: 1 * H, resolution: 8 * H },
    P3: { reponse: 8 * H, resolution: 3 * 24 * H },
    P4: { reponse: 24 * H, resolution: 5 * 24 * H },
  },
  demande: {
    P1: { reponse: 1 * H, resolution: 8 * H },
    P2: { reponse: 4 * H, resolution: 24 * H },
    P3: { reponse: 8 * H, resolution: 3 * 24 * H },
    P4: { reponse: 24 * H, resolution: 5 * 24 * H },
  },
};

export const CODES_RESOLUTION = [
  'Résolu (correctif permanent)',
  'Résolu (contournement)',
  'Résolu par un changement',
  'Résolu automatiquement',
  'Doublon',
  'Pas de défaut / fonctionnement normal',
  'Ne se reproduit pas',
];

export const CATEGORIES: Record<TypeTicket, string[]> = {
  incident: ['Application', 'Caisse / comptoir', 'Paiements', 'Synchronisation', 'Base de données', 'Serveur', 'Réseau', 'Sécurité', 'Impression', 'Autre'],
  probleme: ['Application', 'Infrastructure', 'Base de données', 'Réseau', 'Sécurité', 'Fournisseur externe', 'Autre'],
  changement: ['Déploiement applicatif', 'Mise à jour système', 'Base de données (migration)', 'Configuration', 'Infrastructure', 'Sécurité', 'Autre'],
  demande: ['Accès / compte', 'Nouveau poste', 'Imprimante / matériel', 'Paramétrage', 'Formation', 'Données / export', 'Autre'],
};

/** Éléments de configuration (CMDB légère) : les composants d'Officina. */
export const ELEMENTS_CONFIGURATION = [
  'gateway',
  'identity',
  'catalog',
  'inventory',
  'syncd',
  'sales',
  'regulatory',
  'purchasing',
  'insurance',
  'billing',
  'ledger',
  'payments',
  'notify',
  'hr',
  'documents',
  'postgres',
  'redis',
  'nats',
  'caddy',
  'serveur',
  'comptoir (postes)',
  'supervision',
];

export const GROUPES_DEFAUT = ['Exploitation', 'Développement', 'Support officine'];

/** Le libellé du bouton qui fait passer d'un statut à un autre. */
export function verbeTransition(type: TypeTicket, depuis: string, vers: string): string {
  if ((depuis === 'resolu' || depuis === 'erreur-connue' || depuis === 'rejete') && vers !== 'clos' && vers !== 'resolu') return 'Rouvrir';
  if (depuis === 'en-attente' && vers === 'en-cours') return 'Reprendre';
  const verbes: Record<string, string> = {
    'en-cours': type === 'changement' ? 'Démarrer la mise en œuvre' : 'Prendre en charge',
    'en-attente': 'Mettre en attente',
    resolu: type === 'probleme' ? 'Marquer résolu' : 'Résoudre',
    clos: 'Clore',
    annule: 'Annuler',
    analyse: 'Lancer l’analyse',
    'erreur-connue': 'Déclarer erreur connue',
    evaluation: 'Soumettre au CAB',
    planifie: 'Planifier',
    revue: 'Terminer la mise en œuvre',
    brouillon: 'Repasser en brouillon',
  };
  return verbes[vers] ?? libelleStatut(type, vers);
}

export function etapes(type: TypeTicket): EtapeStatut[] {
  return STATUTS[type];
}

export function libelleStatut(type: TypeTicket, statut: string): string {
  return STATUTS[type].find((s) => s.cle === statut)?.libelle ?? statut;
}

export function estOuvert(t: Pick<Ticket, 'type' | 'statut'>): boolean {
  return !STATUTS[t.type].find((s) => s.cle === t.statut)?.final;
}

/** L'état du SLA en cours (prise en charge puis résolution). */
export function etatSla(t: Ticket, maintenant = Date.now()): { etat: EtatSla; echeance: number | null; phase: 'reponse' | 'resolution' | null } {
  if ((t.type !== 'incident' && t.type !== 'demande') || !t.echeanceResolution) return { etat: 'non-applicable', echeance: null, phase: null };
  const regle = SLA[t.type][t.priorite];
  if (!estOuvert(t) || t.resoluLe) {
    const fin = t.resoluLe ?? t.closLe ?? maintenant;
    return { etat: fin <= t.echeanceResolution ? 'tenu' : 'depasse', echeance: t.echeanceResolution, phase: null };
  }
  const enReponse = !t.prisEnChargeLe && t.echeanceReponse;
  const echeance = enReponse ? (t.echeanceReponse as number) : t.echeanceResolution;
  const duree = enReponse ? regle.reponse : regle.resolution;
  const reste = echeance - maintenant;
  // Une prise en charge en retard reste « dépassée » même après coup.
  if (t.prisEnChargeLe && t.echeanceReponse && t.prisEnChargeLe > t.echeanceReponse && reste > 0) {
    return { etat: 'depasse', echeance, phase: 'resolution' };
  }
  const etat: EtatSla = reste < 0 ? 'depasse' : reste < duree * 0.25 ? 'a-risque' : 'ok';
  return { etat, echeance, phase: enReponse ? 'reponse' : 'resolution' };
}
