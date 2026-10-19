import { randomUUID } from 'node:crypto';
import type { RechercheJournaux } from '../../shared/journaux';
import { ErreurMetier } from './erreurs';
import type { Stockage } from './stockage';

const MAX = 50;
const PERIODES = [15, 60, 360, 1440];
const NIVEAUX = ['', 'warn', 'error'];

/** Recherches de journaux gardées pour toute l'équipe (même nom = remplacée). */
export class RecherchesJournaux {
  constructor(private readonly stockage: Stockage) {}

  lister(): RechercheJournaux[] {
    return this.stockage.donnees.recherches;
  }

  enregistrer(champs: Record<string, unknown>, auteur: string): RechercheJournaux {
    const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const nom = texte(champs.nom, 60);
    if (!nom) throw new ErreurMetier('Donnez un nom à la recherche');
    const niveau = texte(champs.niveau, 10);
    const minutes = Number(champs.minutes);
    const r: RechercheJournaux = {
      id: randomUUID(),
      nom,
      service: texte(champs.service, 40),
      niveau: NIVEAUX.includes(niveau) ? niveau : '',
      texte: texte(champs.texte, 200),
      minutes: PERIODES.includes(minutes) ? minutes : 60,
      par: auteur,
      le: Date.now(),
    };
    this.stockage.modifier((e) => {
      e.recherches = [r, ...e.recherches.filter((x) => x.nom.toLowerCase() !== nom.toLowerCase())].slice(0, MAX);
    });
    return r;
  }

  supprimer(id: string): void {
    this.stockage.modifier((e) => {
      e.recherches = e.recherches.filter((x) => x.id !== id);
    });
  }
}
