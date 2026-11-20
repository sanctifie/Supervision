/**
 * Supervision des ressources (à la manière de Centreon) : chaque hôte et
 * chacun de ses contrôles, avec l'état OK / Avertissement / Critique /
 * Inconnu, l'état confirmé après 3 contrôles, l'acquittement, les arrêts
 * planifiés, le journal des changements d'état et les rapports de disponibilité.
 */

export type EtatRessource = 'ok' | 'avertissement' | 'critique' | 'inconnu';

/** Un contrôle tel que mesuré à l'instant. */
export interface Controle {
  cle: string;
  hote: string;
  nom: string;
  etat: EtatRessource;
  sortie: string;
  /** Page de détail. */
  lien: string;
}

export interface Acquittement {
  par: string;
  le: number;
  commentaire: string;
}

export interface Suivi {
  etat: EtatRessource;
  /** Confirmé (« hard ») après TENTATIVES_MAX contrôles identiques ; sinon « soft ». */
  confirme: boolean;
  tentatives: number;
  /** Depuis quand l'état confirmé dure. */
  depuis: number;
  dernierControle: number;
  sortie: string;
  acquittement: Acquittement | null;
}

export interface ArretPlanifie {
  id: string;
  /** Clé d'un contrôle, ou « hote:<nom> » pour tout un hôte. */
  cible: string;
  debut: number;
  fin: number;
  commentaire: string;
  par: string;
}

export interface Transition {
  t: number;
  cle: string;
  hote: string;
  nom: string;
  etat: EtatRessource;
  sortie: string;
}

export interface RessourceVue extends Controle, Omit<Suivi, 'etat' | 'sortie'> {
  /** État confirmé affiché (le dernier contrôle est dans `etat` si non confirmé). */
  enArret: boolean;
}

export interface VueRessources {
  controleLe: number;
  ressources: RessourceVue[];
  arrets: ArretPlanifie[];
}

export interface LigneRapport {
  cle: string;
  hote: string;
  nom: string;
  /** Part du temps (0..1) dans chaque état, et sans mesure. */
  ok: number;
  avertissement: number;
  critique: number;
  inconnu: number;
  nonMesure: number;
  /** Nombre de passages en critique. */
  pannes: number;
}

export const TENTATIVES_MAX = 3;

export const LIBELLE_ETAT_RESSOURCE: Record<EtatRessource, string> = { ok: 'OK', avertissement: 'Avertissement', critique: 'Critique', inconnu: 'Inconnu' };
/** Couleur de l'interface pour chaque état. */
export const STATUT_DE_ETAT: Record<EtatRessource, 'vert' | 'orange' | 'rouge' | 'inconnu'> = { ok: 'vert', avertissement: 'orange', critique: 'rouge', inconnu: 'inconnu' };

/** Disponibilité de chaque contrôle sur [debut, fin], à partir des changements d'état. */
export function rapport(transitions: Transition[], controles: Pick<Controle, 'cle' | 'hote' | 'nom'>[], debut: number, fin: number): LigneRapport[] {
  const duree = fin - debut;
  return controles.map((c) => {
    const ligne: LigneRapport = { cle: c.cle, hote: c.hote, nom: c.nom, ok: 0, avertissement: 0, critique: 0, inconnu: 0, nonMesure: 0, pannes: 0 };
    const siennes = transitions.filter((x) => x.cle === c.cle).sort((a, b) => a.t - b.t);
    let etat: EtatRessource | null = null;
    let curseur = debut;
    for (const x of siennes) {
      if (x.t <= debut) {
        etat = x.etat;
        continue;
      }
      if (x.t >= fin) break;
      ligne[etat ?? 'nonMesure'] += x.t - curseur;
      if (x.etat === 'critique' && etat !== 'critique') ligne.pannes++;
      etat = x.etat;
      curseur = x.t;
    }
    ligne[etat ?? 'nonMesure'] += fin - curseur;
    for (const k of ['ok', 'avertissement', 'critique', 'inconnu', 'nonMesure'] as const) ligne[k] = duree > 0 ? ligne[k] / duree : 0;
    return ligne;
  });
}
