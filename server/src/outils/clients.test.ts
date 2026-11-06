import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { Gitlab } from './gitlab';
import { Awx } from './awx';
import { Controlm } from './controlm';
import { Sonar } from './sonar';

/** Un faux GitLab / AWX / Control-M : vérifie les chemins, l'authentification, et renvoie des réponses à leur format. */
const recues: { methode: string; chemin: string; entetes: http.IncomingHttpHeaders; corps: string }[] = [];
let serveur: http.Server;
let base = '';

const pipeline = (id: number, status: string, ref = 'main') => ({
  id,
  iid: id - 1000,
  ref,
  sha: 'abc',
  status,
  source: 'push',
  created_at: '2026-11-06T08:00:00Z',
  updated_at: '2026-11-06T08:07:00Z',
  web_url: `https://gitlab/p/-/pipelines/${id}`,
});
const job = (id: number, status: string) => ({
  id,
  name: 'Déployer',
  status,
  created: '2026-11-06T08:00:00Z',
  started: '2026-11-06T08:01:00Z',
  finished: status === 'running' ? null : '2026-11-06T08:05:00Z',
  launch_type: 'manual',
  summary_fields: { job_template: { name: 'Déploiement' }, created_by: { username: 'awa' } },
});

const REPONSES: Record<string, unknown> = {
  'GET /api/v4/projects/groupe%2Fofficina/pipelines': [pipeline(1042, 'running'), pipeline(1041, 'failed'), pipeline(1040, 'success')],
  'GET /api/v4/projects/groupe%2Fofficina/repository/branches': [{ name: 'main', commit: { title: 'Correctif TVA' } }],
  'POST /api/v4/projects/groupe%2Fofficina/pipeline': pipeline(1043, 'created', 'develop'),
  'POST /api/v4/projects/groupe%2Fofficina/pipelines/1041/retry': pipeline(1041, 'pending'),
  'GET /api/v4/projects/groupe%2Fofficina/merge_requests': [
    {
      iid: 7,
      title: 'MR',
      author: { name: 'Jean' },
      source_branch: 'f',
      target_branch: 'main',
      updated_at: '2026-11-06T07:00:00Z',
      web_url: 'https://gitlab/mr/7',
      head_pipeline: { status: 'success' },
    },
  ],
  'GET /api/v2/jobs/': { results: [job(12, 'running'), job(11, 'failed')] },
  'GET /api/v2/job_templates/': { results: [{ id: 3, name: 'Déploiement', description: '', playbook: 'deploy.yml' }] },
  'POST /api/v2/job_templates/3/launch/': job(13, 'pending'),
  'POST /api/v2/jobs/11/relaunch/': job(14, 'pending'),
  'GET /automation-api/run/jobs/status': {
    statuses: [
      { jobId: 'ctm:0a1', name: 'OFFICINA-NUIT', folder: 'OFFICINA-NUIT', type: 'Folder', status: 'Ended OK', startTime: '20261106020000', endTime: '20261106023000' },
      {
        jobId: 'ctm:0a2',
        name: 'EXPORT-COMPTA',
        folder: 'OFFICINA-NUIT',
        type: 'Command',
        status: 'Ended Not OK',
        startTime: '20261106030000',
        endTime: '20261106030400',
        ctm: 'ctm-prod',
      },
      { jobId: 'ctm:0a3', name: 'SAUVEGARDE-PG', folder: 'OFFICINA-NUIT', type: 'Job', status: 'Executing', startTime: '20261106023000' },
    ],
  },
  'POST /automation-api/run/job/ctm%3A0a2/rerun': { message: 'Rerun requested' },
  'GET /api/qualitygates/project_status': {
    projectStatus: {
      status: 'ERROR',
      conditions: [
        { status: 'ERROR', metricKey: 'new_coverage', comparator: 'LT', errorThreshold: '80', actualValue: '61.5' },
        { status: 'OK', metricKey: 'new_security_rating', comparator: 'GT', errorThreshold: '1', actualValue: '1' },
      ],
    },
  },
  'GET /api/measures/component': {
    component: {
      measures: [
        { metric: 'bugs', value: '3' },
        { metric: 'vulnerabilities', value: '0' },
        { metric: 'coverage', value: '61.5' },
        { metric: 'ncloc', value: '48210' },
      ],
    },
  },
};

