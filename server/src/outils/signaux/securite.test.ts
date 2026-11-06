import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { uptimerobot, lectureUptimeRobot } from './uptimerobot';
import { uptimekuma, parserPrometheus } from './uptimekuma';
import { falco } from './falco';
import { crowdsec } from './crowdsec';
import { wazuh } from './wazuh';
import { trivy, parserRapport, lectureTrivy } from './trivy';
import { lynis, parserLynis } from './lynis';
import { aide, parserAide, lectureAide } from './aide';

/** Faux UptimeRobot, Uptime Kuma, Falco, CrowdSec et Wazuh ; rapports temporaires pour Trivy, Lynis et AIDE. */
const recues: { methode: string; chemin: string; entetes: http.IncomingHttpHeaders; corps: string }[] = [];
let serveur: http.Server;
let base = '';
const KUMA = [
  '# HELP monitor_status Monitor Status (1 = UP, 0= DOWN, 2= PENDING, 3= MAINTENANCE)',
  'monitor_status{monitor_name="Site",monitor_type="http",monitor_url="https://o.ga/"} 1',
  'monitor_response_time{monitor_name="Site",monitor_type="http",monitor_url="https://o.ga/"} 212',
  'monitor_cert_days_remaining{monitor_name="Site",monitor_type="http",monitor_url="https://o.ga/"} 9',
  'monitor_status{monitor_name="API",monitor_type="http",monitor_url="https://o.ga/health"} 0',
].join('\n');
const FALCO = [
  'falcosecurity_falco_rules_matches_total{priority="Warning",rule_name="Read sensitive file"} 2',
  'falcosecurity_falco_rules_matches_total{priority="Error",rule_name="Write below etc"} 1',
].join('\n');
const REPONSES: Record<string, { corps: string; type?: string }> = {
  'POST /v2/getMonitors': {
    corps: JSON.stringify({
      stat: 'ok',
      monitors: [
        { id: 1, friendly_name: 'Site', url: 'https://o.ga/', type: 1, status: 2, custom_uptime_ratio: '99.90' },
        { id: 2, friendly_name: 'API', url: 'https://o.ga/health', type: 1, status: 9, custom_uptime_ratio: '98.10' },
      ],
    }),
  },
  'GET /kuma/metrics': { corps: KUMA, type: 'text/plain' },
  'GET /falco/metrics': { corps: FALCO, type: 'text/plain' },
  'GET /v1/decisions': {
    corps: JSON.stringify([
      { id: 2, origin: 'crowdsec', scenario: 'crowdsecurity/ssh-bf', scope: 'Ip', value: '1.2.3.4', type: 'ban', duration: '3h' },
      { id: 1, origin: 'CAPI', scenario: 'crowdsecurity/http-probing', scope: 'Ip', value: '5.6.7.8', type: 'ban', duration: '1h' },
    ]),
  },
  'POST /security/user/authenticate': { corps: JSON.stringify({ data: { token: 'jwt-x' } }) },
  'GET /agents/summary/status': { corps: JSON.stringify({ data: { connection: { active: 2, disconnected: 1, never_connected: 0, pending: 0, total: 3 } } }) },
  'GET /agents': { corps: JSON.stringify({ data: { affected_items: [{ id: '003', name: 'comptoir-2', ip: '10.0.0.12', lastKeepAlive: '2026-11-05T20:00:00Z' }] } }) },
};

