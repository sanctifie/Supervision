/**
 * Comptes et rôles, partagés entre le serveur (contrôle d'accès) et
 * l'interface (ce qu'on affiche à qui).
 *
 * - admin : tout, y compris les comptes et les paramètres ;
 * - agent : traite les tickets, pose des silences, coche la feuille de route ;
 * - demandeur : déclare des incidents et des demandes, commente les siens,
 *   consulte la supervision (personnel de l'officine, direction).
 * `approbateur` s'ajoute au rôle : membre du CAB, approuve les changements.
 */

export type Role = 'admin' | 'agent' | 'demandeur';
export type Permission = 'lire' | 'creer' | 'agir' | 'approuver' | 'administrer';

export interface PreferencesNotification {
  email: boolean;
  telegram: boolean;
}

export interface Compte {
  id: string;
  identifiant: string;
  nom: string;
  email: string;
  /** Identifiant de conversation Telegram (chat id) pour les notifications. */
  telegram: string;
  role: Role;
  approbateur: boolean;
  groupes: string[];
  actif: boolean;
  creeLe: number;
  derniereConnexion: number | null;
  doitChangerMotDePasse: boolean;
  notifications: PreferencesNotification;
}

export const ROLES: Role[] = ['admin', 'agent', 'demandeur'];

export const LIBELLE_ROLE: Record<Role, string> = {
  admin: 'Administrateur',
  agent: 'Agent du service desk',
  demandeur: 'Demandeur',
};

export const AIDE_ROLE: Record<Role, string> = {
  admin: 'Tout, y compris les comptes et les paramètres',
  agent: 'Traite les incidents, problèmes, changements et demandes',
  demandeur: 'Déclare des incidents et des demandes, suit les siens',
};

export function permissionsDe(c: Pick<Compte, 'role' | 'approbateur'>): Permission[] {
  const p: Permission[] = ['lire', 'creer'];
  if (c.role === 'agent' || c.role === 'admin') p.push('agir');
  if (c.approbateur || c.role === 'admin') p.push('approuver');
  if (c.role === 'admin') p.push('administrer');
  return p;
}

export const LONGUEUR_MIN_MOT_DE_PASSE = 10;
