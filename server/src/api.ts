import express, { Router, type Request, type Response } from 'express';
import { TAILLE_MAX } from './pieces';
import type { Supervision } from './supervision';
import { creerAcces, exiger, peut } from './acces';
import { CHECKLIST, CONTROLES_SECURITE, AUTOMATISATIONS, PIPELINE } from './catalogues';
import { RUNBOOKS } from '../../shared/runbooks';
import { ErreurMetier } from './erreurs';
import { estOuvert, type Ticket, type TypeTicket } from '../../shared/itsm';
import { motDePasseProvisoire, type CompteStocke } from './comptes';

const TYPES: TypeTicket[] = ['incident', 'probleme', 'changement', 'demande'];
/** Ce qu'un demandeur peut renseigner en ouvrant un ticket. */
const CHAMPS_DEMANDEUR = ['titre', 'description', 'impact', 'urgence', 'categorie', 'ci'];

/** Les routes de l'API (/api/...). Toutes en JSON. */
export function creerApi(sup: Supervision): Router {
  const api = Router();
  const acces = creerAcces(sup.comptes);

  /** Enveloppe : une erreur de source devient un 502 lisible, pas un plantage. */
  const lire = (f: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      const r = await f(req, res);
      if (!res.headersSent) res.json(r);
    } catch (e) {
      const message = (e as Error).message || '';
      res.status(502).json({ erreur: /fetch failed|abort/i.test(message) ? 'source injoignable (Prometheus, Alertmanager ou Loki)' : message || 'source injoignable' });
    }
  };

  // --- Publics ---------------------------------------------------------------
  api.get('/session', acces.session);
  api.post('/installation', acces.installer);
  api.post('/connexion', acces.connexion);
  api.post('/deconnexion', acces.deconnexion);
  api.post('/secours', acces.secours);
  api.get(
    '/statut-public',
    lire(() => sup.statutPublic()),
  );

  // --- Protégés -------------------------------------------------------------
  api.use(acces.exigerSession);

  // Mes notifications (la cloche).
  api.get('/notifications', (_req, res) => {
    res.json(sup.notifications.lister((res.locals.compte as CompteStocke).id));
  });
  api.post('/notifications/lues', (req, res) => {
    sup.notifications.marquerLues((res.locals.compte as CompteStocke).id, typeof req.body?.id === 'string' ? req.body.id : undefined);
    res.json(sup.notifications.lister((res.locals.compte as CompteStocke).id));
  });
  api.get('/notifications/canaux', (_req, res) => {
    res.json(sup.notifications.etatCanaux());
  });
  api.post('/notifications/test', async (_req, res) => {
    res.json(await sup.notifications.tester(res.locals.compte as CompteStocke));
  });

  // Mon compte.
  api.get('/profil', (_req, res) => {
    res.json(sup.comptes.lister().find((c) => c.id === (res.locals.compte as CompteStocke).id));
  });
  api.post('/profil/mot-de-passe', (req, res) => {
    try {
      sup.comptes.changerMotDePasse((res.locals.compte as CompteStocke).id, req.body?.ancien, req.body?.nouveau, res.locals.jeton);
      res.json({ ok: true });
    } catch (e) {
      res.status(422).json({ erreur: (e as Error).message });
    }
  });
  api.patch('/profil', (req, res) => {
    try {
      res.json(sup.comptes.modifierProfil((res.locals.compte as CompteStocke).id, req.body ?? {}));
    } catch (e) {
      res.status(422).json({ erreur: (e as Error).message });
    }
  });

  api.get(
    '/etat',
    lire(() => sup.etat()),
  );
  api.get(
    '/serveur',
    lire(() => sup.serveur()),
  );
  api.get(
    '/conteneurs',
    lire(() => sup.conteneurs()),
  );
  api.get(
    '/deploiements',
    lire(async () => {
      const [images, conteneurs] = await Promise.all([sup.images().catch(() => ({})), sup.conteneurs().catch(() => null)]);
      const enMarche = Object.fromEntries((conteneurs?.conteneurs ?? []).map((c) => [c.nom, c.enMarche]));
      return sup.deploiements.vue(images, enMarche);
    }),
  );
  api.get(
    '/services',
    lire(() => sup.services()),
  );
  api.get(
    '/application',
    lire(() => sup.application()),
  );
  api.get(
    '/bdd',
    lire(() => sup.bdd()),
  );
  api.get(
    '/metier',
    lire(() => sup.metier()),
  );
  api.get(
    '/sauvegardes',
    lire(() => sup.sauvegardes()),
  );
  api.get(
    '/securite',
    lire(() => sup.securite()),
  );
  api.get(
    '/automatisations',
    lire(() => sup.automatisations()),
  );
  api.get(
    '/feuille-de-route',
    lire(() => sup.feuilleDeRoute()),
  );
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
  api.get(
    '/alertes',
    lire(() => sup.alertes()),
  );
  api.post(
    '/silences',
    exiger('agir'),
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
    exiger('agir'),
    lire(async (req) => {
      await sup.supprimerSilence(String(req.params.id));
      return { ok: true };
    }),
  );
  api.post(
    '/alertes/test',
    exiger('agir'),
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
  const detail = async (numero: string, res: Response) => {
    const t = sup.tickets.trouver(numero);
    if (!t) throw new ErreurMetier(`Ticket ${numero} introuvable`);
    const interne = peut(res, 'agir');
    return {
      // Les notes de travail restent internes à l'équipe.
      ticket: interne ? t : ({ ...t, activite: t.activite.filter((a) => a.type !== 'note') } as Ticket),
      sla: sup.tickets.sla(t),
      transitions: interne ? sup.tickets.transitions(t) : [],
      liens: t.liens
        .map((n) => sup.tickets.trouver(n))
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((x) => sup.tickets.resume(x)),
      enfants: sup.tickets.enfants(t).map((x) => sup.tickets.resume(x)),
      avertissements: interne ? await sup.avertissementsChangement(t.numero) : [],
      articles: sup.connaissances.pourTicket(t.numero, interne),
      suggestions: estOuvert(t)
        ? sup.connaissances.suggerer(`${t.titre} ${t.ci ?? ''}`, interne, 3).filter((a) => !sup.connaissances.pourTicket(t.numero, interne).some((x) => x.id === a.id))
        : [],
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
  api.post(
    '/deploiements/:ci/retour-arriere',
    exiger('agir'),
    agir((req, res) => sup.deploiements.retourArriere(String(req.params.ci), String(req.body?.version ?? ''), res.locals.nom), 201),
  );
  api.get(
    '/itsm/tableau',
    agir((_req, res) => sup.tickets.tableau(res.locals.nom)),
  );
  api.get(
    '/itsm/calendrier',
    agir((req) => {
      const de = Number(req.query.de) || Date.now() - 7 * 86_400_000;
      const a = Number(req.query.a) || de + 35 * 86_400_000;
      return sup.tickets.calendrier(de, Math.min(a, de + 120 * 86_400_000));
    }),
  );
  api.get('/itsm/referentiels', (_req, res) => {
    res.json({
      elementsConfiguration: sup.tickets.elementsConfiguration(),
      equipe: { membres: sup.comptes.assignables(), groupes: sup.stockage.donnees.equipe.groupes },
    });
  });
  api.get(
    '/tickets/:numero',
    agir((req, res) => detail(String(req.params.numero), res)),
  );
  api.post(
    '/tickets',
    exiger('creer'),
    agir((req, res) => {
      const { type, lien, ...champs } = req.body ?? {};
      if (!TYPES.includes(type)) throw new ErreurMetier('Type inconnu (incident, probleme, changement, demande)');
      if (peut(res, 'agir')) return sup.tickets.creer(type, champs, res.locals.nom, { lien: typeof lien === 'string' ? lien : undefined });
      // Un demandeur déclare un incident ou une demande, en son nom.
      if (type !== 'incident' && type !== 'demande') {
        res.status(403).json({ erreur: 'Votre rôle permet de déclarer des incidents et des demandes' });
        return;
      }
      const propres = Object.fromEntries(Object.entries(champs).filter(([k]) => CHAMPS_DEMANDEUR.includes(k)));
      return sup.tickets.creer(type, { ...propres, demandeur: res.locals.nom, canal: 'Libre-service' }, res.locals.nom);
    }, 201),
  );
  api.patch(
    '/tickets/:numero',
    exiger('agir'),
    agir(async (req, res) => {
      sup.tickets.modifier(String(req.params.numero), req.body ?? {}, res.locals.nom);
      return detail(String(req.params.numero), res);
    }),
  );
  api.post(
    '/tickets/:numero/statut',
    exiger('agir'),
    agir(async (req, res) => {
      const { statut, commentaire } = req.body ?? {};
      await sup.tickets.changerStatut(String(req.params.numero), String(statut), res.locals.nom, typeof commentaire === 'string' ? commentaire : undefined);
      return detail(String(req.params.numero), res);
    }),
  );
  api.post(
    '/tickets/:numero/activite',
    agir(async (req, res) => {
      const { type, texte } = req.body ?? {};
      if (!peut(res, 'agir')) {
        // Un demandeur commente ses propres tickets, sans note interne.
        const t = sup.tickets.trouver(String(req.params.numero));
        if (!t || t.demandeur !== res.locals.nom || type !== 'commentaire') {
          res.status(403).json({ erreur: 'Vous pouvez commenter les tickets que vous avez ouverts' });
          return;
        }
      }
      sup.tickets.ajouterActivite(String(req.params.numero), type === 'commentaire' ? 'commentaire' : 'note', String(texte ?? ''), res.locals.nom);
      return detail(String(req.params.numero), res);
    }),
  );
  api.post(
    '/tickets/:numero/approbation',
    exiger('approuver'),
    agir(async (req, res) => {
      const { decision, commentaire } = req.body ?? {};
      if (decision !== 'approuve' && decision !== 'rejete') throw new ErreurMetier('Décision : approuve ou rejete');
      sup.tickets.approuver(String(req.params.numero), decision, String(commentaire ?? ''), res.locals.nom);
      return detail(String(req.params.numero), res);
    }),
  );
  api.post(
    '/tickets/:numero/liens',
    exiger('agir'),
    agir(async (req, res) => {
      sup.tickets.lier(String(req.params.numero), String(req.body?.cible ?? ''), res.locals.nom);
      return detail(String(req.params.numero), res);
    }),
  );
  api.delete(
    '/tickets/:numero/liens/:cible',
    exiger('agir'),
    agir(async (req, res) => {
      sup.tickets.delier(String(req.params.numero), String(req.params.cible), res.locals.nom);
      return detail(String(req.params.numero), res);
    }),
  );

  api.post(
    '/tickets/:numero/suivi',
    agir(async (req, res) => {
      const t = sup.tickets.trouver(String(req.params.numero));
      if (!peut(res, 'agir') && t?.demandeur !== res.locals.nom) {
        res.status(403).json({ erreur: 'Vous pouvez suivre les tickets que vous avez ouverts' });
        return;
      }
      sup.tickets.suivre(String(req.params.numero), res.locals.nom, req.body?.suivre !== false);
      return detail(String(req.params.numero), res);
    }),
  );

  // Pièces jointes : un agent partout, un demandeur sur ses propres tickets.
  const peutJoindre = (numero: string, res: Response) => peut(res, 'agir') || sup.tickets.trouver(numero)?.demandeur === res.locals.nom;
  api.post(
    '/tickets/:numero/pieces',
    express.raw({ type: () => true, limit: TAILLE_MAX }),
    agir(async (req, res) => {
      const numero = String(req.params.numero);
      if (!peutJoindre(numero, res)) {
        res.status(403).json({ erreur: 'Vous pouvez joindre des fichiers aux tickets que vous avez ouverts' });
        return;
      }
      let nom = 'fichier';
      try {
        nom = decodeURIComponent(String(req.headers['x-nom-fichier'] ?? 'fichier'));
      } catch {
        /* nom illisible : nom par défaut */
      }
      sup.pieces.ajouter(numero, nom, String(req.headers['content-type'] ?? ''), Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), res.locals.nom);
      return detail(numero, res);
    }, 201),
  );
  api.get('/tickets/:numero/pieces/:id', (req, res) => {
    try {
      const { fichier, piece, affichable } = sup.pieces.lire(String(req.params.numero), String(req.params.id));
      // Jamais exécuté dans la page : bac à sable, type imposé, téléchargement par défaut.
      // (Le PDF fait exception : Chrome refuse d'afficher un PDF en bac à sable ; son lecteur est isolé de la page.)
      if (piece.type !== 'application/pdf' || !affichable) res.setHeader('Content-Security-Policy', 'sandbox');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.type(affichable ? piece.type : 'application/octet-stream');
      res.setHeader('Content-Disposition', `${affichable && req.query.telecharger === undefined ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(piece.nom)}`);
      res.sendFile(fichier);
    } catch (e) {
      res.status(404).json({ erreur: (e as Error).message });
    }
  });
  api.delete(
    '/tickets/:numero/pieces/:id',
    agir(async (req, res) => {
      sup.pieces.supprimer(String(req.params.numero), String(req.params.id), res.locals.nom, peut(res, 'agir'));
      return detail(String(req.params.numero), res);
    }),
  );

  // Catalogue de demandes.
  api.get('/catalogue', (req, res) => {
    res.json(sup.catalogue.lister(req.query.tous !== undefined && peut(res, 'administrer')));
  });
  api.get(
    '/catalogue/:id',
    agir((req, res) => sup.catalogue.trouver(String(req.params.id), peut(res, 'administrer'))),
  );
  api.post(
    '/catalogue/:id/commander',
    exiger('creer'),
    agir((req, res) => sup.catalogue.commander(String(req.params.id), req.body?.valeurs ?? {}, String(req.body?.commentaire ?? '').slice(0, 5000), res.locals.nom), 201),
  );
  api.post(
    '/catalogue',
    exiger('administrer'),
    agir((req) => sup.catalogue.creer(req.body ?? {}), 201),
  );
  api.patch(
    '/catalogue/:id',
    exiger('administrer'),
    agir((req) => sup.catalogue.modifier(String(req.params.id), req.body ?? {})),
  );
  api.delete(
    '/catalogue/:id',
    exiger('administrer'),
    agir((req) => {
      sup.catalogue.supprimer(String(req.params.id));
      return { ok: true };
    }),
  );

  // Base de connaissances.
  api.get(
    '/connaissances',
    agir((req, res) => {
      const q = req.query as Record<string, string | undefined>;
      return sup.connaissances.lister({ q: q.q?.slice(0, 200), statut: q.statut || undefined, categorie: q.categorie || undefined }, peut(res, 'agir'));
    }),
  );
  api.get(
    '/connaissances/suggestions',
    agir((req, res) => sup.connaissances.suggerer(String(req.query.q ?? '').slice(0, 300), peut(res, 'agir'))),
  );
  api.get(
    '/connaissances/modele/:ticket',
    exiger('agir'),
    agir((req) => {
      const t = sup.tickets.trouver(String(req.params.ticket));
      if (!t) throw new ErreurMetier(`Ticket ${req.params.ticket} introuvable`);
      return sup.connaissances.modeleDepuis(t);
    }),
  );
  api.get(
    '/connaissances/:numero',
    agir((req, res) => sup.connaissances.consulter(String(req.params.numero), peut(res, 'agir'))),
  );
  api.post(
    '/connaissances',
    exiger('agir'),
    agir((req, res) => sup.connaissances.creer(req.body ?? {}, res.locals.nom), 201),
  );
  api.patch(
    '/connaissances/:numero',
    exiger('agir'),
    agir((req, res) => sup.connaissances.modifier(String(req.params.numero), req.body ?? {}, res.locals.nom)),
  );
  api.post(
    '/connaissances/:numero/statut',
    exiger('agir'),
    agir((req, res) => sup.connaissances.changerStatut(String(req.params.numero), req.body?.statut, res.locals.nom)),
  );
  api.post(
    '/connaissances/:numero/avis',
    agir((req, res) => sup.connaissances.donnerAvis(String(req.params.numero), !!req.body?.utile, peut(res, 'agir'), (res.locals.compte as CompteStocke).id)),
  );
  api.post(
    '/connaissances/:numero/liens',
    exiger('agir'),
    agir((req, res) => sup.connaissances.lierTicket(String(req.params.numero), String(req.body?.ticket ?? ''), res.locals.nom)),
  );
  api.delete(
    '/connaissances/:numero/liens/:ticket',
    exiger('agir'),
    agir((req) => sup.connaissances.delierTicket(String(req.params.numero), String(req.params.ticket))),
  );

  // Équipe : groupes d'affectation (les membres sont les comptes).
  api.get('/equipe', (_req, res) => {
    res.json({ groupes: sup.stockage.donnees.equipe.groupes });
  });
  api.put('/equipe', exiger('administrer'), (req, res) => {
    const v = req.body?.groupes;
    if (!Array.isArray(v)) {
      res.status(400).json({ erreur: 'groupes : liste de noms' });
      return;
    }
    const groupes = [
      ...new Set(
        v
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim().slice(0, 40))
          .filter(Boolean),
      ),
    ].slice(0, 100);
    sup.stockage.modifier((e) => {
      e.equipe.groupes = groupes;
    });
    res.json({ groupes });
  });

  // Paramètres du service desk : calendrier de service et délais SLA.
  api.get('/parametres', (_req, res) => {
    res.json(sup.tickets.contexteSla());
  });
  api.put('/parametres', exiger('administrer'), (req, res) => {
    const erreur = (m: string) => res.status(422).json({ erreur: m });
    const c = req.body?.calendrier ?? {};
    const heure = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (typeof c.fuseau !== 'string' || !Intl.supportedValuesOf('timeZone').includes(c.fuseau)) return void erreur('Fuseau horaire inconnu');
    if (!heure.test(c.debut) || !heure.test(c.fin) || c.fin <= c.debut) return void erreur('Heures d’ouverture invalides (HH:MM, la fin après le début)');
    if (!Array.isArray(c.jours) || c.jours.some((j: unknown) => !Number.isInteger(j) || (j as number) < 0 || (j as number) > 6)) return void erreur('Jours invalides');
    if (!Array.isArray(c.feries) || c.feries.some((f: unknown) => typeof f !== 'string' || !/^(\d{4}-)?\d{2}-\d{2}$/.test(f)))
      return void erreur('Jours fériés : MM-JJ ou AAAA-MM-JJ');
    const priorites = ['P1', 'P2', 'P3', 'P4'];
    if (!Array.isArray(c.prioritesContinues) || c.prioritesContinues.some((p: unknown) => !priorites.includes(p as string))) return void erreur('Priorités 24 h/24 invalides');
    const sla = req.body?.sla ?? {};
    for (const type of ['incident', 'demande'])
      for (const p of priorites) {
        const r = sla?.[type]?.[p];
        if (!r || !(r.reponse > 0) || !(r.resolution >= r.reponse) || r.resolution > 90 * 86_400_000)
          return void erreur(`Délais ${type} ${p} invalides (la résolution doit suivre la prise en charge)`);
      }
    sup.stockage.modifier((e) => {
      e.parametres = {
        calendrier: {
          fuseau: c.fuseau,
          debut: c.debut,
          fin: c.fin,
          jours: [...new Set<number>(c.jours)].sort(),
          feries: [...new Set<string>(c.feries)].sort().slice(0, 200),
          prioritesContinues: [...new Set<string>(c.prioritesContinues)] as never,
        },
        sla: Object.fromEntries(
          ['incident', 'demande'].map((type) => [
            type,
            Object.fromEntries(priorites.map((p) => [p, { reponse: Number(sla[type][p].reponse), resolution: Number(sla[type][p].resolution) }])),
          ]),
        ) as never,
      };
    });
    sup.stockage.ajouterEvenement({
      t: Date.now(),
      type: 'info',
      titre: 'Paramètres SLA modifiés',
      detail: `Par ${res.locals.nom} ; s’appliquent aux nouveaux tickets`,
      statut: 'vert',
    });
    res.json(sup.tickets.contexteSla());
  });

  // Comptes (administrateurs).
  api.get('/comptes', exiger('agir'), (_req, res) => {
    res.json(sup.comptes.lister());
  });
  api.post(
    '/comptes',
    exiger('administrer'),
    agir((req) => {
      const provisoire = motDePasseProvisoire();
      const compte = sup.comptes.creer({ ...(req.body ?? {}), motDePasse: provisoire });
      return { compte, motDePasseProvisoire: provisoire };
    }, 201),
  );
  api.patch(
    '/comptes/:id',
    exiger('administrer'),
    agir((req) => sup.comptes.modifier(String(req.params.id), req.body ?? {})),
  );
  api.post(
    '/comptes/:id/reinitialiser',
    exiger('administrer'),
    agir((req) => ({ motDePasseProvisoire: sup.comptes.reinitialiser(String(req.params.id)) })),
  );

  // Confirmations manuelles : checklist, sécurité, automatisations, pipeline.
  const clesValides = new Set([
    ...CHECKLIST.map((c) => `checklist:${c.id}`),
    ...CONTROLES_SECURITE.map((c) => `securite:${c.cle}`),
    ...AUTOMATISATIONS.map((c) => `automatisation:${c.cle}`),
    ...PIPELINE.map((c) => `pipeline:${c.cle}`),
  ]);
  api.put('/confirmations/:cle', exiger('agir'), (req, res) => {
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