beforeAll(async () => {
  serveur = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (d) => (corps += d));
    req.on('end', () => {
      const chemin = (req.url ?? '').split('?')[0];
      recues.push({ methode: req.method ?? '', chemin, entetes: req.headers, corps });
      const r = REPONSES[`${req.method} ${chemin}`];
      res.writeHead(r ? 200 : 404, { 'content-type': r?.type ?? 'application/json' });
      res.end(r?.corps ?? '{"message":"Not Found"}');
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(serveur.address() as { port: number }).port}`;
  Object.assign(config, {
    uptimerobotCle: 'ur-x',
    uptimekumaUrl: `${base}/kuma`,
    uptimekumaCle: 'uk-x',
    falcoMetricsUrl: `${base}/falco`,
    crowdsecUrl: base,
    crowdsecCle: 'cs-x',
    wazuhUrl: base,
    wazuhUtilisateur: 'wazuh',
    wazuhMotDePasse: 'secret',
  });
});
afterAll(() => serveur.close());

describe('UptimeRobot', () => {
  it('envoie la clé en formulaire et classe les moniteurs', async () => {
    const o = uptimerobot as typeof uptimerobot & { lire: () => Promise<ReturnType<typeof lectureUptimeRobot>> };
    // L'adresse réelle est fixe : on vérifie la lecture pure sur la réponse du faux serveur.
    const r = await fetch(`${base}/v2/getMonitors`, {
      method: 'POST',
      body: new URLSearchParams({ api_key: 'ur-x', format: 'json', custom_uptime_ratios: '30', logs: '0' }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(recues.at(-1)?.corps).toBe('api_key=ur-x&format=json&custom_uptime_ratios=30&logs=0');
    const l = lectureUptimeRobot(((await r.json()) as { monitors: Parameters<typeof lectureUptimeRobot>[0] }).monitors);
    expect(l.statut).toBe('rouge');
    expect(l.mesures.map((m) => [m.cle, m.valeur])).toEqual([
      ['moniteurs', 2],
      ['panne', 1],
      ['dispo', 99],
    ]);
    expect(l.lignes[1]).toMatchObject({ libelle: 'API', statut: 'rouge' });
    expect(l.verifie[0]).toMatchObject({ cle: 'checklist:sonde-externe', statut: 'rouge' });
    expect(o.configure()).toBe(true);
    expect(lectureUptimeRobot([]).statut).toBe('inconnu');
  });
});

describe('Uptime Kuma et Falco (texte Prometheus)', () => {
  it('parse le format texte', () => {
    const e = parserPrometheus('# commentaire\nx_total{a="1",b="deux \\"trois\\""} 4\nvide 0\nnan_metric{a="x"} NaN\n');
    expect(e).toEqual([
      { nom: 'x_total', etiquettes: { a: '1', b: 'deux "trois"' }, valeur: 4 },
      { nom: 'vide', etiquettes: {}, valeur: 0 },
    ]);
  });
  it('lit Uptime Kuma avec la clé en Basic et marque le certificat proche', async () => {
    const l = await uptimekuma.lire();
    expect(recues.at(-1)?.entetes.authorization).toBe(`Basic ${Buffer.from(':uk-x').toString('base64')}`);
    expect(l.statut).toBe('rouge');
    expect(l.mesures.find((m) => m.cle === 'certificat')).toMatchObject({ valeur: 9, statut: 'orange' });
    expect(l.lignes.map((x) => [x.libelle, x.statut])).toEqual([
      ['Site', 'vert'],
      ['API', 'rouge'],
    ]);
    expect(l.verifie[0].cle).toBe('checklist:sonde-externe');
  });
  it('lit Falco et compte les événements critiques', async () => {
    const l = await falco.lire();
    expect(recues.at(-1)?.chemin).toBe('/falco/metrics');
    expect(l.statut).toBe('rouge');
    expect(l.mesures.map((m) => m.valeur)).toEqual([2, 1, 2]);
    expect(l.lignes[0]).toMatchObject({ libelle: 'Read sensitive file', statut: 'orange' });
    expect(l.verifie[0]).toMatchObject({ cle: 'securite:runtime', statut: 'rouge' });
  });
});

describe('CrowdSec et Wazuh', () => {
  it('lit les décisions avec la clé de bouncer', async () => {
    const l = await crowdsec.lire();
    expect(recues.at(-1)?.entetes['x-api-key']).toBe('cs-x');
    expect(l.resume).toBe('2 décision(s) active(s), 2 bannissement(s)');
    expect(l.lignes[0]).toMatchObject({ libelle: '1.2.3.4', statut: 'vert' });
    expect(l.verifie[0].cle).toBe('securite:ssh-echecs');
  });
  it('s’authentifie en Basic puis lit les agents en Bearer', async () => {
    const l = await wazuh.lire();
    const auth = recues.find((r) => r.chemin === '/security/user/authenticate');
    expect(auth?.entetes.authorization).toBe(`Basic ${Buffer.from('wazuh:secret').toString('base64')}`);
    expect(recues.at(-1)?.entetes.authorization).toBe('Bearer jwt-x');
    expect(l.statut).toBe('orange');
    expect(l.mesures.map((m) => m.valeur)).toEqual([2, 1, 0]);
    expect(l.lignes[0]).toMatchObject({ libelle: 'comptoir-2', statut: 'orange' });
    expect(l.verifie.map((v) => v.cle)).toEqual(['securite:ssh-echecs', 'securite:integrite']);
  });
});

describe('rapports sur fichier', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rapports-'));

  it('Trivy et Grype : même lecture, pires vulnérabilités en tête, erreur lisible sans rapport', async () => {
    const trivyJson = {
      ArtifactName: 'officina/gateway:2.4',
      CreatedAt: new Date(Date.now() - 3_600_000).toISOString(),
      Results: [
        {
          Target: 'x',
          Vulnerabilities: [
            { VulnerabilityID: 'CVE-1', Severity: 'LOW', PkgName: 'a' },
            { VulnerabilityID: 'CVE-2', Severity: 'CRITICAL', PkgName: 'b', InstalledVersion: '1', FixedVersion: '2', Title: 'RCE' },
          ],
        },
      ],
    };
    config.trivyRapport = path.join(dossier, 'trivy.json');
    fs.writeFileSync(config.trivyRapport, JSON.stringify(trivyJson));
    const l = await trivy.lire();
    expect(l.statut).toBe('rouge');
    expect(l.lignes[0]).toMatchObject({ libelle: 'CVE-2 · b 1', statut: 'rouge', lien: 'https://nvd.nist.gov/vuln/detail/CVE-2' });
    expect(l.mesures.find((m) => m.cle === 'age')!.valeur).toBeCloseTo(1, 1);
    expect(l.verifie[0]).toMatchObject({ cle: 'securite:cve', statut: 'rouge' });
    const grype = parserRapport({
      descriptor: { timestamp: '2026-10-01T00:00:00Z' },
      source: { target: { userInput: 'img:1' } },
      matches: [{ vulnerability: { id: 'GHSA-1', severity: 'High', fix: { versions: ['3'] } }, artifact: { name: 'c', version: '2' } }],
    });
    expect(grype).toMatchObject({ cible: 'img:1', vulnerabilites: [{ id: 'GHSA-1', severite: 'elevee', corrigee: '3' }] });
    expect(lectureTrivy(grype, Date.parse('2026-10-20T00:00:00Z')).resume).toMatch(/plus de 7 jours/);
    config.trivyRapport = path.join(dossier, 'absent.json');
    await expect(trivy.lire()).rejects.toThrow(/introuvable/);
  });

  it('Lynis : indice, avertissements, suggestions', async () => {
    config.lynisRapport = path.join(dossier, 'lynis-report.dat');
    fs.writeFileSync(
      config.lynisRapport,
      [
        '# Lynis',
        'lynis_version=3.1.4',
        'hardening_index=64',
        'report_datetime_end=2026-11-05 03:00:00',
        'warning[]=KRNL-5830|Reboot needed|-|',
        'suggestion[]=SSH-7408|MaxAuthTries|-|',
        'suggestion[]=PKGS-7420|debsums|-|',
      ].join('\n'),
    );
    const l = await lynis.lire();
    expect(l.statut).toBe('orange');
    expect(l.mesures.map((m) => m.valeur).slice(0, 3)).toEqual([64, 1, 2]);
    expect(l.lignes[0]).toMatchObject({ libelle: 'KRNL-5830', statut: 'orange', lien: 'https://cisofy.com/lynis/controls/KRNL-5830/' });
    expect(l.verifie[0]).toMatchObject({ cle: 'securite:durcissement', statut: 'orange' });
    expect(parserLynis('hardening_index=abc').indice).toBeNull();
  });

  it('AIDE : totaux, chemins, et vert sans écart', async () => {
    config.aideRapport = path.join(dossier, 'aide.txt');
    fs.writeFileSync(
      config.aideRapport,
      [
        'AIDE found differences between database and filesystem!!',
        'Summary:',
        '  Total number of entries:\t48213',
        '  Added entries:\t\t1',
        '  Removed entries:\t\t0',
        '  Changed entries:\t\t2',
        '',
        '---------------------------------------------------',
        'Added entries:',
        '---------------------------------------------------',
        '',
        'f++++++++++: /etc/cron.d/evil',
        '',
        '---------------------------------------------------',
        'Changed entries:',
        '---------------------------------------------------',
        '',
        'f   ...    C: /etc/passwd',
        'd =.... mc..: /etc/ssh',
        '',
        'Detailed information about changes:',
        'File: /etc/passwd',
      ].join('\n'),
    );
    const l = await aide.lire();
    expect(l.statut).toBe('orange');
    expect(l.mesures.map((m) => m.valeur).slice(0, 4)).toEqual([2, 1, 0, 48213]);
    expect(l.lignes.map((x) => [x.libelle, x.detail])).toEqual([
      ['/etc/cron.d/evil', 'ajouté'],
      ['/etc/passwd', 'modifié'],
      ['/etc/ssh', 'modifié'],
    ]);
    expect(l.verifie[0]).toMatchObject({ cle: 'securite:integrite', statut: 'orange' });
    expect(lectureAide(parserAide('AIDE, version 0.18\n\n### All files match AIDE database. Looks okay!!\n'), null).statut).toBe('vert');
  });
});
