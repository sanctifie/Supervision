import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Tickets } from './tickets';
import { PiecesJointes, TAILLE_MAX, nomPropre } from './pieces';

function preparer() {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pieces-'));
  const stockage = new Stockage(dossier);
  const tickets = new Tickets(stockage, { creerSilence: async () => '', supprimerSilence: async () => undefined });
  return { dossier, tickets, pieces: new PiecesJointes(dossier, stockage, tickets) };
}

describe('pièces jointes', () => {
  it('nettoie le nom (jamais utilisé comme chemin)', () => {
    expect(nomPropre('../../etc/passwd')).toBe('passwd');
    expect(nomPropre('C:\\\\Users\\\\x\\\\capture écran.png')).toBe('capture écran.png');
    expect(nomPropre('a<b>:c?.txt')).toBe('a_b__c_.txt');
    expect(nomPropre('')).toBe('fichier');
  });

  it('ajoute, lit, refuse les fichiers trop gros, supprime', () => {
    const { tickets, pieces, dossier } = preparer();
    const t = tickets.creer('incident', { titre: 'Caisse' }, 'Alex');
    const p = pieces.ajouter(t.numero, 'capture.png', 'image/png', Buffer.from('png'), 'Alex');
    const lu = pieces.lire(t.numero, p.id);
    expect(fs.readFileSync(lu.fichier, 'utf8')).toBe('png');
    expect(lu.fichier.startsWith(path.join(dossier, 'pieces', t.id))).toBe(true);
    expect(lu.affichable).toBe(true);
    const html = pieces.ajouter(t.numero, 'page.html', 'text/html', Buffer.from('<script>'), 'Alex');
    expect(pieces.lire(t.numero, html.id).affichable).toBe(false);
    expect(() => pieces.ajouter(t.numero, 'gros.bin', 'application/octet-stream', Buffer.alloc(TAILLE_MAX + 1), 'Alex')).toThrow(/trop gros/);
    expect(() => pieces.supprimer(t.numero, p.id, 'Béa', false)).toThrow(/auteur ou un agent/);
    pieces.supprimer(t.numero, p.id, 'Alex', false);
    expect(fs.existsSync(lu.fichier)).toBe(false);
    expect(t.piecesJointes?.map((x) => x.nom)).toEqual(['page.html']);
    expect(() => pieces.lire(t.numero, '../../etat.json')).toThrow(/introuvable/);
  });
});
