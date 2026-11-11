import { randomUUID } from 'node:crypto';
import { ErreurMetier } from './erreurs';
import type { Stockage } from './stockage';
import type { Tickets } from './tickets';
import { estOuvert, type Ticket } from '../../shared/itsm';
import type { Projet, ResumeProjet, Sprint, VueProjet } from '../../shared/projets';

/** Projets, backlog et sprints. Les tâches elles-mêmes sont des tickets (voir Tickets). */
export class Projets {
  constructor(
    private readonly stockage: Stockage,
    private readonly tickets: Tickets,
  ) {}

  private get projets(): Projet[] {
    return this.stockage.donnees.projets ?? [];
  }
  private get sprints(): Sprint[] {
    return this.stockage.donnees.sprints ?? [];
  }
  private taches(cle: string): Ticket[] {
    return this.stockage.donnees.tickets.filter((t) => t.type === 'tache' && t.projet === cle);
  }
  private projet(cle: string): Projet {
    const p = this.projets.find((x) => x.cle === cle);
    if (!p) throw new ErreurMetier(`Projet ${cle} introuvable`);
    return p;
  }
  private sprint(id: string): Sprint {
    const s = this.sprints.find((x) => x.id === id);
    if (!s) throw new ErreurMetier('Sprint introuvable');
    return s;
  }

  lister(): ResumeProjet[] {
    return this.projets.map((p) => ({
      ...p,
      ouvertes: this.taches(p.cle).filter(estOuvert).length,
      sprintActif: this.sprints.find((s) => s.projet === p.cle && s.statut === 'actif')?.nom ?? null,
    }));
  }

