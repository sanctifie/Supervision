import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Incidents } from './incidents';
import { Stockage } from './stockage';
import type { Alerte } from '../../shared/types';

const alerte = (id: string, priorite: Alerte['priorite'], debut: number): Alerte => ({
  id, nom: 'ServiceInjoignable', gravite: 'critique', resume: 'notify ne répond plus', action: '', debut, labels: {}, silencieuse: false, priorite, runbook: null,
});

describe('cycle d’incident', () => {
  it('ouvre sur P1, se résout seul, calcule MTTR', () => {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-'));
    const inc = new Incidents(new Stockage(dossier));
    const t0 = Date.now() - 20 * 60_000;
    inc.synchroniser([alerte('a1', 'P1', t0)]);
    inc.synchroniser([alerte('a1', 'P1', t0)]);
    expect(inc.vue().incidents).toHaveLength(1);
    const id = inc.vue().incidents[0].id;
    inc.acquitter(id, 'Alex');
    expect(inc.trouver(id)?.statut).toBe('acquitte');
    inc.synchroniser([]);
    const v = inc.vue();
    expect(v.incidents[0].statut).toBe('resolu');
    expect(v.indicateurs.mttrMinutes).toBeGreaterThan(19);
    expect(v.indicateurs.ouverts).toBe(0);
  });
  it('n’ouvre rien pour une alerte P3 ou silencieuse', () => {
    const inc = new Incidents(new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'sup-'))));
    inc.synchroniser([alerte('b', 'P3', Date.now()), { ...alerte('c', 'P1', Date.now()), silencieuse: true }]);
    expect(inc.vue().incidents).toHaveLength(0);
  });
});
