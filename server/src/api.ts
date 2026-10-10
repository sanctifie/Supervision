import { Router, type Request, type Response } from 'express';
import type { Supervision } from './supervision';
import { accesActif, connexion, deconnexion, exigerSession, sessionDe } from './acces';
import { CHECKLIST, CONTROLES_SECURITE, AUTOMATISATIONS, PIPELINE } from './catalogues';
import { RUNBOOKS } from '../../shared/runbooks';
import { ErreurMetier } from './tickets';
import { etatSla, type TypeTicket } from '../../shared/itsm';

const TYPES: TypeTicket[] = ['incident', 'probleme', 'changement', 'demande'];
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

  // --- ITSM : incidents, problèmes, changements, demandes ---------------------
  /** Enveloppe des actions sur tickets : règle métier → 422, introuvable → 404. */
  const agir =
    (f: (req: Request, res: Response) => unknown | Promise<unknown>, code = 200) =>
    async (req: Request, res: Response) => {
      try {
        const r = await f(req, res);
        if (!res.headersSent) res.status(code).json(r);
      } catch (e) {
        if (e instanceof ErreurMetier) res.status(/introuvable/.test(e.message) ? 404 : 422).json({ erreur: e.message });
        else res.status(500).json({ erreur: (e as Error).message });
      }
    };
  const detail = async (numero: string) => {
    const t = sup.tickets.trouver(numero);
    if (!t) throw new ErreurMetier(`Ticket ${numero} introuvable`);
    return {
      ticket: t,
      sla: etatSla(t),
      transitions: sup.tickets.transitions(t),
      liens: t.liens.map((n) => sup.tickets.trouver(n)).filter((x): x is NonNullable<typeof x> => !!x).map((x) => sup.tickets.resume(x)),
      avertissements: await sup.avertissementsChangement(t.numero),
    };
  };

  api.get(
    '/tickets',
    agir((req, res) => {
      const q = req.query as Record<string, string | undefined>;
      return sup.tickets.lister({
        type: TYPES.includes(q.type as TypeTicket) ? (q.type as TypeTicket) : undefined,
        statut: q.statut || undefined,
        etat: q.etat || undefined,
        priorite: q.priorite || undefined,
        assigneA: q.assigne === 'moi' ? (res.locals.nom as string) : q.assigne || undefined,
        nonAssignes: q.nonAssignes === '1',
        groupe: q.groupe || undefined,
        ci: q.ci || undefined,
        q: q.q?.slice(0, 200) || undefined,
      });
    }),
  );
  api.get('/itsm/tableau', agir((_req, res) => sup.tickets.tableau(res.locals.nom)));
  api.get(
    '/itsm/calendrier',
    agir((req) => {
      const de = Number(req.query.de) || Date.now() - 7 * 86_400_000;
      const a = Number(req.query.a) || de + 35 * 86_400_000;
      return sup.tickets.calendrier(de, Math.min(a, de + 120 * 86_400_000));
    }),
  );
  api.get('/itsm/referentiels', (_req, res) => {
    res.json({ elementsConfiguration: sup.tickets.elementsConfiguration(), equipe: sup.stockage.donnees.equipe });
  });
  api.get('/tickets/:numero', agir((req) => detail(String(req.params.numero))));
  api.post(
    '/tickets',
    agir((req, res) => {
      const { type, lien, ...champs } = req.body ?? {};
      if (!TYPES.includes(type)) throw new ErreurMetier('Type inconnu (incident, probleme, changement, demande)');
      return sup.tickets.creer(type, champs, res.locals.nom, { lien: typeof lien === 'string' ? lien : undefined });
    }, 201),
  );
  api.patch(
    '/tickets/:numero',
    agir(async (req, res) => {
      sup.tickets.modifier(String(req.params.numero), req.body ?? {}, res.locals.nom);
      return detail(String(req.params.numero));
    }),
  );
  api.post(
    '/tickets/:numero/statut',
    agir(async (req, res) => {
      const { statut, commentaire } = req.body ?? {};
      await sup.tickets.changerStatut(String(req.params.numero), String(statut), res.locals.nom, typeof commentaire === 'string' ? commentaire : undefined);
      return detail(String(req.params.numero));
    }),
  );
  api.post(
    '/tickets/:numero/activite',
    agir(async (req, res) => {
      const { type, texte } = req.body ?? {};
      sup.tickets.ajouterActivite(String(req.params.numero), type === 'commentaire' ? 'commentaire' : 'note', String(texte ?? ''), res.locals.nom);
      return detail(String(req.params.numero));
    }),
  );
  api.post(
    '/tickets/:numero/approbation',
    agir(async (req, res) => {
      const { decision, commentaire } = req.body ?? {};
      if (decision !== 'approuve' && decision !== 'rejete') throw new ErreurMetier('Décision : approuve ou rejete');
      sup.tickets.approuver(String(req.params.numero), decision, String(commentaire ?? ''), res.locals.nom);
      return detail(String(req.params.numero));
    }),
  );
  api.post(
    '/tickets/:numero/liens',
    agir(async (req, res) => {
      sup.tickets.lier(String(req.params.numero), String(req.body?.cible ?? ''), res.locals.nom);
      return detail(String(req.params.numero));
    }),
  );
  api.delete(
    '/tickets/:numero/liens/:cible',
    agir(async (req, res) => {
      sup.tickets.delier(String(req.params.numero), String(req.params.cible), res.locals.nom);
      return detail(String(req.params.numero));
    }),
  );

  // Équipe : membres (personnes assignables) et groupes d'affectation.
  api.get('/equipe', (_req, res) => {
    res.json(sup.stockage.donnees.equipe);
  });
  api.put('/equipe', (req, res) => {
    const propre = (v: unknown) =>
      Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 200) : null;
    const membres = propre(req.body?.membres);
    const groupes = propre(req.body?.groupes);
    if (!membres || !groupes) {
      res.status(400).json({ erreur: 'membres et groupes : listes de noms' });
      return;
    }
    sup.stockage.modifier((e) => {
      e.equipe = { membres, groupes };
    });
    res.json(sup.stockage.donnees.equipe);
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
