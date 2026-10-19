import { describe, expect, it } from 'vitest';
import { analyser, categoriser, histogramme, motifDe, versCsv } from './journaux';
import type { LigneJournal } from './types';

const l = (t: number, message: string, niveau: LigneJournal['niveau'] = 'info', service = 'sales'): LigneJournal => ({ t, service, niveau, message });

describe('motifDe', () => {
  it('efface chiffres, identifiants et adresses', () => {
    expect(motifDe('POST /v1/sales 201 — vente (12 lignes, 4500 FCFA)')).toBe('POST /v#/sales # — vente (# lignes, # FCFA)');
    expect(motifDe('user 3f2a9c1e-1234-4abc-9def-0123456789ab depuis 10.0.0.12:4222')).toBe('user <id> depuis <ip>');
    expect(motifDe('{"level":50,"msg":"timeout après 5000 ms"}')).toBe('timeout après # ms');
    expect(motifDe('{pas du json')).toBe('{pas du json');
  });
});

describe('categoriser', () => {
  const debut = 0;
  const fin = 1000;
  const lignes = [
    l(100, 'Connexion refusée : PIN incorrect (poste comptoir-1)', 'warn', 'identity'),
    l(300, 'Connexion refusée : PIN incorrect (poste comptoir-7)', 'warn', 'gateway'),
    l(900, 'ECONNREFUSED nats:4222 — nouvel essai dans 5 s', 'error', 'notify'),
    l(950, 'ECONNREFUSED nats:4222 — nouvel essai dans 5 s', 'error', 'notify'),
    l(400, 'GET /v1/x 200', 'info'),
  ];
  it('regroupe les lignes semblables, erreurs d’abord, et repère les nouveautés', () => {
    const c = categoriser(lignes, debut, fin);
    expect(c.map((x) => [x.niveau, x.nombre])).toEqual([
      ['error', 2],
      ['warn', 2],
      ['info', 1],
    ]);
    expect(c[0]).toMatchObject({ nouveau: true, services: ['notify'], premier: 900, dernier: 950 });
    expect(c[1]).toMatchObject({ nouveau: false, services: ['gateway', 'identity'] });
    expect(c[0].recherche).toBe('ECONNREFUSED nats:');
    expect(c[1].recherche).toBe('Connexion refusée : PIN incorrect (poste comptoir-');
  });
  it('sépare les niveaux d’un même message', () => {
    expect(categoriser([l(1, 'x 200', 'info'), l(2, 'x 502', 'error')], 0, 10)).toHaveLength(2);
  });
});

describe('histogramme', () => {
  it('compte par niveau et ignore les lignes hors période', () => {
    const h = histogramme([l(5, 'a', 'error'), l(5, 'b', 'info'), l(95, 'c', 'warn'), l(500, 'hors période')], 0, 100, 10);
    expect(h).toHaveLength(10);
    expect(h[0]).toMatchObject({ error: 1, info: 1 });
    expect(h[9].warn).toBe(1);
    expect(h.reduce((s, x) => s + x.debug + x.info + x.warn + x.error, 0)).toBe(3);
  });
});

describe('versCsv', () => {
  it('échappe les guillemets et neutralise les formules', () => {
    const csv = versCsv([l(0, 'dit "bonjour", puis =SUM(A1)'), l(0, '=cmd|calc', 'warn')]);
    const [entete, a, b] = csv.split('\r\n');
    expect(entete).toBe('horodatage,service,niveau,message');
    expect(a).toBe('"1970-01-01T00:00:00.000Z","sales","info","dit ""bonjour"", puis =SUM(A1)"');
    expect(b).toContain(`"'=cmd|calc"`);
  });
});

describe('analyser', () => {
  it('lecture tronquée : l’histogramme part de la plus ancienne ligne lue', () => {
    const lignes = [l(900, 'a'), l(800, 'b')];
    const a = analyser(lignes, 0, 1000, 2);
    expect(a).toMatchObject({ tronque: true, debut: 800, lignes: 2 });
    expect(analyser(lignes, 0, 1000, 10)).toMatchObject({ tronque: false, debut: 0 });
    expect(a.services).toEqual([{ service: 'sales', nombre: 2, erreurs: 0 }]);
  });
});
