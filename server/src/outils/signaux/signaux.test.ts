import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { Stockage } from '../../stockage';
import { Outils, statutSignaux } from '../outils';
import { sentry, lectureSentry } from './sentry';
import { Github, etatGithub } from '../github';

/** Faux Sentry et faux GitHub, pour vérifier chemins, jetons et formats. */
const recues: { methode: string; chemin: string; entetes: http.IncomingHttpHeaders; corps: string }[] = [];
let serveur: http.Server;
let base = '';
const REPONSES: Record<string, unknown> = {
  'GET /api/0/projects/officina/gateway/issues/': [
    {
      id: '11',
      title: 'TypeError: prix',
      culprit: 'sales',
      level: 'error',
      count: '42',
      userCount: 7,
      lastSeen: '2026-11-06T08:00:00Z',
      permalink: 'https://sentry/11',
      stats: {
        '24h': [
          [1, 40],
          [2, 2],
        ],
      },
    },
    {
      id: '12',
      title: 'Timeout Moov',
      culprit: 'payments',
      level: 'warning',
      count: '9',
      userCount: 3,
      lastSeen: '2026-11-06T07:00:00Z',
      permalink: 'https://sentry/12',
      stats: { '24h': [[1, 9]] },
    },
  ],
  'PUT /api/0/issues/11/': { id: '11', status: 'resolved' },
  'GET /repos/sanctifie/Pharmatech/actions/runs': {
    workflow_runs: [
      {
        id: 501,
        run_number: 88,
        name: 'CI',
        head_branch: 'main',
        status: 'completed',
        conclusion: 'failure',
        created_at: '2026-11-06T08:00:00Z',
        updated_at: '2026-11-06T08:09:00Z',
        html_url: 'https://github/run/501',
        actor: { login: 'awa' },
      },
      {
        id: 500,
        run_number: 87,
        name: 'CI',
        head_branch: 'main',
        status: 'in_progress',
        conclusion: null,
        created_at: '2026-11-06T07:00:00Z',
        updated_at: '2026-11-06T07:01:00Z',
        html_url: 'https://github/run/500',
        event: 'push',
      },
    ],
  },
  'GET /repos/sanctifie/Pharmatech/actions/workflows': {
    workflows: [
      { id: 7, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
      { id: 8, name: 'Vieux', path: 'x.yml', state: 'disabled_manually' },
    ],
  },
  'GET /repos/sanctifie/Pharmatech': { default_branch: 'main' },
  'POST /repos/sanctifie/Pharmatech/actions/workflows/7/dispatches': '',
  'POST /repos/sanctifie/Pharmatech/actions/runs/501/rerun': '',
  'GET /repos/sanctifie/Pharmatech/actions/runs/501': {
    id: 501,
    run_number: 88,
    name: 'CI',
    head_branch: 'main',
    status: 'queued',
    conclusion: null,
    created_at: '2026-11-06T08:00:00Z',
    updated_at: '2026-11-06T08:10:00Z',
    html_url: 'https://github/run/501',
  },
  'GET /repos/sanctifie/Pharmatech/pulls': [
    { number: 42, title: 'PR', user: { login: 'jean' }, head: { ref: 'f' }, base: { ref: 'main' }, updated_at: '2026-11-06T06:00:00Z', html_url: 'https://github/pr/42' },
  ],
};

beforeAll(async () => {
  serveur = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (d) => (corps += d));
    req.on('end', () => {
      const chemin = (req.url ?? '').split('?')[0];
      recues.push({ methode: req.method ?? '', chemin, entetes: req.headers, corps });
      const r = REPONSES[`${req.method} ${chemin}`];
      res.writeHead(r === undefined ? 404 : r === '' ? 204 : 200, { 'content-type': 'application/json' });
      res.end(r === '' ? undefined : JSON.stringify(r ?? { message: 'Not Found' }));
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(serveur.address() as { port: number }).port}`;
  Object.assign(config, {
    sentryUrl: base,
    sentryJeton: 'sn-x',
    sentryOrg: 'officina',
    sentryProjet: 'gateway',
    githubUrl: base,
    githubJeton: 'gh-x',
    githubDepot: 'sanctifie/Pharmatech',
  });
});
afterAll(() => serveur.close());

describe('Sentry', () => {
  it('lit les issues avec le jeton et en fait un signal', async () => {
    const l = await sentry.lire();
    expect(recues.at(-1)?.entetes.authorization).toBe('Bearer sn-x');
    expect(l.statut).toBe('orange');
    expect(l.resume).toBe('2 issue(s) non résolue(s), 51 événement(s) sur 24 h');
    expect(l.mesures.map((m) => [m.cle, m.valeur])).toEqual([
      ['issues', 2],
      ['evenements', 51],
      ['utilisateurs', 10],
    ]);
    expect(l.lignes[0]).toMatchObject({ libelle: 'TypeError: prix', statut: 'orange', lien: 'https://sentry/11', actions: [{ id: 'resoudre', libelle: 'Résoudre' }] });
    expect(l.verifie[0].cle).toBe('checklist:sentry');
    expect(lectureSentry([], null).statut).toBe('vert');
  });
  it('résout une issue pour de vrai', async () => {
    expect(await sentry.agir!('resoudre', '11', 'Alex')).toMatch(/résolue par Alex/);
    expect(recues.at(-1)).toMatchObject({ methode: 'PUT', chemin: '/api/0/issues/11/', corps: '{"status":"resolved"}' });
    await expect(sentry.agir!('fermer', '11', 'Alex')).rejects.toThrow(/inconnue/);
  });
});

describe('GitHub Actions', () => {
  const gh = new Github();
  it('lit les exécutions, les workflows actifs et les PR', async () => {
    const ex = await gh.executions();
    expect(ex[0]).toMatchObject({ outil: 'github', id: '501', nom: 'CI #88', contexte: 'main', etat: 'echec', statutBrut: 'failure', par: 'awa', lien: 'https://github/run/501' });
    expect(ex[1]).toMatchObject({ etat: 'en-cours', fin: null, par: 'push' });
    expect(recues.at(-1)?.entetes.authorization).toBe('Bearer gh-x');
    expect(recues.at(-1)?.entetes['user-agent']).toBe('supervision-officina');
    expect(await gh.lancables()).toEqual([{ outil: 'github', id: '7', nom: 'CI', description: '.github/workflows/ci.yml' }]);
    expect((await gh.demandesFusion())[0]).toMatchObject({ iid: 42, auteur: 'jean', source: 'f', cible: 'main' });
    expect(etatGithub('completed', 'cancelled')).toBe('annule');
    expect(etatGithub('queued', null)).toBe('attente');
  });
  it('lance un workflow sur la branche par défaut et relance une exécution', async () => {
    expect(await gh.lancer('7')).toMatchObject({ nom: 'CI', contexte: 'main', etat: 'attente' });
    const dispatch = recues.find((r) => r.chemin.endsWith('/dispatches'));
    expect(dispatch?.corps).toBe('{"ref":"main"}');
    expect(await gh.relancer('501')).toMatchObject({ id: '501', etat: 'attente', statutBrut: 'queued' });
  });
});

describe('signaux dans la vue', () => {
  it('lit les sources configurées, simule les autres en démo, et calcule le voyant', async () => {
    const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'signaux-')));
    const outils = new Outils(stockage, () => true);
    const vue = await outils.vue();
    const s = vue.signaux.find((x) => x.cle === 'sentry')!;
    expect(s).toMatchObject({ configure: true, demo: false, joignable: true, statut: 'orange' });
    expect(vue.signaux.filter((x) => x.demo).length).toBeGreaterThan(0);
    expect(vue.outils.find((o) => o.cle === 'github')).toMatchObject({ configure: true, joignable: true });
    const verifs = await outils.verifications();
    expect(verifs['checklist:sentry']).toMatchObject({ statut: 'vert' });
    expect(statutSignaux(vue.signaux).statut).toBe('orange');
    expect(statutSignaux([]).statut).toBe('inconnu');
    expect(await outils.agirSignal('sentry', 'resoudre', '11', 'Alex')).toMatch(/résolue/);
    expect(stockage.donnees.evenements[0].detail).toBe('Sentry');
    await expect(outils.agirSignal('jaeger', 'x', '', 'Alex')).rejects.toThrow(/non configuré/);
  });
});
