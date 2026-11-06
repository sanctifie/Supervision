import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { argocd, lectureArgocd } from './argocd';
import { hetzner, lectureHetzner, prixMensuel } from './hetzner';
import { jaeger, lectureJaeger, resumerTrace } from './jaeger';

const recues: { methode: string; chemin: string; entetes: http.IncomingHttpHeaders; corps: string }[] = [];
let serveur: http.Server;
let base = '';
const REPONSES: Record<string, unknown> = {
  'GET /api/v1/applications': {
    items: [
      { metadata: { name: 'officina-prod' }, status: { sync: { status: 'Synced', revision: 'abcdef1234' }, health: { status: 'Healthy' } } },
      {
        metadata: { name: 'officina-staging' },
        status: { sync: { status: 'OutOfSync' }, health: { status: 'Degraded' }, operationState: { phase: 'Failed', finishedAt: '2026-11-06T08:00:00Z' } },
      },
    ],
  },
  'POST /api/v1/applications/officina-staging/sync': {},
  'GET /api/services': { data: ['gateway', 'sales'] },
  'GET /api/traces': {
    data: [
      {
        traceID: 't1',
        spans: [
          { operationName: 'GET /a', startTime: 1_000_000, duration: 100_000 },
          { operationName: 'pg', startTime: 1_020_000, duration: 50_000, references: [{}] },
        ],
      },
      { traceID: 't2', spans: [{ operationName: 'POST /b', startTime: 2_000_000, duration: 1_500_000, tags: [{ key: 'error', value: true }] }] },
    ],
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
      res.end(JSON.stringify(r ?? {}));
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(serveur.address() as { port: number }).port}`;
  Object.assign(config, { argocdUrl: base, argocdJeton: 'ar-x', jaegerUrl: base, jaegerService: 'gateway' });
});
afterAll(() => serveur.close());

describe('Argo CD', () => {
  it('lit les applications et les vérifications, synchronise pour de vrai', async () => {
    const l = await argocd.lire();
    expect(recues.at(-1)?.entetes.authorization).toBe('Bearer ar-x');
    expect(l.statut).toBe('rouge');
    expect(l.lignes.map((x) => [x.libelle, x.statut, x.detail])).toEqual([
      ['officina-prod', 'vert', 'Synced · Healthy · abcdef12'],
      ['officina-staging', 'rouge', 'OutOfSync · Degraded'],
    ]);
    expect(l.lignes[0].lien).toBe(`${base}/applications/officina-prod`);
    expect(l.verifie).toEqual([
      { cle: 'pipeline:production', statut: 'orange', detail: 'Argo CD : 1/2 application(s) synchronisée(s)' },
      { cle: 'checklist:rollback', statut: 'vert', detail: 'GitOps : retour arrière = revenir au commit précédent' },
    ]);
    expect(lectureArgocd([{ metadata: { name: 'a' }, status: { sync: { status: 'Synced' }, health: { status: 'Healthy' } } }], null).verifie[0].statut).toBe('vert');
    expect(lectureArgocd([], null).statut).toBe('inconnu');
    expect(await argocd.agir!('synchroniser', 'officina-staging', 'Alex')).toMatch(/demandée par Alex/);
    expect(recues.at(-1)).toMatchObject({ methode: 'POST', chemin: '/api/v1/applications/officina-staging/sync', corps: '{}' });
  });
});

describe('Hetzner', () => {
  const serveurs = [
    {
      id: 1,
      name: 'a',
      status: 'running',
      datacenter: { location: { name: 'fsn1', city: 'Falkenstein' } },
      server_type: {
        name: 'cx32',
        cores: 4,
        prices: [
          { location: 'nbg1', price_monthly: { gross: '9.00' } },
          { location: 'fsn1', price_monthly: { gross: '8.09' } },
        ],
      },
    },
    {
      id: 2,
      name: 'b',
      status: 'off',
      datacenter: { location: { name: 'hel1', city: 'Helsinki' } },
      server_type: { name: 'cx22', cores: 2, prices: [{ location: 'nbg1', price_monthly: { gross: '4.35' } }] },
    },
  ];
  it('prend le prix du lieu du serveur, sinon le premier, et compte le coût', () => {
    expect(prixMensuel(serveurs[0])).toBe(8.09);
    expect(prixMensuel(serveurs[1])).toBe(4.35);
    const l = lectureHetzner(serveurs);
    expect(l.statut).toBe('orange');
    expect(l.mesures.map((m) => [m.cle, m.valeur])).toEqual([
      ['serveurs', 2],
      ['en-marche', 1],
      ['cout', 12.44],
      ['coeurs', 6],
    ]);
    expect(l.verifie.map((v) => v.cle)).toEqual(['automatisation:inventaire', 'automatisation:couts', 'automatisation:scalabilite']);
    expect(hetzner.demo().statut).toBe('vert');
  });
});

describe('Jaeger', () => {
  it('résume une trace depuis ses spans', () => {
    expect(
      resumerTrace({
        traceID: 'x',
        spans: [
          { operationName: 'r', startTime: 10_000, duration: 5_000 },
          { operationName: 'c', startTime: 12_000, duration: 10_000, references: [{}] },
        ],
      }),
    ).toEqual({ operation: 'r', dureeMs: 12, erreur: false });
  });
  it('lit les services et les traces : p95, erreurs, lignes', async () => {
    const l = await jaeger.lire();
    expect(recues.at(-1)?.chemin).toBe('/api/traces');
    expect(l.statut).toBe('rouge');
    expect(l.mesures.map((m) => [m.cle, m.valeur])).toEqual([
      ['services', 2],
      ['traces', 2],
      ['p95', 1500],
      ['erreurs', 1],
    ]);
    expect(l.lignes[0]).toMatchObject({ libelle: 'POST /b', statut: 'rouge', lien: `${base}/trace/t2` });
    expect(lectureJaeger([], [], null).statut).toBe('inconnu');
  });
});
