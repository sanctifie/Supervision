import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { Gitlab } from './gitlab';
import { Github } from './github';
import { etatEtapePipeline } from './etapes';
import type { EtapePipeline } from '../../../shared/outils';

let serveur: http.Server;
let base = '';
const pipeline = (id: number, status: string, ref: string) => ({
  id,
  iid: id,
  ref,
  sha: 'x',
  status,
  created_at: '2026-11-06T08:00:00Z',
  updated_at: '2026-11-06T08:07:00Z',
  web_url: `https://gl/${id}`,
});
const REPONSES: Record<string, unknown> = {
  'GET /api/v4/projects/g%2Fp/pipelines': [pipeline(3, 'running', 'main'), pipeline(2, 'success', 'feature/x'), pipeline(1, 'failed', 'main')],
  'GET /api/v4/projects/g%2Fp/pipelines/1/jobs': [
    { name: 'lint', stage: 'qualite', status: 'success', web_url: 'https://gl/j1' },
    { name: 'trivy-image', stage: 'scan', status: 'failed', web_url: 'https://gl/j2' },
  ],
  'GET /repos/o/r/actions/runs': {
    workflow_runs: [
      {
        id: 9,
        run_number: 1,
        name: 'CI',
        head_branch: 'master',
        status: 'completed',
        conclusion: 'success',
        created_at: '2026-11-06T08:00:00Z',
        updated_at: '2026-11-06T08:09:00Z',
        html_url: 'https://gh/9',
      },
    ],
  },
  'GET /repos/o/r/actions/runs/9/jobs': { jobs: [{ name: 'Build and test', status: 'completed', conclusion: 'success', html_url: 'https://gh/j9' }] },
};

beforeAll(async () => {
  serveur = http.createServer((req, res) => {
    const r = REPONSES[`${req.method} ${(req.url ?? '').split('?')[0]}`];
    res.writeHead(r === undefined ? 404 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r ?? {}));
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(serveur.address() as { port: number }).port}`;
  Object.assign(config, { gitlabUrl: base, gitlabJeton: 'x', gitlabProjet: 'g/p', githubUrl: base, githubJeton: 'x', githubDepot: 'o/r' });
});
afterAll(() => serveur.close());

describe('étapes du dernier pipeline', () => {
  it('GitLab : les jobs du dernier pipeline terminé de la branche principale', async () => {
    expect(await new Gitlab().etapes()).toEqual([
      { nom: 'lint', etape: 'qualite', etat: 'succes', lien: 'https://gl/j1' },
      { nom: 'trivy-image', etape: 'scan', etat: 'echec', lien: 'https://gl/j2' },
    ]);
  });
  it('GitHub : les jobs de la dernière exécution terminée', async () => {
    expect(await new Github().etapes()).toEqual([{ nom: 'Build and test', etape: 'Build and test', etat: 'succes', lien: 'https://gh/j9' }]);
  });
  it('reconnaît les étapes du guide par le nom des jobs', () => {
    const etapes: EtapePipeline[] = [
      { nom: 'lint', etape: 'qualite', etat: 'succes', lien: null },
      { nom: 'unit-tests', etape: 'test', etat: 'succes', lien: null },
      { nom: 'build-image', etape: 'build', etat: 'succes', lien: null },
      { nom: 'trivy-image', etape: 'scan', etat: 'echec', lien: null },
      { nom: 'deploy-staging', etape: 'deploy', etat: 'en-cours', lien: null },
    ];
    expect(etatEtapePipeline('qualite', etapes)).toEqual({ statut: 'vert', detail: 'Job(s) : lint — réussi' });
    expect(etatEtapePipeline('tests', etapes)?.statut).toBe('vert');
    expect(etatEtapePipeline('build', etapes)).toEqual({ statut: 'vert', detail: 'Job(s) : build-image — réussi' });
    expect(etatEtapePipeline('scan-image', etapes)?.statut).toBe('rouge');
    expect(etatEtapePipeline('staging', etapes)?.statut).toBe('orange');
    expect(etatEtapePipeline('production', etapes)).toBeUndefined();
    expect(etatEtapePipeline('inconnue', etapes)).toBeUndefined();
  });
});
