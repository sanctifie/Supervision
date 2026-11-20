import { randomUUID } from 'node:crypto';
import type { Stockage } from './stockage';
import { ErreurMetier } from './erreurs';
import type { FiltreJournaux, LigneJournal } from '../../shared/types';

/**
 * Explorateur de journaux façon Kibana : les recherches enregistrées,
 * partagées avec l'équipe, et les règles d'alerte sur journaux (« plus de
 * N lignes qui correspondent en M minutes → prévenir »).
 */

export interface RegleAlerteJournaux {
  seuil: number;
  minutes: number;
  actif: boolean;
  /** Dernier déclenchement (une alerte au plus par fenêtre). */
  derniere: number | null;
}

export interface Recherche {
  id: string;
  nom: string;
  filtre: Required<Pick<FiltreJournaux, 'minutes'>> & Pick<FiltreJournaux, 'service' | 'niveau' | 'texte' | 'sauf'>;
  par: string;
  le: number;
  alerte: RegleAlerteJournaux | null;
}

export type TypePanneau = 'histogramme' | 'compteur' | 'repartition' | 'lignes';

/** Un panneau de tableau de bord : une visualisation d'une recherche enregistrée (ou de tout). */
export interface Panneau {
  id: string;
  titre: string;
  type: TypePanneau;
  /** Recherche enregistrée filtrant le panneau ; null : toutes les lignes. */
  recherche: string | null;
  /** 1 : demi-largeur, 2 : pleine largeur. */
  largeur: 1 | 2;
}

export interface TableauDeBord {
  id: string;
  nom: string;
  /** Période commune à tous les panneaux. */
  minutes: number;
  panneaux: Panneau[];
  par: string;
  majLe: number;
}

const TYPES_PANNEAU: TypePanneau[] = ['histogramme', 'compteur', 'repartition', 'lignes'];