  creer(corps: { cle?: unknown; nom?: unknown; description?: unknown }, par: string): Projet {
    const cle = String(corps.cle ?? '')
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{2,6}$/.test(cle)) throw new ErreurMetier('Clé du projet : 2 à 6 lettres (par exemple OPS)');
    if (this.projets.some((p) => p.cle === cle)) throw new ErreurMetier(`Le projet ${cle} existe déjà`);
    const nom = String(corps.nom ?? '')
      .trim()
      .slice(0, 80);
    if (!nom) throw new ErreurMetier('Nom du projet obligatoire');
    const p: Projet = {
      cle,
      nom,
      description: String(corps.description ?? '')
        .trim()
        .slice(0, 500),
      creeLe: Date.now(),
    };
    this.stockage.modifier((e) => {
      e.projets = [...(e.projets ?? []), p];
    });
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: `Projet ${cle} créé`, detail: `${nom} · par ${par}`, statut: 'vert' });
    return p;
  }

  /** Un projet ne se supprime que vide : ses tâches gardent toujours un projet. */
  supprimer(cle: string): void {
    this.projet(cle);
    if (this.taches(cle).length) throw new ErreurMetier('Ce projet a des tâches : il ne peut pas être supprimé');
    this.stockage.modifier((e) => {
      e.projets = this.projets.filter((p) => p.cle !== cle);
      e.sprints = this.sprints.filter((s) => s.projet !== cle);
    });
  }

  vue(cle: string): VueProjet {
    const projet = this.projet(cle);
    const duProjet = this.sprints.filter((s) => s.projet === cle);
    const rang = { actif: 0, prevu: 1, termine: 2 };
    const termines = duProjet.filter((s) => s.statut === 'termine').sort((a, b) => (b.fin ?? 0) - (a.fin ?? 0));
    const enCours = new Set(duProjet.filter((s) => s.statut !== 'termine').map((s) => s.id));
    return {
      projet,
      sprints: [...duProjet.filter((s) => s.statut !== 'termine').sort((a, b) => rang[a.statut] - rang[b.statut]), ...termines.slice(0, 5)],
      taches: this.taches(cle)
        .filter((t) => estOuvert(t) || (t.sprint && enCours.has(t.sprint)))
        .map((t) => this.tickets.resume(t)),
    };
  }

  creerTache(champs: Partial<Ticket>, par: string): Ticket {
    this.projet(String(champs.projet ?? ''));
    return this.tickets.creer('tache', champs, par);
  }

  creerSprint(cle: string, corps: { nom?: unknown; objectif?: unknown }, par: string): Sprint {
    this.projet(cle);
    const nom =
      String(corps.nom ?? '')
        .trim()
        .slice(0, 60) || `Sprint ${this.sprints.filter((s) => s.projet === cle).length + 1}`;
    const s: Sprint = {
      id: randomUUID(),
      projet: cle,
      nom,
      objectif: String(corps.objectif ?? '')
        .trim()
        .slice(0, 300),
      statut: 'prevu',
      debut: null,
      fin: null,
    };
    this.stockage.modifier((e) => {
      e.sprints = [...(e.sprints ?? []), s];
    });
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: `${cle} : ${nom} créé`, detail: `Par ${par}`, statut: 'vert' });
    return s;
  }

  /** Un seul sprint actif par projet, et jamais un sprint vide. */
  demarrer(id: string, jours: unknown, par: string, maintenant = Date.now()): Sprint {
    const s = this.sprint(id);
    if (s.statut !== 'prevu') throw new ErreurMetier('Ce sprint a déjà été démarré');
    const actif = this.sprints.find((x) => x.projet === s.projet && x.statut === 'actif');
    if (actif) throw new ErreurMetier(`Terminez d’abord « ${actif.nom} » : un seul sprint actif par projet`);
    if (!this.taches(s.projet).some((t) => t.sprint === id)) throw new ErreurMetier('Ajoutez au moins une tâche avant de démarrer le sprint');
    const duree = Math.min(60, Math.max(1, Math.round(Number(jours) || 14)));
    this.stockage.modifier(() => Object.assign(s, { statut: 'actif', debut: maintenant, fin: maintenant + duree * 86_400_000 }));
    this.stockage.ajouterEvenement({ t: maintenant, type: 'info', titre: `${s.projet} : ${s.nom} démarré`, detail: `${duree} jour(s) · par ${par}`, statut: 'vert' });
    return s;
  }

  /** Clôture : ce qui n'est pas terminé retourne au backlog ; les points terminés font la vélocité. */
  terminer(id: string, par: string, maintenant = Date.now()): Sprint {
    const s = this.sprint(id);
    if (s.statut !== 'actif') throw new ErreurMetier('Seul un sprint actif peut être terminé');
    const taches = this.taches(s.projet).filter((t) => t.sprint === id);
    const terminees = taches.filter((t) => t.statut === 'termine');
    const reportees = taches.filter(estOuvert);
    for (const t of reportees) this.tickets.placer(t.numero, null, `retour au backlog à la clôture de « ${s.nom} »`, par);
    const bilan = { terminees: terminees.length, reportees: reportees.length, points: terminees.reduce((n, t) => n + (t.points ?? 0), 0) };
    this.stockage.modifier(() => Object.assign(s, { statut: 'termine', fin: maintenant, bilan }));
    this.stockage.ajouterEvenement({
      t: maintenant,
      type: 'info',
      titre: `${s.projet} : ${s.nom} terminé`,
      detail: `${bilan.terminees} tâche(s) terminée(s), ${bilan.points} point(s), ${bilan.reportees} reportée(s) · par ${par}`,
      statut: 'vert',
    });
    return s;
  }

  supprimerSprint(id: string, par: string): void {
    const s = this.sprint(id);
    if (s.statut !== 'prevu') throw new ErreurMetier('Seul un sprint pas encore démarré peut être supprimé');
    for (const t of this.taches(s.projet).filter((x) => x.sprint === id)) this.tickets.placer(t.numero, null, `retour au backlog (« ${s.nom} » supprimé)`, par);
    this.stockage.modifier((e) => {
      e.sprints = this.sprints.filter((x) => x.id !== id);
    });
  }

  /** Planifie une tâche dans un sprint de son projet, ou la remet au backlog (null). */
  placer(numero: string, sprintId: unknown, par: string): Ticket {
    const t = this.tickets.trouver(numero);
    if (!t || t.type !== 'tache') throw new ErreurMetier(`Tâche ${numero} introuvable`);
    if (!sprintId) return this.tickets.placer(numero, null, 'retour au backlog', par);
    const s = this.sprint(String(sprintId));
    if (s.projet !== t.projet) throw new ErreurMetier('Ce sprint appartient à un autre projet');
    if (s.statut === 'termine') throw new ErreurMetier('Ce sprint est terminé');
    return this.tickets.placer(numero, s.id, s.nom, par);
  }
}
