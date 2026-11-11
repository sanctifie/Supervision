import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Tableaux } from './tableaux';

describe('tableaux de bord personnalisés', () => {
  it('enregistre des panneaux propres et lit chaque requête sans que l’une bloque l’autre', async () => {
    const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'tab-')));
    const demandes: [string, number][] = [];
    const tableaux = new Tableaux(stockage, async (requete, heures) => {
      demandes.push([requete, heures]);
      if (requete === 'cassé(') throw new Error('Requête refusée par Prometheus');
      return Array.from({ length: 12 }, (_, i) => ({ nom: `s${i}`, points: [{ t: 1, v: i }] }));
    });
    expect(() => tableaux.creer({ nom: '' })).toThrow(/Nom/);
    expect(() => tableaux.creer({ nom: 'T', panneaux: [{ titre: 'P', requete: '' }] })).toThrow(/requête obligatoire/);
    expect(() => tableaux.creer({ nom: 'T', panneaux: Array(21).fill({ titre: 'P', requete: 'up' }) })).toThrow(/20 panneaux/);
    const t = tableaux.creer({ nom: ' Production ' });
    const m = tableaux.modifier(t.id, {
      panneaux: [
        { titre: 'CPU', requete: 'cpu', type: 'courbe', unite: '%' },
        { titre: 'Cassé', requete: 'cassé(', type: 'n’importe quoi' },
      ],
    });
    expect(m).toMatchObject({
      nom: 'Production',
      panneaux: [
        { titre: 'CPU', type: 'courbe', unite: '%' },
        { titre: 'Cassé', type: 'courbe' },
      ],
    });
    const v = await tableaux.vue(t.id, '999999');
    expect(demandes).toEqual([
      ['cpu', 720],
      ['cassé(', 720],
    ]);
    expect(v.donnees[m.panneaux[0].id]).toMatchObject({ erreur: null });
    expect(v.donnees[m.panneaux[0].id].series).toHaveLength(10);
    expect(v.donnees[m.panneaux[1].id]).toEqual({ series: [], erreur: 'Requête refusée par Prometheus' });
    // Renommer garde les panneaux et leurs identifiants.
    expect(tableaux.modifier(t.id, { nom: 'Prod' }).panneaux.map((p) => p.id)).toEqual(m.panneaux.map((p) => p.id));
    tableaux.supprimer(t.id);
    expect(tableaux.lister()).toEqual([]);
    await expect(tableaux.vue(t.id, 6)).rejects.toThrow(/introuvable/);
  });
});
