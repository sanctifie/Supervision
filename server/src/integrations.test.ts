import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Integrations } from './integrations';

/** Un faux serveur qui répond comme les 7 outils, et refuse un jeton absent ou faux. */
const JETON = 'jeton-secret';
const REPONSES: Record<string, { entete: string; attendu: string; corps: unknown }> = {
  '/rest/api/3/search/jql': {
    entete: 'authorization',
    attendu: `Basic ${Buffer.from(`awa@exemple.fr:${JETON}`).toString('base64')}`,
    corps: {
      issues: [
        {
          key: 'OPS-1',
          fields: {
            summary: 'Disque plein',
            status: { name: 'En cours', statusCategory: { key: 'indeterminate' } },
            priority: { name: 'Highest' },
            updated: '2026-11-10T10:00:00.000+0000',
          },
        },
        { key: 'OPS-2', fields: { summary: 'Fait', status: { name: 'Terminé', statusCategory: { key: 'done' } }, assignee: { displayName: 'Awa' } } },
      ],
    },
  },
  '/api/v4/projects': { entete: 'private-token', attendu: JETON, corps: [{ id: 7, path_with_namespace: 'officina/api', web_url: 'http://x/officina/api' }] },
  '/api/v4/projects/7/pipelines': {
    entete: 'private-token',
    attendu: JETON,
    corps: [{ id: 99, status: 'failed', ref: 'main', web_url: 'http://x/p/99', updated_at: '2026-11-10T10:00:00Z' }],
  },
  '/api/components/search_projects': {
    entete: 'authorization',
    attendu: `Basic ${Buffer.from(`${JETON}:`).toString('base64')}`,
    corps: { components: [{ key: 'api', name: 'API' }] },
  },
  '/api/measures/search': {
    entete: 'authorization',
    attendu: `Basic ${Buffer.from(`${JETON}:`).toString('base64')}`,
    corps: {
      measures: [
        { component: 'api', metric: 'alert_status', value: 'ERROR' },
        { component: 'api', metric: 'bugs', value: '3' },
      ],
    },
  },
  '/api/v2/jobs/': {
    entete: 'authorization',
    attendu: `Bearer ${JETON}`,
    corps: { results: [{ id: 5, name: 'Déploiement', status: 'successful', playbook: 'site.yml', finished: '2026-11-10T10:00:00Z' }] },
  },
  '/api_jsonrpc.php': {
    entete: 'authorization',
    attendu: `Bearer ${JETON}`,
    corps: { result: [{ eventid: '12', objectid: '3', name: 'CPU élevé', severity: '4', clock: '1762768800', acknowledged: '0' }] },
  },
  '/api/search': {
    entete: 'authorization',
    attendu: `Bearer ${JETON}`,
    corps: [
      { uid: 'a', title: 'Serveur', url: '/d/a/serveur', folderTitle: 'Prod' },
      { uid: 'b', title: 'Piège', url: 'javascript:alert(1)' },
    ],
  },
  '/automation-api/run/jobs/status': {
    entete: 'x-api-key',
    attendu: JETON,
    corps: { statuses: [{ jobId: 'ctm:1', name: 'SAUVEGARDE', folder: 'NUIT', status: 'Ended Not OK', endTime: '20261110020000' }] },
  },
};

let serveur: http.Server;
let url: string;

beforeAll(async () => {
  serveur = http.createServer((req, res) => {
    const chemin = new URL(req.url ?? '/', 'http://x').pathname;
    if (chemin === '/redirige/api/search') return void res.writeHead(302, { location: 'http://127.0.0.1:1/ailleurs' }).end();
    const r = REPONSES[chemin];
    if (!r) return void res.writeHead(404).end('{}');
    if (req.headers[r.entete] !== r.attendu) return void res.writeHead(401).end('{}');
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(r.corps));
  });
  await new Promise<void>((pret) => serveur.listen(0, '127.0.0.1', pret));
  url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});
afterAll(() => serveur.close());

function preparer() {
  const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'int-')));
  return { stockage, integrations: new Integrations(stockage) };
}

