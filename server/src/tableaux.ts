import { randomUUID } from 'node:crypto';
import { ErreurMetier } from './erreurs';
import type { Stockage } from './stockage';
import type { Panneau, SeriePanneau, TableauPerso, VueTableau } from '../../shared/tableaux';

/**
 * Tableaux de bord personnalisés. Les requêtes PromQL sont enregistrées par les
 * agents ; un lecteur ne fait qu'exécuter celles d'un tableau existant.
 */

const MAX_TABLEAUX = 50;
const MAX_PANNEAUX = 20;
const MAX_SERIES = 10;

export type LirePlage = (requete: string, heures: number) => Promise<SeriePanneau[]>;

export class Tableaux {
  constructor(
    private readonly stockage: Stockage,
    private readonly lirePlage: LirePlage,
  ) {}

  private get tableaux(): TableauPerso[] {
    return this.stockage.donnees.tableaux ?? [];
  }
  private tableau(id: string): TableauPerso {
    const t = this.tableaux.find((x) => x.id === id);
    if (!t) throw new ErreurMetier('Tableau de bord introuvable');
    return t;
  }

  lister(): { id: string; nom: string; panneaux: number }[] {
    return this.tableaux.map((t) => ({ id: t.id, nom: t.nom, panneaux: t.panneaux.length }));
  }

  private propre(corps: { nom?: unknown; panneaux?: unknown }): Omit<TableauPerso, 'id'> {
    const nom = String(corps.nom ?? '')
      .trim()
      .slice(0, 80);
    if (!nom) throw new ErreurMetier('Nom du tableau obligatoire');
    const bruts = Array.isArray(corps.panneaux) ? corps.panneaux : [];
    if (bruts.length > MAX_PANNEAUX) throw new ErreurMetier(`${MAX_PANNEAUX} panneaux au plus par tableau`);
    const panneaux = bruts.map((b: Record<string, unknown>): Panneau => {
      const titre = String(b?.titre ?? '')
        .trim()
        .slice(0, 80);
      const requete = String(b?.requete ?? '').trim();
      if (!titre) throw new ErreurMetier('Chaque panneau a un titre');
      if (!requete || requete.length > 2000) throw new ErreurMetier(`Panneau « ${titre} » : requête obligatoire (2 000 caractères au plus)`);
      return {
        id: typeof b.id === 'string' && b.id ? b.id.slice(0, 40) : randomUUID(),
        titre,
        type: b.type === 'valeur' ? 'valeur' : 'courbe',
        requete,
        unite: String(b.unite ?? '')
          .trim()
          .slice(0, 12),
      };
    });
    return { nom, panneaux };
  }

  creer(corps: { nom?: unknown; panneaux?: unknown }): TableauPerso {
    if (this.tableaux.length >= MAX_TABLEAUX) throw new ErreurMetier(`${MAX_TABLEAUX} tableaux de bord au plus`);
    const t: TableauPerso = { id: randomUUID(), ...this.propre(corps) };
    this.stockage.modifier((e) => {
      e.tableaux = [...(e.tableaux ?? []), t];
    });
    return t;
  }

  modifier(id: string, corps: { nom?: unknown; panneaux?: unknown }): TableauPerso {
    const t = this.tableau(id);
    const nouveau = this.propre({ nom: corps.nom ?? t.nom, panneaux: corps.panneaux ?? t.panneaux });
    this.stockage.modifier(() => Object.assign(t, nouveau));
    return t;
  }

  supprimer(id: string): void {
    this.tableau(id);
    this.stockage.modifier((e) => {
      e.tableaux = this.tableaux.filter((x) => x.id !== id);
    });
  }

  /** Le tableau et les données de chaque panneau ; une requête en erreur n'empêche pas les autres. */
  async vue(id: string, heuresBrutes: unknown): Promise<VueTableau> {
    const tableau = this.tableau(id);
    const heures = Math.min(24 * 30, Math.max(1, Math.round(Number(heuresBrutes) || 6)));
    const lectures = await Promise.all(
      tableau.panneaux.map((p) =>
        this.lirePlage(p.requete, heures).then(
          (series) => ({ series: series.slice(0, MAX_SERIES), erreur: null }),
          (e) => ({ series: [], erreur: (e as Error).message || 'Lecture impossible' }),
        ),
      ),
    );
    return { tableau, donnees: Object.fromEntries(tableau.panneaux.map((p, i) => [p.id, lectures[i]])) };
  }
}
