import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { Stockage } from '../../stockage';
import { Tickets } from '../../tickets';
import { configureJira, creerIssueJira, jira, statutsJira } from './jira';

/** Faux Jira : Cloud (/rest/api/3, /search/jql) et Server (/rest/api/2, /search). */
const recues: { methode: string; chemin: string; requete: string; entetes: http.IncomingHttpHeaders; corps: string }[] = [];
let serveur: http.Server;
let base = '';
const issue = (key: string, statut: string, cat: string, prio = 'Medium') => ({
  key,
  fields: {
    summary: `Résumé ${key}`,
    status: { name: statut, statusCategory: { key: cat } },
    priority: { name: prio },
    issuetype: { name: 'Bug' },
    assignee: null,
    updated: '2026-11-06T08:00:00.000+0000',
    labels: ['supervision'],
  },
});

beforeAll(async () => {
  serveur = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (d) => (corps += d));
    req.on('end', () => {
      const [chemin, requete = ''] = (req.url ?? '').split('?');
      recues.push({ methode: req.method ?? '', chemin, requete: decodeURIComponent(requete), entetes: req.headers, corps });
      let r: unknown;
      if (req.method === 'GET' && /\/rest\/api\/(3\/search\/jql|2\/search)$/.test(chemin)) {
        r = /key in/.test(decodeURIComponent(requete))
          ? { issues: [issue('OFF-1', 'Terminé', 'done')] }
          : { issues: [issue('OFF-1', 'En cours', 'indeterminate', 'High'), issue('OFF-2', 'À faire', 'new')] };
      } else if (req.method === 'POST' && /\/rest\/api\/[23]\/issue$/.test(chemin)) {
        r = { id: '10001', key: 'OFF-1', self: `${base}${chemin}/10001` };
      }
      res.writeHead(r ? (req.method === 'POST' ? 201 : 200) : 404, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r ?? { errorMessages: ['introuvable'] }));
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(serveur.address() as { port: number }).port}`;
});
afterAll(() => serveur.close());

describe('Jira Cloud', () => {
  beforeAll(() => Object.assign(config, { jiraUrl: base, jiraEmail: 'ops@officina.ga', jiraJeton: 'jt', jiraProjet: 'OFF', jiraType: 'Bug', jiraJql: '' }));

  it('lit les tickets ouverts du projet avec /search/jql et le jeton en Basic', async () => {
    expect(configureJira()).toBe(true);
    const l = await jira.lire();
    const r = recues.at(-1)!;
    expect(r.chemin).toBe('/rest/api/3/search/jql');
    expect(r.requete).toContain('project = "OFF" AND statusCategory != Done');
    expect(r.entetes.authorization).toBe(`Basic ${Buffer.from('ops@officina.ga:jt').toString('base64')}`);
    expect(l.statut).toBe('orange');
    expect(l.resume).toBe('2 ticket(s) ouvert(s), 1 prioritaire(s)');
    expect(l.mesures.map((m) => [m.cle, m.valeur])).toEqual([
      ['ouverts', 2],
      ['en-cours', 1],
      ['prioritaires', 1],
      ['supervision', 2],
    ]);
    expect(l.lignes[0]).toMatchObject({ libelle: 'OFF-1 Résumé OFF-1', lien: `${base}/browse/OFF-1`, statut: 'orange' });
  });

  it('crée un ticket au format de document Atlassian et lit son statut', async () => {
    expect(await creerIssueJira('[INC0001001] Caisse bloquée', 'Ligne 1\n\nLigne 2', ['supervision', 'INC0001001'])).toBe('OFF-1');
    const corps = JSON.parse(recues.at(-1)!.corps);
    expect(recues.at(-1)!.chemin).toBe('/rest/api/3/issue');
    expect(corps.fields).toMatchObject({ project: { key: 'OFF' }, summary: '[INC0001001] Caisse bloquée', issuetype: { name: 'Bug' }, labels: ['supervision', 'INC0001001'] });
    expect(corps.fields.description.content).toHaveLength(2);
    expect(await statutsJira(['OFF-1'])).toEqual({ 'OFF-1': { nom: 'Terminé', fini: true } });
    expect(recues.at(-1)!.requete).toContain('key in ("OFF-1")');
    expect(await statutsJira([])).toEqual({});
  });
});

describe('Jira Server / Data Center', () => {
  it('utilise l’API v2, /search et le jeton en Bearer, description en texte', async () => {
    Object.assign(config, { jiraEmail: '' });
    await jira.lire();
    expect(recues.at(-1)).toMatchObject({ chemin: '/rest/api/2/search' });
    expect(recues.at(-1)!.entetes.authorization).toBe('Bearer jt');
    await creerIssueJira('Titre', 'Texte simple', []);
    expect(JSON.parse(recues.at(-1)!.corps).fields.description).toBe('Texte simple');
  });
});

describe('ticket ↔ Jira', () => {
  it('rattache le ticket Jira et reporte son statut une seule fois', () => {
    const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'jira-')));
    const signaux: string[] = [];
    const tickets = new Tickets(stockage, { creerSilence: async () => 's', supprimerSilence: async () => undefined, signaler: (e) => signaux.push(e.type) });
    const t = tickets.creer('incident', { titre: 'Caisse bloquée' }, 'Alex');
    tickets.lierJira(t.numero, 'OFF-1', `${base}/browse/OFF-1`, 'Alex');
    expect(t.jira).toEqual({ cle: 'OFF-1', lien: `${base}/browse/OFF-1`, statut: null });
    tickets.synchroniserJira({ 'OFF-1': { nom: 'En cours', fini: false } });
    tickets.synchroniserJira({ 'OFF-1': { nom: 'En cours', fini: false } });
    tickets.synchroniserJira({ 'OFF-1': { nom: 'Terminé', fini: true } });
    const traces = t.activite.filter((a) => a.texte.startsWith('Jira OFF-1')).map((a) => a.texte);
    expect(traces).toEqual(['Jira OFF-1 : En cours.', 'Jira OFF-1 : Terminé — terminé côté Jira, vérifier puis résoudre.']);
    expect(signaux.filter((s) => s === 'activite')).toHaveLength(1);
  });
});
