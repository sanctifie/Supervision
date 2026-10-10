import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Stockage } from './stockage';
import type { Tickets } from './tickets';
import { ErreurMetier } from './erreurs';
import type { PieceJointe } from '../../shared/itsm';

/**
 * Pièces jointes des tickets : fichiers rangés dans donnees/pieces/<ticket>/<id>
 * (le nom d'origine n'est jamais utilisé comme chemin), 10 Mo chacun,
 * 20 par ticket.
 */

export const TAILLE_MAX = 10 * 1024 * 1024;
const MAX_PAR_TICKET = 20;

/** Types affichables dans le navigateur ; tout le reste est téléchargé. */
const AFFICHABLES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain']);

export function nomPropre(nom: string): string {
  const base = path.basename(nom.replace(/\\/g, '/'));
  const propre = base
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .trim()
    .slice(0, 120);
  return propre || 'fichier';
}

export class PiecesJointes {
  private readonly racine: string;

  constructor(
    dossierDonnees: string,
    private readonly stockage: Stockage,
    private readonly tickets: Tickets,
  ) {
    this.racine = path.join(dossierDonnees, 'pieces');
  }

  private chemin(ticketId: string, pieceId: string): string {
    if (!/^[0-9a-f-]{36}$/.test(ticketId) || !/^[0-9a-f-]{36}$/.test(pieceId)) throw new ErreurMetier('Pièce jointe introuvable');
    return path.join(this.racine, ticketId, pieceId);
  }

  ajouter(numero: string, nom: string, type: string, contenu: Buffer, auteur: string): PieceJointe {
    const t = this.tickets.trouver(numero);
    if (!t) throw new ErreurMetier(`Ticket ${numero} introuvable`);
    if (!contenu.length) throw new ErreurMetier('Fichier vide');
    if (contenu.length > TAILLE_MAX) throw new ErreurMetier('Fichier trop gros (10 Mo au plus)');
    if ((t.piecesJointes ?? []).length >= MAX_PAR_TICKET) throw new ErreurMetier(`${MAX_PAR_TICKET} pièces jointes au plus par ticket`);
    const piece: PieceJointe = {
      id: randomUUID(),
      nom: nomPropre(nom),
      taille: contenu.length,
      type: /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type.toLowerCase() : 'application/octet-stream',
      par: auteur,
      le: Date.now(),
    };
    const fichier = this.chemin(t.id, piece.id);
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    fs.writeFileSync(fichier, contenu);
    this.stockage.modifier(() => {
      t.piecesJointes = [...(t.piecesJointes ?? []), piece];
      t.activite.push({ t: piece.le, auteur, type: 'systeme', texte: `Pièce jointe ajoutée : ${piece.nom}` });
      t.majLe = piece.le;
    });
    return piece;
  }

  /** Le fichier à servir, avec la façon sûre de le servir. */
  lire(numero: string, pieceId: string): { fichier: string; piece: PieceJointe; affichable: boolean } {
    const t = this.tickets.trouver(numero);
    const piece = t?.piecesJointes?.find((p) => p.id === pieceId);
    if (!t || !piece) throw new ErreurMetier('Pièce jointe introuvable');
    const fichier = this.chemin(t.id, piece.id);
    if (!fs.existsSync(fichier)) throw new ErreurMetier('Pièce jointe introuvable (fichier absent)');
    return { fichier, piece, affichable: AFFICHABLES.has(piece.type) };
  }

  supprimer(numero: string, pieceId: string, auteur: string, estAgent: boolean): void {
    const t = this.tickets.trouver(numero);
    const piece = t?.piecesJointes?.find((p) => p.id === pieceId);
    if (!t || !piece) throw new ErreurMetier('Pièce jointe introuvable');
    if (!estAgent && piece.par !== auteur) throw new ErreurMetier('Seul son auteur ou un agent peut retirer cette pièce jointe');
    fs.rmSync(this.chemin(t.id, piece.id), { force: true });
    this.stockage.modifier(() => {
      t.piecesJointes = (t.piecesJointes ?? []).filter((p) => p.id !== pieceId);
      t.activite.push({ t: Date.now(), auteur, type: 'systeme', texte: `Pièce jointe retirée : ${piece.nom}` });
      t.majLe = Date.now();
    });
  }
}
