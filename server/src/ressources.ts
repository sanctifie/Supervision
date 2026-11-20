import { randomUUID } from 'node:crypto';
import type { Stockage } from './stockage';
import { ErreurMetier } from './erreurs';
import { LIBELLE_ETAT_RESSOURCE, rapport, TENTATIVES_MAX, type ArretPlanifie, type Controle, type Suivi, type Transition, type VueRessources } from '../../shared/ressources';

/**
 * Ressources façon Centreon. La boucle de fond passe les contrôles du moment
 * (calculés à partir des vues de la supervision) ; ce module retient l'état
 * de chacun, le confirme après 3 contrôles identiques, garde le journal des
 * changements d'état (31 jours) et gère acquittements et arrêts planifiés.
 */

export interface EtatRessources {
  suivis: Record<string, Suivi>;
  historique: Transition[];
  arrets: ArretPlanifie[];
}

export const RESSOURCES_VIDE: EtatRessources = { suivis: {}, historique: [], arrets: [] };

const RETENTION = 31 * 86_400_000;
const MAX_HISTORIQUE = 20_000;

export class Ressources {
  private controles: Controle[] = [];
  private controleLe = 0;

  constructor(private readonly stockage: Stockage) {}

  private get etat(): EtatRessources {
    return this.stockage.donnees.ressources;
  }

  /** Enregistre un tour de contrôles ; renvoie les changements d'état confirmés. */
  actualiser(controles: Controle[], maintenant = Date.now()): Transition[] {
    this.controles = controles;
    this.controleLe = maintenant;
    const nouvelles: Transition[] = [];
    this.stockage.modifier((e) => {
      const r = e.ressources;
      for (const c of controles) {
        const s = r.suivis[c.cle];
        if (!s) {
          r.suivis[c.cle] = { etat: c.etat, confirme: true, tentatives: 1, depuis: maintenant, dernierControle: maintenant, sortie: c.sortie, acquittement: null };
          nouvelles.push({ t: maintenant, cle: c.cle, hote: c.hote, nom: c.nom, etat: c.etat, sortie: c.sortie });
          continue;
        }
        s.dernierControle = maintenant;
        s.sortie = c.sortie;
        if (c.etat === s.etat) {
          s.tentatives = Math.min(TENTATIVES_MAX, s.tentatives + 1);
          if (!s.confirme && (s.tentatives >= TENTATIVES_MAX || c.etat === 'ok')) {
            s.confirme = true;
            s.depuis = maintenant;
            nouvelles.push({ t: maintenant, cle: c.cle, hote: c.hote, nom: c.nom, etat: c.etat, sortie: c.sortie });
          }
          continue;
        }
        // Changement : un retour à OK est confirmé tout de suite ; un problème après 3 contrôles.
        s.etat = c.etat;
        s.tentatives = 1;
        s.confirme = c.etat === 'ok';
        if (s.confirme) {
          s.depuis = maintenant;
          nouvelles.push({ t: maintenant, cle: c.cle, hote: c.hote, nom: c.nom, etat: c.etat, sortie: c.sortie });
        }
        if (c.etat === 'ok') s.acquittement = null;
      }
      r.historique.push(...nouvelles);
      if (r.historique.length > MAX_HISTORIQUE || (r.historique[0] && r.historique[0].t < maintenant - RETENTION)) {
        r.historique = r.historique.filter((x) => x.t >= maintenant - RETENTION).slice(-MAX_HISTORIQUE);
      }
      r.arrets = r.arrets.filter((a) => a.fin > maintenant);
    });
    for (const t of nouvelles) {
      if (t.etat === 'critique' && !this.enArret(t.cle, t.hote, maintenant)) {
        this.stockage.ajouterEvenement({ t: maintenant, type: 'alerte', titre: `${t.hote} · ${t.nom} : Critique`, detail: t.sortie, statut: 'rouge' });
      }
    }
    return nouvelles;
  }

  private enArret(cle: string, hote: string, t = Date.now()): boolean {
    return this.etat.arrets.some((a) => (a.cible === cle || a.cible === `hote:${hote}`) && a.debut <= t && t < a.fin);
  }

  vue(): VueRessources {
    const ordre = { critique: 0, avertissement: 1, inconnu: 2, ok: 3 };
    return {
      controleLe: this.controleLe,
      arrets: this.etat.arrets,
      ressources: this.controles
        .map((c) => {
          const {
            etat: _e,
            sortie: _s,
            ...s
          } = this.etat.suivis[c.cle] ?? { confirme: true, tentatives: 1, depuis: this.controleLe, dernierControle: this.controleLe, acquittement: null };
          return { ...c, ...s, enArret: this.enArret(c.cle, c.hote) };
        })
        .sort((a, b) => ordre[a.etat] - ordre[b.etat] || a.hote.localeCompare(b.hote) || a.nom.localeCompare(b.nom)),
    };
  }

  acquitter(cle: string, commentaire: unknown, par: string): void {
    const s = this.etat.suivis[cle];
    if (!s) throw new ErreurMetier('Contrôle inconnu');
    if (s.etat === 'ok') throw new ErreurMetier('Ce contrôle est OK : rien à acquitter');
    const texte = typeof commentaire === 'string' ? commentaire.trim().slice(0, 500) : '';
    if (!texte) throw new ErreurMetier('Dites ce que vous faites (commentaire obligatoire)');
    this.stockage.modifier(() => (s.acquittement = { par, le: Date.now(), commentaire: texte }));
    const c = this.controles.find((x) => x.cle === cle);
    this.stockage.ajouterEvenement({
      t: Date.now(),
      type: 'info',
      titre: `Acquitté par ${par}`,
      detail: `${c ? `${c.hote} · ${c.nom}` : cle} (${LIBELLE_ETAT_RESSOURCE[s.etat]}) — ${texte}`,
      statut: 'vert',
    });
  }

  retirerAcquittement(cle: string): void {
    const s = this.etat.suivis[cle];
    if (s) this.stockage.modifier(() => (s.acquittement = null));
  }

  planifierArret(d: Record<string, unknown>, par: string): ArretPlanifie {
    const cible = typeof d.cible === 'string' ? d.cible : '';
    const connue = this.controles.some((c) => c.cle === cible || `hote:${c.hote}` === cible);
    if (!connue) throw new ErreurMetier('Cible inconnue (un contrôle ou un hôte)');
    const debut = Number(d.debut) || Date.now();
    const fin = Number(d.fin);
    if (!(fin > debut) || fin - debut > 7 * 86_400_000) throw new ErreurMetier('La fin doit suivre le début (7 jours au plus)');
    const commentaire = typeof d.commentaire === 'string' ? d.commentaire.trim().slice(0, 300) : '';
    if (!commentaire) throw new ErreurMetier('Indiquez la raison de l’arrêt');
    const a: ArretPlanifie = { id: randomUUID(), cible, debut, fin, commentaire, par };
    this.stockage.modifier((e) => e.ressources.arrets.push(a));
    return a;
  }

  supprimerArret(id: string): void {
    this.stockage.modifier((e) => (e.ressources.arrets = e.ressources.arrets.filter((a) => a.id !== id)));
  }

  journal(limite = 300): Transition[] {
    return this.etat.historique.slice(-limite).reverse();
  }

  rapport(jours: number) {
    const fin = Date.now();
    return { debut: fin - jours * 86_400_000, fin, lignes: rapport(this.etat.historique, this.controles, fin - jours * 86_400_000, fin) };
  }
}
