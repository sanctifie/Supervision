import type { NextFunction, Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from './config';
import type { Comptes, CompteStocke } from './comptes';
import { publique } from './comptes';
import { permissionsDe, type Permission } from '../../shared/comptes';

/**
 * Contrôle d'accès : session en cookie HttpOnly, permissions par rôle,
 * limitation des essais de connexion (10 par quart d'heure, par adresse et
 * par identifiant), première installation et secours administrateur.
 */

const COOKIE = 'supervision_session';
const essais = new Map<string, { nombre: number; depuis: number }>();
const FENETRE = 15 * 60_000;

function lireCookie(req: Request): string | null {
  for (const morceau of (req.headers.cookie ?? '').split(';')) {
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

function trop(cle: string): boolean {
  const e = essais.get(cle);
  return !!e && Date.now() - e.depuis < FENETRE && e.nombre >= 10;
}
function echec(cle: string) {
  const e = essais.get(cle);
  const maintenant = Date.now();
  essais.set(cle, e && maintenant - e.depuis < FENETRE ? { nombre: e.nombre + 1, depuis: e.depuis } : { nombre: 1, depuis: maintenant });
}

/** Le code d'installation / de secours (SUPERVISION_CODE_INSTALLATION). */
function codeValide(code: unknown): boolean {
  if (!config.codeInstallation || typeof code !== 'string') return false;
  const h = (x: string) => createHash('sha256').update(x).digest();
  return timingSafeEqual(h(code), h(config.codeInstallation));
}

function depuisLaMachine(req: Request): boolean {
  const ip = req.socket.remoteAddress ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function creerAcces(comptes: Comptes) {
  const ecrireCookie = (res: Response, jeton: string) =>
    res.cookie(COOKIE, jeton, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecurise, maxAge: config.dureeSessionHeures * 3_600_000, path: '/' });

  const moi = (c: CompteStocke) => ({ ...publique(c), permissions: permissionsDe(c) });

  return {
    /** Qui est connecté (ou ce qu'il faut faire : installer, se connecter). */
    session(req: Request, res: Response) {
      const c = comptes.sessionDe(lireCookie(req));
      res.json({
        installation: comptes.aucun(),
        codeRequis: !!config.codeInstallation || !depuisLaMachine(req),
        compte: c ? moi(c) : null,
        produit: config.nomProduit,
      });
    },

    installer(req: Request, res: Response) {
      if (!comptes.aucun()) {
        res.status(409).json({ erreur: 'La supervision est déjà installée' });
        return;
      }
      const ip = `ip:${req.ip}`;
      if (trop(ip)) {
        res.status(429).json({ erreur: 'Trop d’essais. Réessayez dans un quart d’heure.' });
        return;
      }
      if (config.codeInstallation ? !codeValide(req.body?.code) : !depuisLaMachine(req)) {
        echec(ip);
        res.status(403).json({
          erreur: config.codeInstallation ? 'Code d’installation incorrect' : 'Définissez SUPERVISION_CODE_INSTALLATION pour installer depuis un autre poste',
        });
        return;
      }
      try {
        const c = comptes.installer(req.body ?? {});
        ecrireCookie(res, comptes.ouvrirSession(c.id));
        res.status(201).json(moi(comptes.trouver(c.id) as CompteStocke));
      } catch (e) {
        res.status(422).json({ erreur: (e as Error).message });
      }
    },

    connexion(req: Request, res: Response) {
      const { identifiant, motDePasse } = (req.body ?? {}) as Record<string, unknown>;
      const ip = `ip:${req.ip}`;
      const id = `id:${String(identifiant ?? '').toLowerCase()}`;
      if (trop(ip) || trop(id)) {
        res.status(429).json({ erreur: 'Trop d’essais. Réessayez dans un quart d’heure.' });
        return;
      }
      const c = comptes.verifier(identifiant, motDePasse);
      if (!c) {
        echec(ip);
        echec(id);
        res.status(401).json({ erreur: 'Identifiant ou mot de passe incorrect' });
        return;
      }
      essais.delete(id);
      ecrireCookie(res, comptes.ouvrirSession(c.id));
      res.json(moi(c));
    },

    deconnexion(req: Request, res: Response) {
      const jeton = lireCookie(req);
      if (jeton) comptes.fermerSession(jeton);
      res.clearCookie(COOKIE, { path: '/' });
      res.json({ ok: true });
    },

    /** Secours : un administrateur a perdu son mot de passe (code d'installation requis). */
    secours(req: Request, res: Response) {
      const ip = `ip:${req.ip}`;
      if (trop(ip)) {
        res.status(429).json({ erreur: 'Trop d’essais. Réessayez dans un quart d’heure.' });
        return;
      }
      if (!codeValide(req.body?.code)) {
        echec(ip);
        res.status(403).json({ erreur: config.codeInstallation ? 'Code incorrect' : 'Secours désactivé : SUPERVISION_CODE_INSTALLATION n’est pas défini' });
        return;
      }
      const c = comptes.lister().find(
        (x) =>
          x.identifiant ===
            String(req.body?.identifiant ?? '')
              .trim()
              .toLowerCase() && x.role === 'admin',
      );
      if (!c) {
        echec(ip);
        res.status(404).json({ erreur: 'Aucun administrateur avec cet identifiant' });
        return;
      }
      res.json({ motDePasseProvisoire: comptes.reinitialiser(c.id) });
    },

    /** Exige une session ; refuse tout le reste tant que le mot de passe provisoire n'est pas changé. */
    exigerSession(req: Request, res: Response, suivant: NextFunction) {
      const jeton = lireCookie(req);
      const c = comptes.sessionDe(jeton);
      if (!c) {
        res.status(401).json({ erreur: 'Connexion requise' });
        return;
      }
      if (c.doitChangerMotDePasse && req.path !== '/profil/mot-de-passe') {
        res.status(403).json({ erreur: 'Changez d’abord votre mot de passe provisoire' });
        return;
      }
      res.locals.compte = c;
      res.locals.nom = c.nom;
      res.locals.jeton = jeton;
      res.locals.permissions = permissionsDe(c);
      suivant();
    },
  };
}

/** Exige une permission (après exigerSession). */
export function exiger(p: Permission) {
  return (_req: Request, res: Response, suivant: NextFunction) => {
    if (!peut(res, p)) {
      res.status(403).json({ erreur: 'Votre rôle ne permet pas cette action' });
      return;
    }
    suivant();
  };
}

export function peut(res: Response, p: Permission): boolean {
  return (res.locals.permissions as Permission[] | undefined)?.includes(p) ?? false;
}

export function purgerEssais() {
  const maintenant = Date.now();
  for (const [k, e] of essais) if (maintenant - e.depuis > FENETRE) essais.delete(k);
}
