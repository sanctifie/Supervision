import fs from 'node:fs';
import path from 'node:path';
import type { Evenement, Incident } from '../../shared/types';

/**
 * Ce que la supervision retient elle-même : incidents, fil d'activité,
 * cases cochées de la checklist, confirmations manuelles. Un simple fichier
 * JSON (donnees/etat.json), écrit de façon atomique : pas de base à installer.
 */

export interface Confirmation {
  fait: boolean;
  le: number | null;
  par: string;
  note: string;
}

export interface Etat {
  version: 1;
  incidents: Incident[];
  evenements: Evenement[];
  /** checklist, contrôles de sécurité, automatisations, étapes du pipeline. */
  confirmations: Record<string, Confirmation>;
  /** Mémoire de ce qui a déjà été vu, pour ne publier chaque événement qu'une fois. */
  vus: { alertes: Record<string, number>; derniereSauvegarde: number | null };
}

const VIDE: Etat = { version: 1, incidents: [], evenements: [], confirmations: {}, vus: { alertes: {}, derniereSauvegarde: null } };

export class Stockage {
  private etat: Etat;
  private minuterie: NodeJS.Timeout | null = null;
  private readonly fichier: string;

  constructor(dossier: string) {
    this.fichier = path.join(dossier, 'etat.json');
    fs.mkdirSync(dossier, { recursive: true });
    this.etat = this.lire();
  }

  private lire(): Etat {
    try {
      const brut = JSON.parse(fs.readFileSync(this.fichier, 'utf8')) as Partial<Etat>;
      return {
        ...structuredClone(VIDE),
        ...brut,
        vus: { ...VIDE.vus, ...(brut.vus ?? {}) },
      } as Etat;
    } catch {
      return structuredClone(VIDE);
    }
  }

  get donnees(): Etat {
    return this.etat;
  }

  /** Enregistre sur disque (regroupe les écritures rapprochées). */
  modifier(f: (e: Etat) => void): void {
    f(this.etat);
    if (this.minuterie) return;
    this.minuterie = setTimeout(() => {
      this.minuterie = null;
      this.ecrireMaintenant();
    }, 200);
  }

  ecrireMaintenant(): void {
    const tmp = `${this.fichier}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.etat, null, 2));
    fs.renameSync(tmp, this.fichier);
  }

  ajouterEvenement(e: Evenement): void {
    this.modifier((etat) => {
      etat.evenements.unshift(e);
      etat.evenements = etat.evenements.slice(0, 300);
    });
  }

  confirmation(cle: string): Confirmation | undefined {
    return this.etat.confirmations[cle];
  }

  confirmer(cle: string, fait: boolean, par: string, note?: string): Confirmation {
    const actuelle = this.etat.confirmations[cle];
    const c: Confirmation = { fait, le: fait ? Date.now() : null, par, note: note ?? actuelle?.note ?? '' };
    this.modifier((etat) => {
      etat.confirmations[cle] = c;
    });
    return c;
  }
}
