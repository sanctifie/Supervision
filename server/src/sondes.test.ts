import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Sondes, verifierReel } from './sondes';

let serveur: http.Server;
let port: number;
beforeAll(async () => {
  serveur = http.createServer((req, res) => void res.writeHead(req.url === '/ko' ? 503 : req.url === '/ailleurs' ? 302 : 200, { location: '/' }).end('secret'));
  await new Promise<void>((pret) => serveur.listen(0, '127.0.0.1', pret));
  port = (serveur.address() as AddressInfo).port;
});
afterAll(() => serveur.close());

describe('sondes', () => {
  it('contrôle réellement une adresse web et un port', async () => {
    const base = `http://127.0.0.1:${port}`;
    expect(await verifierReel({ type: 'http', cible: `${base}/`, codeAttendu: 0 })).toMatchObject({ ok: true, detail: 'HTTP 200' });
    expect(await verifierReel({ type: 'http', cible: `${base}/ko`, codeAttendu: 0 })).toMatchObject({ ok: false, detail: 'HTTP 503' });
    expect(await verifierReel({ type: 'http', cible: `${base}/ko`, codeAttendu: 503 })).toMatchObject({ ok: true });
    // Une redirection n'est pas suivie : c'est la réponse de l'adresse demandée qui compte.
    expect(await verifierReel({ type: 'http', cible: `${base}/ailleurs`, codeAttendu: 0 })).toMatchObject({ ok: true, detail: 'HTTP 302' });
    expect(await verifierReel({ type: 'tcp', cible: `127.0.0.1:${port}`, codeAttendu: 0 })).toMatchObject({ ok: true, detail: 'Port ouvert' });
    expect(await verifierReel({ type: 'tcp', cible: '127.0.0.1:1', codeAttendu: 0 })).toMatchObject({ ok: false });
    expect(await verifierReel({ type: 'http', cible: 'http://127.0.0.1:1/', codeAttendu: 0 })).toMatchObject({ ok: false, detail: 'Connexion impossible' });
  });

  it('refuse les cibles mal formées', () => {
    const sondes = new Sondes(new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'son-'))), { panne: () => '', retablie: () => undefined });
    expect(() => sondes.creer({ nom: 'S', cible: 'ftp://x' }, 'Admin')).toThrow(/http/);
    expect(() => sondes.creer({ nom: 'S', cible: 'https://moi:mdp@x.fr' }, 'Admin')).toThrow(/identifiants/);
    expect(() => sondes.creer({ nom: 'S', type: 'tcp', cible: 'postgres' }, 'Admin')).toThrow(/hôte:port/);
    expect(() => sondes.creer({ nom: 'S', type: 'tcp', cible: 'postgres:70000' }, 'Admin')).toThrow(/hôte:port/);
    expect(() => sondes.creer({ nom: 'S', cible: 'https://x.fr', codeAttendu: 42 }, 'Admin')).toThrow(/Code attendu/);
    expect(sondes.creer({ nom: 'Base', type: 'tcp', cible: 'postgres:5432', intervalleMin: 7 }, 'Admin')).toMatchObject({
      cible: 'postgres:5432',
      intervalleMin: 5,
      statut: 'inconnu',
    });
  });

  it('panne après 3 échecs de suite, incident ouvert une fois, rétablie au premier succès', async () => {
    const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'son-')));
    const journal: string[] = [];
    let ok = true;
    const sondes = new Sondes(
      stockage,
      { panne: (s, detail) => (journal.push(`panne ${s.nom} ${detail}`), 'INC0001001'), retablie: (n) => void journal.push(`retablie ${n}`) },
      async () => ({ ok, dureeMs: 12, detail: ok ? 'HTTP 200' : 'HTTP 503' }),
    );
    const s = sondes.creer({ nom: 'Site', cible: 'https://officina.exemple.fr', intervalleMin: 1, incident: true }, 'Admin');
    const t0 = Date.UTC(2026, 10, 11);
    await sondes.tic(t0);
    await sondes.tic(t0 + 20_000); // pas encore l'heure
    expect(sondes.lister()[0]).toMatchObject({ statut: 'vert', historique: [{ ok: true }] });
    ok = false;
    await sondes.tic(t0 + 60_000);
    await sondes.tic(t0 + 120_000);
    expect(sondes.lister()[0]).toMatchObject({ statut: 'orange', echecs: 2, ticket: null });
    await sondes.tic(t0 + 180_000);
    await sondes.tic(t0 + 240_000);
    expect(sondes.lister()[0]).toMatchObject({ statut: 'rouge', echecs: 4, ticket: 'INC0001001' });
    ok = true;
    await sondes.controler(s.id, t0 + 250_000);
    expect(sondes.lister()[0]).toMatchObject({ statut: 'vert', echecs: 0, ticket: null });
    expect(journal).toEqual(['panne Site HTTP 503', 'retablie INC0001001']);
    // Une sonde en pause n'est plus contrôlée ; changer la cible repart de zéro.
    sondes.modifier(s.id, { actif: false }, 'Admin');
    await sondes.tic(t0 + 3_600_000);
    expect(sondes.lister()[0].historique).toHaveLength(6);
    expect(sondes.modifier(s.id, { cible: 'https://autre.exemple.fr' }, 'Admin')).toMatchObject({ statut: 'inconnu', historique: [] });
  });
});
