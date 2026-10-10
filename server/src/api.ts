import { Router, type Request, type Response } from 'express';
import type { Supervision } from './supervision';
import { accesActif, connexion, deconnexion, exigerSession, sessionDe } from './acces';
import { CHECKLIST, CONTROLES_SECURITE, AUTOMATISATIONS, PIPELINE } from './catalogues';
import { RUNBOOKS } from '../../shared/runbooks';
import type { Priorite } from '../../shared/types';
import { config } from './config';

/** Les routes de l'API (/api/...). Toutes en JSON. */
export function creerApi(sup: Supervision): Router {
  const api = Router();

  /** Enveloppe : une erreur de source devient un 502 lisible, pas un plantage. */
  const lire =
    (f: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const r = await f(req, res);
        if (!res.headersSent) res.json(r);
      } catch (e) {
        const message = (e as Error).message || '';
        res.status(502).json({ erreur: /fetch failed|abort/i.test(message) ? 'source injoignable (Prometheus, Alertmanager ou Loki)' : message || 'source injoignable' });
      }
    };

  // --- Publics ---------------------------------------------------------------
  api.get('/session', (req, res) => {
    const s = sessionDe(req);
    res.json({ connecte: !!s, nom: s?.nom ?? null, accesActif: accesActif(), produit: config.nomProduit, mode: sup.mode });
  });
  api.post('/connexion', connexion);
  api.post('/deconnexion', deconnexion);
  api.get('/statut-public', lire(() => sup.statutPublic()));

  // --- Protégés -------------------------------------------------------------
  api.use(exigerSession);

  api.get('/etat', lire(() => sup.etat()));
  api.get('/serveur', lire(() => sup.serveur()));
  api.get('/conteneurs', lire(() => sup.conteneurs()));
  api.get('/services', lire(() => sup.services()));
  api.get('/application', lire(() => sup.application()));
  api.get('/bdd', lire(() => sup.bdd()));
  api.get('/metier', lire(() => sup.metier()));
  api.get('/sauvegardes', lire(() => sup.sauvegardes()));
  api.get('/securite', lire(() => sup.securite()));
  api.get('/automatisations', lire(() => sup.automatisations()));
  api.get('/feuille-de-route', lire(() => sup.feuilleDeRoute()));
  api.get('/runbooks', (_req, res) => {
    res.json(RUNBOOKS);
  });
  api.get('/activite', (_req, res) => {
    res.json(sup.stockage.donnees.evenements.slice(0, 100));
  });

  api.get(
    '/journaux',
    lire((req) => {
      const q = req.query as Record<string, string | undefined>;
      return sup.journaux({
        service: q.service || undefined,
        niveau: q.niveau || undefined,
        texte: q.texte?.slice(0, 200) || undefined,
        minutes: Math.min(24 * 60, Math.max(5, Number(q.minutes) || 60)),
        limite: Math.min(1000, Math.max(10, Number(q.limite) || 200)),
      });
    }),
  );

  // Alertes et silences (Alertmanager).
  api.get('/alertes', lire(() => sup.alertes()));
  api.post(
    '/silences',
    lire(async (req, res) => {
      const { correspondances, minutes, commentaire } = req.body ?? {};
      if (!Array.isArray(correspondances) || !correspondances.length || correspondances.some((c) => typeof c?.nom !== 'string' || typeof c?.valeur !== 'string')) {
        res.status(400).json({ erreur: 'Correspondances invalides' });
        return;
      }
      const duree = Math.min(7 * 24 * 60, Math.max(5, Number(minutes) || 60));
      const id = await sup.creerSilence(correspondances, duree, String(commentaire || 'Maintenance').slice(0, 300), res.locals.nom);
      return { id };
    }),
  );
  api.delete(
    '/silences/:id',
    lire(async (req) => {
      await sup.supprimerSilence(String(req.params.id));
      return { ok: true };
    }),
  );
  api.post(
    '/alertes/test',
    lire(async (_req, res) => {
      await sup.envoyerAlerteTest(res.locals.nom);
      return { ok: true };
    }),
  );

  // Incidents.
  api.get('/incidents', (_req, res) => {
    res.json(sup.incidents.vue());
  });
  api.post('/incidents', (req, res) => {
    const { titre, priorite, note } = req.body ?? {};
    if (typeof titre !== 'string' || !titre.trim() || !['P1', 'P2', 'P3', 'Info'].includes(priorite)) {
      res.status(400).json({ erreur: 'Titre et priorité (P1, P2, P3, Info) requis' });
      return;
    }
    res.status(201).json(sup.incidents.ouvrir({ titre: titre.trim().slice(0, 200), priorite: priorite as Priorite, auteur: res.locals.nom, note: typeof note === 'string' ? note.slice(0, 2000) : undefined }));
  });
  api.post('/incidents/:id/:action', (req, res) => {
    const id = String(req.params.id);
    const { texte } = (req.body ?? {}) as { texte?: string };
    const nom = res.locals.nom as string;
    const t = typeof texte === 'string' ? texte.slice(0, 20000) : '';
    let r;
    switch (req.params.action) {
      case 'acquitter':
        r = sup.incidents.acquitter(id, nom);
        break;
      case 'resoudre':
        r = sup.incidents.resoudre(id, nom, t || undefined);
        break;
      case 'note':
        if (!t.trim()) {
          res.status(400).json({ erreur: 'Note vide' });
          return;
        }
        r = sup.incidents.noter(id, nom, t);
        break;
      case 'post-mortem':
        r = sup.incidents.ecrirePostMortem(id, t);
        break;
      default:
        res.status(404).json({ erreur: 'Action inconnue' });
        return;
    }
    if (!r) res.status(404).json({ erreur: 'Incident introuvable' });
    else res.json(r);
  });

  // Confirmations manuelles : checklist, sécurité, automatisations, pipeline.
  const clesValides = new Set([
    ...CHECKLIST.map((c) => `checklist:${c.id}`),
    ...CONTROLES_SECURITE.map((c) => `securite:${c.cle}`),
    ...AUTOMATISATIONS.map((c) => `automatisation:${c.cle}`),
    ...PIPELINE.map((c) => `pipeline:${c.cle}`),
  ]);
  api.put('/confirmations/:cle', (req, res) => {
    const cle = String(req.params.cle);
    if (!clesValides.has(cle)) {
      res.status(404).json({ erreur: 'Élément inconnu' });
      return;
    }
    const { fait, note } = req.body ?? {};
    res.json(sup.stockage.confirmer(cle, !!fait, res.locals.nom, typeof note === 'string' ? note.slice(0, 500) : undefined));
  });

  return api;
}
