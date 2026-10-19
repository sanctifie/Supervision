import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { RecherchesJournaux } from './recherches';

describe('recherches de journaux enregistrées', () => {
  const neuf = () => new RecherchesJournaux(new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'rech-'))));

  it('valide les champs, remplace un nom identique, supprime', () => {
    const r = neuf();
    expect(() => r.enregistrer({ nom: '  ' }, 'Alex')).toThrow(/nom/);
    const a = r.enregistrer({ nom: 'Erreurs notify', service: 'notify', niveau: 'error', texte: 'ECONNREFUSED', minutes: 360 }, 'Alex');
    expect(a).toMatchObject({ service: 'notify', niveau: 'error', minutes: 360, par: 'Alex' });
    // Valeurs hors liste : retour aux valeurs par défaut.
    expect(r.enregistrer({ nom: 'Bizarre', niveau: 'fatal', minutes: 7 }, 'Alex')).toMatchObject({ niveau: '', minutes: 60 });
    r.enregistrer({ nom: 'erreurs NOTIFY', texte: 'timeout' }, 'Béa');
    expect(r.lister().map((x) => [x.nom, x.texte])).toEqual([
      ['erreurs NOTIFY', 'timeout'],
      ['Bizarre', ''],
    ]);
    r.supprimer(r.lister()[0].id);
    expect(r.lister()).toHaveLength(1);
  });

  it('garde 50 recherches au plus', () => {
    const r = neuf();
    for (let i = 0; i < 55; i++) r.enregistrer({ nom: `r${i}` }, 'Alex');
    expect(r.lister()).toHaveLength(50);
    expect(r.lister()[0].nom).toBe('r54');
  });
});
