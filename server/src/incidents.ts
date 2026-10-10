import { randomUUID } from 'node:crypto';
import type { Stockage } from './stockage';
import type { Alerte, Incident, Priorite, VueIncidents } from '../../shared/types';
import { statutDeLaPriorite } from './analyse';

/**
 * Cycle d'incident du guide (7.3) : détection → acquittement → résolution →
 * post-mortem sans blâme sous 5 jours. Indicateurs : MTTA, MTTR, nombre par mois.
 *
 * Chaque alerte P1 ou P2 non silencieuse ouvre un incident automatiquement ;
 * il se résout seul quand toutes ses alertes ont disparu (on peut aussi le
 * résoudre à la main).
 */

const JOUR = 86_400_000;

export class Incidents {
  constructor(private readonly stockage: Stockage) {}

  private get liste(): Incident[] {
    return this.stockage.donnees.incidents;
  }

  trouver(id: string): Incident | undefined {
    return this.liste.find((i) => i.id === id);
  }

  /** Rapproche les incidents des alertes actives. Appelé toutes les 30 s. */
  synchroniser(alertes: Alerte[], maintenant = Date.now()): void {
    const actives = alertes.filter((a) => !a.silencieuse);
    const ids = new Set(actives.map((a) => a.id));
    const vus = this.stockage.donnees.vus.alertes;

    // Fil d'activité : nouvelles alertes, alertes disparues.
    for (const a of actives) {
      if (!vus[a.id]) {
        this.stockage.ajouterEvenement({
          t: a.debut,
          type: 'alerte',
          titre: `${a.priorite} · ${a.nom}`,
          detail: a.resume,
          statut: statutDeLaPriorite(a.priorite),
        });
        this.stockage.modifier((e) => {
          e.vus.alertes[a.id] = a.debut;
        });
      }
    }
    for (const id of Object.keys(vus)) {
      if (!ids.has(id) && !alertes.some((a) => a.id === id)) {
        this.stockage.modifier((e) => {
          delete e.vus.alertes[id];
        });
        this.stockage.ajouterEvenement({ t: maintenant, type: 'resolution', titre: 'Alerte terminée', detail: id.startsWith('demo-') ? 'Retour à la normale' : `Empreinte ${id.slice(0, 8)}`, statut: 'vert' });
      }
    }

    // Ouverture automatique pour P1 / P2.
    for (const a of actives.filter((x) => x.priorite === 'P1' || x.priorite === 'P2')) {
      const ouvert = this.liste.some((i) => i.statut !== 'resolu' && i.alertes.includes(a.id));
      if (ouvert) continue;
      // Déjà traité puis résolu à la main alors que l'alerte dure : on ne rouvre pas.
      if (this.liste.some((i) => i.alertes.includes(a.id) && i.resoluLe && i.resoluLe > a.debut)) continue;
      this.ouvrir({ titre: a.resume || a.nom, priorite: a.priorite, alertes: [a.id], detecteLe: a.debut, automatique: true, auteur: 'supervision' });
    }

    // Résolution automatique.
    for (const i of this.liste) {
      if (i.statut === 'resolu' || !i.automatique || !i.alertes.length) continue;
      if (i.alertes.every((id) => !ids.has(id))) {
        this.stockage.modifier(() => {
          i.statut = 'resolu';
          i.resoluLe = maintenant;
          i.journal.push({ t: maintenant, auteur: 'supervision', texte: 'Résolu automatiquement : les alertes ont disparu.' });
        });
        this.stockage.ajouterEvenement({ t: maintenant, type: 'resolution', titre: `Incident résolu · ${i.priorite}`, detail: i.titre, statut: 'vert' });
      }
    }
  }

  ouvrir(o: { titre: string; priorite: Priorite; alertes?: string[]; detecteLe?: number; automatique?: boolean; auteur: string; note?: string }): Incident {
    const t = Date.now();
    const incident: Incident = {
      id: randomUUID(),
      titre: o.titre,
      priorite: o.priorite,
      statut: 'ouvert',
      detecteLe: o.detecteLe ?? t,
      acquitteLe: null,
      resoluLe: null,
      alertes: o.alertes ?? [],
      journal: [{ t, auteur: o.auteur, texte: o.note || (o.automatique ? 'Ouvert automatiquement par une alerte.' : 'Incident déclaré.') }],
      postMortem: '',
      automatique: !!o.automatique,
    };
    this.stockage.modifier((e) => {
      e.incidents.unshift(incident);
      e.incidents = e.incidents.slice(0, 500);
    });
    this.stockage.ajouterEvenement({ t, type: 'incident', titre: `Incident ouvert · ${o.priorite}`, detail: o.titre, statut: statutDeLaPriorite(o.priorite) });
    return incident;
  }

  acquitter(id: string, auteur: string): Incident | undefined {
    const i = this.trouver(id);
    if (!i || i.statut !== 'ouvert') return i;
    const t = Date.now();
    this.stockage.modifier(() => {
      i.statut = 'acquitte';
      i.acquitteLe = t;
      i.journal.push({ t, auteur, texte: 'Acquitté : pris en charge.' });
    });
    this.stockage.ajouterEvenement({ t, type: 'incident', titre: `Incident acquitté par ${auteur}`, detail: i.titre, statut: 'orange' });
    return i;
  }

  resoudre(id: string, auteur: string, texte?: string): Incident | undefined {
    const i = this.trouver(id);
    if (!i || i.statut === 'resolu') return i;
    const t = Date.now();
    this.stockage.modifier(() => {
      if (!i.acquitteLe) i.acquitteLe = t;
      i.statut = 'resolu';
      i.resoluLe = t;
      i.journal.push({ t, auteur, texte: texte || 'Résolu.' });
    });
    this.stockage.ajouterEvenement({ t, type: 'resolution', titre: `Incident résolu par ${auteur}`, detail: i.titre, statut: 'vert' });
    return i;
  }

  noter(id: string, auteur: string, texte: string): Incident | undefined {
    const i = this.trouver(id);
    if (!i) return i;
    this.stockage.modifier(() => {
      i.journal.push({ t: Date.now(), auteur, texte });
    });
    return i;
  }

  ecrirePostMortem(id: string, texte: string): Incident | undefined {
    const i = this.trouver(id);
    if (!i) return i;
    this.stockage.modifier(() => {
      i.postMortem = texte;
    });
    return i;
  }

  vue(maintenant = Date.now()): VueIncidents {
    const recents = this.liste.filter((i) => i.detecteLe > maintenant - 30 * JOUR);
    const moyenne = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length / 60_000 : null);
    const debutMois = new Date(maintenant);
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    return {
      incidents: this.liste,
      indicateurs: {
        mttaMinutes: moyenne(recents.filter((i) => i.acquitteLe).map((i) => (i.acquitteLe as number) - i.detecteLe)),
        mttrMinutes: moyenne(recents.filter((i) => i.resoluLe).map((i) => (i.resoluLe as number) - i.detecteLe)),
        ceMois: this.liste.filter((i) => i.detecteLe >= debutMois.getTime()).length,
        ouverts: this.liste.filter((i) => i.statut !== 'resolu').length,
        postMortemsEnRetard: this.liste.filter(
          (i) => i.statut === 'resolu' && (i.priorite === 'P1' || i.priorite === 'P2') && !i.postMortem.trim() && i.resoluLe && maintenant - i.resoluLe > 5 * JOUR,
        ).length,
      },
    };
  }
}
