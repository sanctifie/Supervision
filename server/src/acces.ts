import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config';

/**
 * Accès par mot de passe partagé (SUPERVISION_MOT_DE_PASSE) et session en
 * cookie HttpOnly. Le nom saisi à la connexion signe les acquittements et les
 * notes d'incident. Les essais sont limités : 10 par quart d'heure et par IP.
 */

const COOKIE = 'supervision_session';
const sessions = new Map<string, { nom: string; expire: number }>();
const essais = new Map<string, { nombre: number; depuis: number }>();

export const accesActif = () => config.motDePasse.length > 0;

function empreinte(x: string) {
  return createHash('sha256').update(x).digest();
}

function lireCookie(req: Request): string | null {
  const brut = req.headers.cookie ?? '';
  for (const morceau of brut.split(';')) {
    const [cle, ...reste] = morceau.trim().split('=');
    if (cle !== COOKIE) continue;
    try {
      return decodeURIComponent(reste.join('='));
    } catch {
      return null;
    }
  }
  return null;
}

export function sessionDe(req: Request): { nom: string } | null {
  if (!accesActif()) {
    let nom = '';
    try {
      nom = decodeURIComponent(String(req.headers['x-supervision-nom'] ?? '')).trim();
    } catch {
      /* en-tête mal formé : nom par défaut */
    }
    return { nom: nom.slice(0, 40) || 'Équipe' };
  }
  const jeton = lireCookie(req);
  if (!jeton) return null;
  const s = sessions.get(jeton);
  if (!s || s.expire < Date.now()) {
    sessions.delete(jeton);
    return null;
  }
  return { nom: s.nom };
}

export function exigerSession(req: Request, res: Response, suivant: NextFunction) {
  const s = sessionDe(req);
  if (!s) {
    res.status(401).json({ erreur: 'Connexion requise' });
    return;
  }
  res.locals.nom = s.nom;
  suivant();
}

export function connexion(req: Request, res: Response) {
  if (!accesActif()) {
    res.json({ nom: 'Équipe', accesActif: false });
    return;
  }
  const ip = req.ip ?? 'inconnue';
  const e = essais.get(ip);
  const maintenant = Date.now();
  if (e && maintenant - e.depuis < 15 * 60_000 && e.nombre >= 10) {
    res.status(429).json({ erreur: 'Trop d’essais. Réessayez dans un quart d’heure.' });
    return;
  }
  const { motDePasse, nom } = (req.body ?? {}) as { motDePasse?: string; nom?: string };
  const bon = typeof motDePasse === 'string' && timingSafeEqual(empreinte(motDePasse), empreinte(config.motDePasse));
  if (!bon) {
    essais.set(ip, e && maintenant - e.depuis < 15 * 60_000 ? { nombre: e.nombre + 1, depuis: e.depuis } : { nombre: 1, depuis: maintenant });
    res.status(401).json({ erreur: 'Mot de passe incorrect' });
    return;
  }
  essais.delete(ip);
  const jeton = randomBytes(32).toString('base64url');
  const nomPropre = (typeof nom === 'string' ? nom.trim().slice(0, 40) : '') || 'Équipe';
  const duree = config.dureeSessionHeures * 3_600_000;
  sessions.set(jeton, { nom: nomPropre, expire: maintenant + duree });
  res.cookie(COOKIE, jeton, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecurise,
    maxAge: duree,
    path: '/',
  });
  res.json({ nom: nomPropre, accesActif: true });
}

export function deconnexion(req: Request, res: Response) {
  const jeton = lireCookie(req);
  if (jeton) sessions.delete(jeton);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}

/** Nettoie les sessions expirées (appelé de temps en temps). */
export function purgerSessions() {
  const maintenant = Date.now();
  for (const [k, s] of sessions) if (s.expire < maintenant) sessions.delete(k);
  for (const [k, e] of essais) if (maintenant - e.depuis > 15 * 60_000) essais.delete(k);
}
