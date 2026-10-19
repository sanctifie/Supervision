import { estOuvert, type Ticket } from '../../shared/itsm';
import { versionDeImage, type Deploiement, type EtatSynchro, type ImageEnMarche, type SanteDeploiement, type VueDeploiement } from '../../shared/deploiements';
import type { Statut } from '../../shared/types';
import { ErreurMetier } from './erreurs';
import type { Stockage } from './stockage';
import type { Tickets } from './tickets';

const HEURE = 3_600_000;
/** Historique gardé par service. */
const MAX_PAR_CI = 30;
/** Une fenêtre de changement couvre un déploiement fait un peu avant ou après. */
const TOLERANCE = HEURE;
/** États d'un changement qui annoncent une version à venir ou en place. */
const ETATS_PREVUS = ['approuve', 'planifie', 'en-cours', 'revue'];

/**
 * Suivi des déploiements : on regarde quelle image tourne, on rattache chaque
 * nouvelle version au changement qui la couvrait, et on signale les écarts.
 */
export class Deploiements {
  constructor(
    private readonly stockage: Stockage,
    private readonly tickets: Tickets,
  ) {}

  private get historique(): Deploiement[] {
    return this.stockage.donnees.deploiements;
  }

  private de(ci: string): Deploiement[] {
    return this.historique.filter((d) => d.ci === ci);
  }

  /** Le changement qui couvre un déploiement de `ci` à cet instant (celui qui vise la bonne version d'abord). */
  private changementCouvrant(ci: string, version: string, maintenant: number): Ticket | undefined {
    const couvrants = this.tickets
      .changementsDe(ci)
      .filter(
        (t) =>
          t.statut === 'en-cours' || (t.statut === 'planifie' && t.debutPrevu && t.finPrevue && maintenant >= t.debutPrevu - TOLERANCE && maintenant <= t.finPrevue + TOLERANCE),
      );
    return couvrants.find((t) => t.versionCible === version) ?? couvrants[0];
  }

  /** Compare les images en marche à la dernière version connue ; chaque nouveauté entre dans l'historique. */
  observer(images: Record<string, string>, maintenant = Date.now()): void {
    for (const [ci, image] of Object.entries(images)) {
      const avant = this.de(ci).at(-1);
      if (avant?.image === image) continue;
      const version = versionDeImage(image);
      const changement = avant ? this.changementCouvrant(ci, version, maintenant) : undefined;
      this.stockage.modifier((e) => {
        e.deploiements.push({ ci, version, image, le: maintenant, changement: changement?.numero ?? null, ...(avant ? {} : { initial: true }) });
        const excedent = e.deploiements.filter((d) => d.ci === ci).length - MAX_PAR_CI;
        for (let i = 0; i < excedent; i++)
          e.deploiements.splice(
            e.deploiements.findIndex((d) => d.ci === ci),
            1,
          );
      });
      if (!avant) continue;
      if (changement) this.tickets.noter(changement.numero, `Version ${version} en production (${ci}).`);
      else {
        this.stockage.ajouterEvenement({
          t: maintenant,
          type: 'deploiement',
          titre: `${ci} : ${avant.version} → ${version}`,
          detail: 'Déploiement hors changement',
          statut: 'orange',
        });
      }
    }
  }

  /** La version que le dernier changement utile attend pour ce CI. */
  private prevue(ci: string): { version: string; changement: Ticket } | null {
    const quand = (t: Ticket) => t.closLe ?? t.finPrevue ?? t.debutPrevu ?? t.creeLe;
    const t = this.tickets
      .changementsDe(ci)
      .filter((x) => x.versionCible && (ETATS_PREVUS.includes(x.statut) || (x.statut === 'clos' && x.resultat === 'reussi')))
      .sort((a, b) => quand(b) - quand(a))[0];
    return t ? { version: t.versionCible as string, changement: t } : null;
  }

  /**
   * Une ligne par service. `courant` = images lues à l'instant (prioritaires sur l'historique) ;
   * `etats` = état des conteneurs.
   */
  vue(courant: Record<string, ImageEnMarche>, etats: Record<string, { enMarche: boolean; statut: Statut }>): VueDeploiement[] {
    const cis = new Set([...Object.keys(courant), ...this.historique.map((d) => d.ci)]);
    const titre = (numero: string | null) => (numero ? (this.tickets.trouver(numero)?.titre ?? null) : null);
    return [...cis].sort().map((ci) => {
      const historique = this.de(ci)
        .reverse()
        .map((d) => ({ ...d, changementTitre: titre(d.changement) }));
      const image = courant[ci]?.image ?? historique[0]?.image ?? null;
      const version = image ? versionDeImage(image) : null;
      const p = this.prevue(ci);
      let synchro: EtatSynchro = 'non-suivi';
      if (p) synchro = p.version === version ? 'synchronise' : estOuvert(p.changement) ? 'a-deployer' : 'ecart';
      const etat = etats[ci];
      // Un changement en cours = déploiement en cours (« Progressing »), sauf si le conteneur est déjà en mauvais état.
      const enCours = this.tickets.changementsDe(ci).some((t) => t.statut === 'en-cours');
      const sante: SanteDeploiement = !etat ? 'inconnu' : !etat.enMarche ? 'absent' : etat.statut === 'rouge' ? 'degrade' : enCours ? 'en-cours' : 'sain';
      return {
        ci,
        projet: courant[ci]?.projet ?? null,
        image,
        version,
        enMarche: etat?.enMarche ?? null,
        sante,
        prevue: p?.version ?? null,
        changementPrevu: p?.changement.numero ?? null,
        titrePrevu: p?.changement.titre ?? null,
        synchro,
        historique,
      };
    });
  }

  /** Ouvre un changement urgent pour revenir à une version de l'historique (jamais de retour arrière sans trace ni approbation). */
  retourArriere(ci: string, version: string, auteur: string): Ticket {
    const h = this.de(ci);
    const actuel = h.at(-1);
    if (!actuel) throw new ErreurMetier(`Aucun déploiement connu pour ${ci}`);
    const cible = [...h].reverse().find((d) => d.version === version);
    if (!cible) throw new ErreurMetier(`La version ${version} n’est pas dans l’historique de ${ci}`);
    if (cible.version === actuel.version) throw new ErreurMetier(`${ci} tourne déjà en ${version}`);
    return this.tickets.creer(
      'changement',
      {
        titre: `Retour arrière ${ci} : ${actuel.version} → ${cible.version}`,
        categorie: 'Déploiement applicatif',
        ci,
        typeChangement: 'urgent',
        risque: 'moyen',
        impact: 2,
        urgence: 1,
        versionCible: cible.version,
        justification: `La version ${actuel.version} de ${ci} pose problème : on revient à ${cible.version}, qui tournait avant.`,
        planMiseEnOeuvre: `Remettre l’image ${cible.image} pour ${ci}, puis lancer « docker compose up -d ${ci} ».`,
        planRetourArriere: `Redéployer l’image ${actuel.image}.`,
        planTest: `Vérifier que ${ci} répond (/health) et que le taux d’erreur du tableau de bord reste normal.`,
      },
      auteur,
      { lien: actuel.changement ?? undefined },
    );
  }
}
