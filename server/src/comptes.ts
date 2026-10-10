import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Stockage } from './stockage';
import { ErreurMetier } from './erreurs';
import { LONGUEUR_MIN_MOT_DE_PASSE, ROLES, type Compte, type Role } from '../../shared/comptes';

/**
 * Les comptes : mots de passe hachés (scrypt, sel aléatoire), sessions
 * persistées (seule l'empreinte du jeton est gardée), règles de sécurité
 * (dernier administrateur protégé, mot de passe provisoire à changer).
 */

export interface CompteStocke extends Compte {
  motDePasse: string;
}

export interface SessionStockee {
  empreinte: string;
  compteId: string;
  expire: number;
}

const empreinte = (jeton: string) => createHash('sha256').update(jeton).digest('base64url');

export function hacher(motDePasse: string): string {
  const sel = randomBytes(16);
  const h = scryptSync(motDePasse, sel, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${sel.toString('base64')}$${h.toString('base64')}`;
}

export function verifierHache(motDePasse: string, stocke: string): boolean {
  const [algo, sel, h] = stocke.split('$');
  if (algo !== 'scrypt' || !sel || !h) return false;
  const attendu = Buffer.from(h, 'base64');
  const calcule = scryptSync(motDePasse, Buffer.from(sel, 'base64'), attendu.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(attendu, calcule);
}

/** Un mot de passe provisoire lisible (sans caractères ambigus). */
export function motDePasseProvisoire(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const octets = randomBytes(14);
  return Array.from(octets, (o) => alphabet[o % alphabet.length]).join('');
}

/** Hache factice : vérifier un identifiant inconnu prend le même temps. */
const HACHE_LEURRE = hacher(randomBytes(12).toString('hex'));

export function publique(c: CompteStocke): Compte {
  const { motDePasse: _ignore, ...reste } = c;
  return reste;
}

function controlerMotDePasse(m: unknown): string {
  if (typeof m !== 'string' || m.length < LONGUEUR_MIN_MOT_DE_PASSE) throw new ErreurMetier(`Le mot de passe doit faire au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères`);
  if (m.length > 200) throw new ErreurMetier('Mot de passe trop long');
  return m;
}

const identifiantPropre = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 40);
const nomPropre = (v: unknown) =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40);
const emailPropre = (v: unknown) => {
  const e = String(v ?? '')
    .trim()
    .slice(0, 120);
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ErreurMetier('Adresse e-mail invalide');
  return e;
};

export class Comptes {
  constructor(
    private readonly stockage: Stockage,
    private readonly dureeSessionMs: number,
    /** Appelé quand un nom affiché change (tickets à renommer). */
    private readonly renommer: (ancien: string, nouveau: string) => void = () => undefined,
  ) {}

  private get liste(): CompteStocke[] {
    return this.stockage.donnees.comptes;
  }

  aucun(): boolean {
    return this.liste.length === 0;
  }

  lister(): Compte[] {
    return this.liste.map(publique).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }

  trouver(id: string): CompteStocke | undefined {
    return this.liste.find((c) => c.id === id);
  }

  parNom(nom: string): CompteStocke | undefined {
    return this.liste.find((c) => c.nom === nom);
  }

  /** Les personnes à qui on peut assigner un ticket. */
  assignables(): string[] {
    return this.liste
      .filter((c) => c.actif && c.role !== 'demandeur')
      .map((c) => c.nom)
      .sort((a, b) => a.localeCompare(b, 'fr'));
  }

  private verifierUnicite(identifiant: string, nom: string, sauf?: string) {
    if (!identifiant) throw new ErreurMetier('Identifiant requis (lettres, chiffres, . _ -)');
    if (!nom) throw new ErreurMetier('Nom affiché requis');
    if (this.liste.some((c) => c.id !== sauf && c.identifiant === identifiant)) throw new ErreurMetier(`L’identifiant « ${identifiant} » est déjà pris`);
    if (this.liste.some((c) => c.id !== sauf && c.nom.toLowerCase() === nom.toLowerCase())) throw new ErreurMetier(`Le nom « ${nom} » est déjà utilisé`);
  }

  /** Première installation : le compte administrateur initial. */
  installer(d: { identifiant: unknown; nom: unknown; motDePasse: unknown }): Compte {
    if (!this.aucun()) throw new ErreurMetier('La supervision est déjà installée');
    return this.creer({ ...d, role: 'admin', approbateur: true }, false);
  }

  creer(d: { identifiant: unknown; nom: unknown; email?: unknown; role?: unknown; approbateur?: unknown; groupes?: unknown; motDePasse: unknown }, provisoire = true): Compte {
    const identifiant = identifiantPropre(d.identifiant);
    const nom = nomPropre(d.nom);
    this.verifierUnicite(identifiant, nom);
    const role: Role = ROLES.includes(d.role as Role) ? (d.role as Role) : 'agent';
    const c: CompteStocke = {
      id: randomUUID(),
      identifiant,
      nom,
      email: emailPropre(d.email),
      telegram: '',
      role,
      approbateur: !!d.approbateur,
      groupes: Array.isArray(d.groupes) ? d.groupes.filter((g): g is string => typeof g === 'string').slice(0, 20) : [],
      actif: true,
      creeLe: Date.now(),
      derniereConnexion: null,
      doitChangerMotDePasse: provisoire,
      notifications: { email: true, telegram: true },
      motDePasse: hacher(controlerMotDePasse(d.motDePasse)),
    };
    this.stockage.modifier((e) => {
      e.comptes.push(c);
    });
    return publique(c);
  }

  /** Vérifie identifiant + mot de passe ; null si refusé (sans dire pourquoi). */
  verifier(identifiant: unknown, motDePasse: unknown): CompteStocke | null {
    const c = this.liste.find((x) => x.identifiant === identifiantPropre(identifiant));
    const ok = verifierHache(typeof motDePasse === 'string' ? motDePasse.slice(0, 200) : '', c?.motDePasse ?? HACHE_LEURRE);
    return c && ok && c.actif ? c : null;
  }

  private dernierAdmin(id: string): boolean {
    const admins = this.liste.filter((c) => c.actif && c.role === 'admin');
    return admins.length === 1 && admins[0].id === id;
  }

  /** Modification par un administrateur. */
  modifier(id: string, d: Record<string, unknown>): Compte {
    const c = this.trouver(id);
    if (!c) throw new ErreurMetier('Compte introuvable');
    const nom = d.nom !== undefined ? nomPropre(d.nom) : c.nom;
    const identifiant = d.identifiant !== undefined ? identifiantPropre(d.identifiant) : c.identifiant;
    this.verifierUnicite(identifiant, nom, c.id);
    const role = d.role !== undefined && ROLES.includes(d.role as Role) ? (d.role as Role) : c.role;
    const actif = d.actif !== undefined ? !!d.actif : c.actif;
    if (this.dernierAdmin(c.id) && (role !== 'admin' || !actif)) throw new ErreurMetier('Il doit rester au moins un administrateur actif');
    const ancienNom = c.nom;
    this.stockage.modifier(() => {
      c.nom = nom;
      c.identifiant = identifiant;
      c.role = role;
      c.actif = actif;
      if (d.email !== undefined) c.email = emailPropre(d.email);
      if (d.approbateur !== undefined) c.approbateur = !!d.approbateur;
      if (Array.isArray(d.groupes)) c.groupes = d.groupes.filter((g): g is string => typeof g === 'string').slice(0, 20);
    });
    if (!actif) this.fermerSessions(c.id);
    if (ancienNom !== nom) this.renommer(ancienNom, nom);
    return publique(c);
  }

  /** Ce que chacun peut changer sur son propre compte. */
  modifierProfil(id: string, d: Record<string, unknown>): Compte {
    const c = this.trouver(id);
    if (!c) throw new ErreurMetier('Compte introuvable');
    this.stockage.modifier(() => {
      if (d.email !== undefined) c.email = emailPropre(d.email);
      if (d.telegram !== undefined)
        c.telegram = String(d.telegram ?? '')
          .trim()
          .replace(/[^0-9-]/g, '')
          .slice(0, 20);
      if (d.notifications && typeof d.notifications === 'object') {
        const n = d.notifications as Record<string, unknown>;
        c.notifications = { email: n.email !== undefined ? !!n.email : c.notifications.email, telegram: n.telegram !== undefined ? !!n.telegram : c.notifications.telegram };
      }
    });
    return publique(c);
  }

  changerMotDePasse(id: string, ancien: unknown, nouveau: unknown, jetonActuel?: string): void {
    const c = this.trouver(id);
    if (!c) throw new ErreurMetier('Compte introuvable');
    if (!verifierHache(typeof ancien === 'string' ? ancien : '', c.motDePasse)) throw new ErreurMetier('Mot de passe actuel incorrect');
    const m = controlerMotDePasse(nouveau);
    if (m === ancien) throw new ErreurMetier('Choisissez un mot de passe différent de l’actuel');
    this.stockage.modifier(() => {
      c.motDePasse = hacher(m);
      c.doitChangerMotDePasse = false;
    });
    // Les autres sessions sont fermées ; celle en cours reste ouverte.
    const garder = jetonActuel ? empreinte(jetonActuel) : null;
    this.stockage.modifier((e) => {
      e.sessions = e.sessions.filter((s) => s.compteId !== id || s.empreinte === garder);
    });
  }

  /** Réinitialisation par un administrateur : renvoie le mot de passe provisoire. */
  reinitialiser(id: string): string {
    const c = this.trouver(id);
    if (!c) throw new ErreurMetier('Compte introuvable');
    const provisoire = motDePasseProvisoire();
    this.stockage.modifier(() => {
      c.motDePasse = hacher(provisoire);
      c.doitChangerMotDePasse = true;
    });
    this.fermerSessions(id);
    return provisoire;
  }

  // --- Sessions -------------------------------------------------------------

  ouvrirSession(compteId: string): string {
    const jeton = randomBytes(32).toString('base64url');
    const maintenant = Date.now();
    this.stockage.modifier((e) => {
      e.sessions = e.sessions.filter((s) => s.expire > maintenant);
      e.sessions.push({ empreinte: empreinte(jeton), compteId, expire: maintenant + this.dureeSessionMs });
      const c = e.comptes.find((x) => x.id === compteId);
      if (c) c.derniereConnexion = maintenant;
    });
    return jeton;
  }

  sessionDe(jeton: string | null): CompteStocke | null {
    if (!jeton) return null;
    const e = empreinte(jeton);
    const s = this.stockage.donnees.sessions.find((x) => x.empreinte === e);
    if (!s || s.expire < Date.now()) return null;
    const c = this.trouver(s.compteId);
    return c?.actif ? c : null;
  }

  fermerSession(jeton: string): void {
    const e = empreinte(jeton);
    this.stockage.modifier((etat) => {
      etat.sessions = etat.sessions.filter((s) => s.empreinte !== e);
    });
  }

  fermerSessions(compteId: string): void {
    this.stockage.modifier((e) => {
      e.sessions = e.sessions.filter((s) => s.compteId !== compteId);
    });
  }

  purger(): void {
    const maintenant = Date.now();
    if (this.stockage.donnees.sessions.some((s) => s.expire < maintenant)) {
      this.stockage.modifier((e) => {
        e.sessions = e.sessions.filter((s) => s.expire >= maintenant);
      });
    }
  }
}