beforeAll(async () => {
  serveur = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (d) => (corps += d));
    req.on('end', () => {
      const chemin = (req.url ?? '').split('?')[0];
      recues.push({ methode: req.method ?? '', chemin, entetes: req.headers, corps });
      const r = REPONSES[`${req.method} ${chemin}`];
      res.writeHead(r === undefined ? 404 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r ?? { message: '404 Not Found' }));
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(serveur.address() as { port: number }).port}`;
  Object.assign(config, {
    gitlabUrl: base,
    gitlabJeton: 'glpat-x',
    gitlabProjet: 'groupe/officina',
    awxUrl: base,
    awxJeton: 'awx-x',
    controlmUrl: base,
    controlmJeton: 'ctm-x',
    sonarUrl: base,
    sonarJeton: 'sq-x',
    sonarProjet: 'officina',
  });
});
afterAll(() => serveur.close());

describe('GitLab', () => {
  const gl = new Gitlab();
  it('lit les pipelines, les branches et les MR avec le jeton', async () => {
    const ex = await gl.executions();
    expect(ex.map((e) => [e.nom, e.etat, e.fin !== null])).toEqual([
      ['Pipeline #42', 'en-cours', false],
      ['Pipeline #41', 'echec', true],
      ['Pipeline #40', 'succes', true],
    ]);
    expect(ex[0]).toMatchObject({ outil: 'gitlab', id: '1042', contexte: 'main', statutBrut: 'running', lien: 'https://gitlab/p/-/pipelines/1042', par: 'push' });
    expect(recues.at(-1)?.entetes['private-token']).toBe('glpat-x');
    expect((await gl.lancables())[0]).toEqual({ outil: 'gitlab', id: 'main', nom: 'Pipeline sur main', description: 'Correctif TVA' });
    expect((await gl.demandesFusion())[0]).toMatchObject({ iid: 7, auteur: 'Jean', pipeline: 'succes' });
  });
  it('lance et relance', async () => {
    expect(await gl.lancer('develop')).toMatchObject({ id: '1043', contexte: 'develop', etat: 'attente' });
    expect(recues.at(-1)?.corps).toBe('{"ref":"develop"}');
    expect(await gl.relancer('1041')).toMatchObject({ id: '1041', etat: 'attente', statutBrut: 'pending' });
  });
});

describe('AWX', () => {
  const awx = new Awx();
  it('lit les jobs et les modèles avec le jeton', async () => {
    const ex = await awx.executions();
    expect(ex[0]).toMatchObject({
      outil: 'awx',
      id: '12',
      nom: 'Déployer',
      contexte: 'Déploiement',
      etat: 'en-cours',
      par: 'awa',
      fin: null,
      lien: `${base}/#/jobs/playbook/12/output`,
    });
    expect(ex[1].etat).toBe('echec');
    expect(recues.at(-1)?.entetes.authorization).toBe('Bearer awx-x');
    expect(await awx.lancables()).toEqual([{ outil: 'awx', id: '3', nom: 'Déploiement', description: 'deploy.yml' }]);
  });
  it('lance et relance', async () => {
    expect(await awx.lancer('3')).toMatchObject({ id: '13', etat: 'attente' });
    expect(await awx.relancer('11')).toMatchObject({ id: '14', etat: 'attente' });
  });
});

describe('Control-M', () => {
  const ctm = new Controlm();
  it('lit les jobs (sans les dossiers) avec la clé d’API', async () => {
    const ex = await ctm.executions();
    expect(ex.map((e) => e.nom)).toEqual(['EXPORT-COMPTA', 'SAUVEGARDE-PG']);
    expect(ex[0]).toMatchObject({ outil: 'controlm', id: 'ctm:0a2', contexte: 'OFFICINA-NUIT', etat: 'echec', statutBrut: 'Ended Not OK', par: 'ctm-prod' });
    expect(ex[0].fin! - ex[0].debut!).toBe(4 * 60_000);
    expect(ex[1]).toMatchObject({ etat: 'en-cours', fin: null });
    expect(recues.at(-1)?.entetes['x-api-key']).toBe('ctm-x');
    expect(await ctm.lancables()).toEqual([]);
  });
  it('relance un job connu seulement', async () => {
    expect(await ctm.relancer('ctm:0a2')).toMatchObject({ id: 'ctm:0a2', etat: 'attente' });
    expect(recues.at(-1)).toMatchObject({ methode: 'POST', chemin: '/automation-api/run/job/ctm%3A0a2/rerun' });
    await expect(ctm.relancer('inconnu')).rejects.toThrow(/introuvable/);
    await expect(ctm.lancer()).rejects.toThrow(/relancez/);
  });
  it('dit clairement quand l’outil refuse', async () => {
    config.controlmUrl = `${base}/absent`;
    await expect(new Controlm().executions()).rejects.toThrow(/404/);
    config.controlmUrl = base;
  });
});

describe('SonarQube', () => {
  it('lit la porte qualité et les mesures avec le jeton en Basic', async () => {
    const q = await new Sonar().lire();
    expect(q.porte).toBe('ERROR');
    expect(q.conditions).toEqual([
      { libelle: 'Couverture du nouveau code', statut: 'ERROR', valeur: '61.5', seuil: '≥ 80' },
      { libelle: 'Sécurité du nouveau code', statut: 'OK', valeur: '1', seuil: '≤ 1' },
    ]);
    const m = Object.fromEntries(q.mesures.map((x) => [x.cle, [x.valeur, x.statut]]));
    expect(m.bugs).toEqual([3, 'orange']);
    expect(m.vulnerabilities).toEqual([0, 'vert']);
    expect(m.coverage).toEqual([61.5, 'vert']);
    expect(m.security_hotspots).toEqual([null, 'inconnu']);
    expect(q.lien).toBe(`${base}/dashboard?id=officina`);
    expect(recues.at(-1)?.entetes.authorization).toBe(`Basic ${Buffer.from('sq-x:').toString('base64')}`);
    expect(recues.at(-1)?.chemin).toBe('/api/measures/component');
  });
});
