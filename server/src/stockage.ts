import fs from 'node:fs';
import path from 'node:path';
import type { Evenement, Incident } from '../../shared/types';
import type { ReglesSla, Ticket } from '../../shared/itsm';
import type { CalendrierService } from '../../shared/calendrier';
import { GROUPES_DEFAUT } from '../../shared/itsm';
import type { CompteStocke, SessionStockee } from './comptes';
import type { Notification } from './notifications';

/**
 * Ce que la supervision retient elle-même : tickets ITSM, fil d'activité,
 * cases cochées de la checklist, confirmations manuelles. Un simple fichier
 * JSON (donnees/etat.json), écrit de façon atomique : pas de base à installer.
 */

export interface Confirmation {
  fait: boolean;
  le: number | null;
  par: string;
  note: string;
}

export interface Equipe {
  membres: string[];
  groupes: string[];
}

export interface Parametres {
  calendrier: CalendrierService;
  sla: ReglesSla;
}

export interface Etat {
  version: 1;
  /** Ancien format (avant l'ITSM) : migré en tickets au démarrage. */
  incidents?: Incident[];
  tickets: Ticket[];
  /** Dernier numéro attribué par préfixe (INC, PRB, CHG, REQ). */
  compteurs: Record<string, number>;
  equipe: Equipe;
  comptes: CompteStocke[];
  sessions: SessionStockee[];
  notifications: Notification[];
  /** Absent : valeurs par défaut (config + délais du guide). */
  parametres?: Parametres;
  evenements: Evenement[];
  /** checklist, contrôles de sécurité, automatisations, étapes du pipeline. */
  confirmations: Record<string, Confirmation>;
  /** Mémoire de ce qui a déjà été vu, pour ne publier chaque événement qu'une fois. */
  vus: { alertes: Record<string, number>; derniereSauvegarde: number | null };
}

const VIDE: Etat = {
  version: 1,
  tickets: [],
  compteurs: {},
  equipe: { membres: [], groupes: [...GROUPES_DEFAUT] },
  comptes: [],
  sessions: [],
  notifications: [],
  evenements: [],
  confirmations: {},
  vus: { alertes: {}, derniereSauvegarde: null },
};

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
    if (!fs.existsSync(this.fichier)) return structuredClone(VIDE);
    try {
      const brut = JSON.parse(fs.readFileSync(this.fichier, 'utf8')) as Partial<Etat>;
      return {
        ...structuredClone(VIDE),
        ...brut,
        vus: { ...VIDE.vus, ...(brut.vus ?? {}) },
        equipe: { ...structuredClone(VIDE.equipe), ...(brut.equipe ?? {}) },
        tickets: brut.tickets ?? [],
        compteurs: brut.compteurs ?? {},
        comptes: brut.comptes ?? [],
        sessions: brut.sessions ?? [],
        notifications: brut.notifications ?? [],
      } as Etat;
    } catch (e) {
      // Ne jamais écraser des tickets : on met le fichier illisible de côté.
      const copie = `${this.fichier}.illisible-${Date.now()}`;
      fs.copyFileSync(this.fichier, copie);
      console.error(`[supervision] ${this.fichier} illisible (${(e as Error).message}) : copie dans ${copie}, départ à vide.`);
      return structuredClone(VIDE);
    }
  }

  /** Une copie par jour (etat-AAAA-MM-JJ.json), les 30 dernières gardées. */
  copieDuJour(): void {
    const dossier = path.join(path.dirname(this.fichier), 'copies');
    fs.mkdirSync(dossier, { recursive: true });
    const jour = new Date().toISOString().slice(0, 10);
    const cible = path.join(dossier, `etat-${jour}.json`);
    if (!fs.existsSync(cible) && fs.existsSync(this.fichier)) fs.copyFileSync(this.fichier, cible);
    const copies = fs
      .readdirSync(dossier)
      .filter((f) => /^etat-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    for (const ancienne of copies.slice(0, Math.max(0, copies.length - 30))) fs.unlinkSync(path.join(dossier, ancienne));
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
