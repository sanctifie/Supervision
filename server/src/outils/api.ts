import { Router, type Request, type Response } from 'express';
import type { Outils } from './outils';
import type { Tickets } from '../tickets';
import { exiger } from '../acces';
import { ErreurMetier } from '../erreurs';

/** /api/outils : la vue unifiée, lancer, relancer. */
export function creerApiOutils(outils: Outils, tickets: Tickets): Router {
  const api = Router();
  const repondre = (f: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      res.json(await f(req, res));
    } catch (e) {
      const message = (e as Error).message || 'outil injoignable';
      if (e instanceof ErreurMetier) res.status(422).json({ erreur: message });
      else res.status(502).json({ erreur: /fetch failed|abort/i.test(message) ? 'outil injoignable' : message });
    }
  };

  api.get(
    '/',
    repondre(async () => ({ ...(await outils.vue()), tickets: tickets.parExecution() })),
  );
  api.post(
    '/:outil/lancer',
    exiger('agir'),
    repondre((req, res) => outils.lancer(String(req.params.outil), String(req.body?.id ?? '').slice(0, 200), res.locals.nom)),
  );
  api.post(
    '/:outil/executions/:id/relancer',
    exiger('agir'),
    repondre((req, res) => outils.relancer(String(req.params.outil), String(req.params.id), res.locals.nom)),
  );
  return api;
}