describe('intégrations', () => {
  it('lit chaque outil avec la bonne authentification', async () => {
    const { integrations } = preparer();
    const lire = async (outil: string, identifiant = '') => {
      integrations.configurer(outil, { url, jeton: JETON, identifiant }, 'Admin');
      const r = await integrations.lire(outil);
      expect(r.erreur).toBeNull();
      return r.elements;
    };
    expect(await lire('jira', 'awa@exemple.fr')).toMatchObject([
      { id: 'OPS-1', titre: 'OPS-1 · Disque plein', statut: 'rouge', detail: 'Non assigné', lien: `${url}/browse/OPS-1` },
      { id: 'OPS-2', statut: 'vert', detail: 'Awa' },
    ]);
    expect(await lire('gitlab')).toMatchObject([{ titre: 'officina/api', etat: 'failed', statut: 'rouge', detail: 'Pipeline #99 sur main', lien: 'http://x/p/99' }]);
    expect(await lire('sonarqube')).toMatchObject([{ titre: 'API', statut: 'rouge', detail: '3 bug(s) · 0 vulnérabilité(s)' }]);
    expect(await lire('awx')).toMatchObject([{ titre: 'Déploiement', statut: 'vert', detail: 'site.yml' }]);
    expect(await lire('zabbix')).toMatchObject([{ titre: 'CPU élevé', etat: 'Haut', statut: 'rouge', le: 1762768800000 }]);
    // Un lien qui n'est pas en http(s) est écarté.
    expect(await lire('grafana')).toMatchObject([
      { titre: 'Serveur', etat: 'Prod', lien: `${url}/d/a/serveur` },
      { titre: 'Piège', lien: null },
    ]);
    expect(await lire('controlm')).toMatchObject([{ titre: 'SAUVEGARDE', statut: 'rouge', detail: 'NUIT', le: new Date(2026, 10, 10, 2).getTime() }]);
  });

  it('un mauvais jeton, une redirection ou une panne donnent un message, pas une exception', async () => {
    const { integrations } = preparer();
    integrations.configurer('awx', { url, jeton: 'faux' }, 'Admin');
    expect((await integrations.lire('awx')).erreur).toMatch(/Accès refusé \(401\)/);
    integrations.configurer('grafana', { url: `${url}/redirige`, jeton: JETON }, 'Admin');
    expect((await integrations.lire('grafana')).erreur).toMatch(/injoignable/);
    integrations.configurer('zabbix', { url: 'http://127.0.0.1:1', jeton: JETON }, 'Admin');
    expect((await integrations.lire('zabbix')).erreur).toMatch(/injoignable/);
  });

  it('ne rend jamais le jeton, et le redemande si l’adresse change', () => {
    const { stockage, integrations } = preparer();
    expect(() => integrations.configurer('jira', { url: 'ftp://x', jeton: JETON }, 'Admin')).toThrow(/http/);
    expect(() => integrations.configurer('jira', { url: 'https://moi:mdp@x.fr', jeton: JETON }, 'Admin')).toThrow(/identifiants/);
    expect(() => integrations.configurer('jira', { url }, 'Admin')).toThrow(/Jeton obligatoire/);
    expect(() => integrations.configurer('inconnu', { url, jeton: JETON }, 'Admin')).toThrow(/introuvable/);
    integrations.configurer('jira', { url: `${url}/`, jeton: JETON }, 'Admin');
    expect(JSON.stringify(integrations.lister())).not.toContain(JETON);
    // Même adresse, jeton vide : on garde l'ancien. Autre adresse : il faut le ressaisir.
    expect(integrations.configurer('jira', { url, actif: false }, 'Admin')).toMatchObject({ url, actif: false, configure: true });
    expect(stockage.donnees.integrations?.jira?.jeton).toBe(JETON);
    expect(() => integrations.configurer('jira', { url: 'https://ailleurs.fr' }, 'Admin')).toThrow(/ressaisissez/);
    integrations.supprimer('jira', 'Admin');
    expect(integrations.lister().find((c) => c.cle === 'jira')).toMatchObject({ configure: false });
    expect(() => integrations.lire('jira')).toThrow(/non configuré/);
  });
});