const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export class Explorateur {
  private evalueLe = new Map<string, number>();

  constructor(
    private readonly stockage: Stockage,
    private readonly lire: (f: FiltreJournaux) => Promise<LigneJournal[]>,
    private readonly prevenir: (n: { titre: string; texte: string; lien: string }) => void,
  ) {}

  lister(): Recherche[] {
    return this.stockage.donnees.recherches;
  }

  private valider(d: Record<string, unknown>, initial?: Recherche): Omit<Recherche, 'id' | 'par' | 'le'> {
    const nom = texte(d.nom, 80);
    if (!nom) throw new ErreurMetier('Donnez un nom à la recherche');
    const f = (d.filtre ?? {}) as Record<string, unknown>;
    const niveau = texte(f.niveau, 10);
    if (niveau && !['warn', 'error'].includes(niveau)) throw new ErreurMetier('Niveau : warn ou error');
    const filtre = {
      service: texte(f.service, 60) || undefined,
      niveau: niveau || undefined,
      texte: texte(f.texte, 200) || undefined,
      sauf: texte(f.sauf, 200) || undefined,
      minutes: Math.min(1440, Math.max(5, Number(f.minutes) || 60)),
    };
    let alerte: RegleAlerteJournaux | null = null;
    const a = d.alerte as Record<string, unknown> | null | undefined;
    if (a) {
      const seuil = Math.round(Number(a.seuil));
      const minutes = Math.round(Number(a.minutes));
      if (!(seuil >= 1 && seuil <= 1000)) throw new ErreurMetier('Seuil d’alerte : de 1 à 1000 lignes');
      if (!(minutes >= 5 && minutes <= 1440)) throw new ErreurMetier('Fenêtre d’alerte : de 5 à 1440 minutes');
      alerte = { seuil, minutes, actif: a.actif === undefined ? true : !!a.actif, derniere: initial?.alerte?.derniere ?? null };
    }
    return { nom, filtre, alerte };
  }

  creer(d: Record<string, unknown>, par: string): Recherche {
    const r: Recherche = { ...this.valider(d), id: randomUUID(), par, le: Date.now() };
    this.stockage.modifier((e) => {
      e.recherches.push(r);
      e.recherches = e.recherches.slice(-200);
    });
    return r;
  }

  modifier(id: string, d: Record<string, unknown>): Recherche {
    const r = this.stockage.donnees.recherches.find((x) => x.id === id);
    if (!r) throw new ErreurMetier('Recherche introuvable');
    const v = this.valider({ ...r, ...d }, r);
    this.stockage.modifier(() => Object.assign(r, v));
    return r;
  }

  supprimer(id: string): void {
    this.stockage.modifier((e) => {
      e.recherches = e.recherches.filter((r) => r.id !== id);
      // Les panneaux qui l'utilisaient montrent désormais toutes les lignes.
      for (const t of e.tableaux) for (const p of t.panneaux) if (p.recherche === id) p.recherche = null;
    });
  }

  /** Boucle de fond : évalue chaque règle au plus une fois par minute. */
  async evaluer(maintenant = Date.now()): Promise<void> {
    for (const r of this.stockage.donnees.recherches) {
      const a = r.alerte;
      if (!a?.actif || (this.evalueLe.get(r.id) ?? 0) > maintenant - 60_000) continue;
      this.evalueLe.set(r.id, maintenant);
      if (a.derniere && maintenant - a.derniere < a.minutes * 60_000) continue;
      const lignes = await this.lire({ ...r.filtre, minutes: a.minutes, limite: a.seuil }).catch(() => null);
      if (!lignes || lignes.length < a.seuil) continue;
      this.stockage.modifier(() => (a.derniere = maintenant));
      const texteAlerte = `Au moins ${a.seuil} ligne(s) en ${a.minutes} min${r.filtre.service ? ` (${r.filtre.service})` : ''}. Dernière : ${lignes[0].message.slice(0, 200)}`;
      this.stockage.ajouterEvenement({ t: maintenant, type: 'alerte', titre: `Journaux : « ${r.nom} »`, detail: texteAlerte, statut: 'orange' });
      this.prevenir({ titre: `🔎 Alerte journaux : ${r.nom}`, texte: texteAlerte, lien: `/journaux?recherche=${r.id}` });
    }
  }

  // --- Tableaux de bord (façon Kibana Dashboard) -------------------------------------

  tableaux(): TableauDeBord[] {
    return this.stockage.donnees.tableaux;
  }

  private validerTableau(d: Record<string, unknown>): Pick<TableauDeBord, 'nom' | 'minutes' | 'panneaux'> {
    const nom = texte(d.nom, 80);
    if (!nom) throw new ErreurMetier('Donnez un nom au tableau de bord');
    const minutes = Number(d.minutes);
    if (![15, 60, 360, 1440].includes(minutes)) throw new ErreurMetier('Période : 15, 60, 360 ou 1440 minutes');
    if (!Array.isArray(d.panneaux) || d.panneaux.length > 20) throw new ErreurMetier('Panneaux : une liste de 20 au plus');
    const panneaux = d.panneaux.map((x: Record<string, unknown>): Panneau => {
      const type = x?.type as TypePanneau;
      if (!TYPES_PANNEAU.includes(type)) throw new ErreurMetier('Type de panneau inconnu');
      const recherche = texte(x.recherche, 60) || null;
      if (recherche && !this.stockage.donnees.recherches.some((r) => r.id === recherche)) throw new ErreurMetier('Recherche enregistrée introuvable');
      return { id: texte(x.id, 60) || randomUUID(), titre: texte(x.titre, 80) || 'Panneau', type, recherche, largeur: x.largeur === 2 ? 2 : 1 };
    });
    return { nom, minutes, panneaux };
  }

  creerTableau(d: Record<string, unknown>, par: string): TableauDeBord {
    const t: TableauDeBord = { ...this.validerTableau(d), id: randomUUID(), par, majLe: Date.now() };
    this.stockage.modifier((e) => e.tableaux.push(t));
    return t;
  }

  modifierTableau(id: string, d: Record<string, unknown>, par: string): TableauDeBord {
    const t = this.stockage.donnees.tableaux.find((x) => x.id === id);
    if (!t) throw new ErreurMetier('Tableau de bord introuvable');
    const v = this.validerTableau({ ...t, ...d });
    this.stockage.modifier(() => Object.assign(t, v, { par, majLe: Date.now() }));
    return t;
  }

  supprimerTableau(id: string): void {
    this.stockage.modifier((e) => (e.tableaux = e.tableaux.filter((t) => t.id !== id)));
  }
}
