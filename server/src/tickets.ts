import { randomUUID } from 'node:crypto';
import type { Stockage } from './stockage';
import { ErreurMetier } from './erreurs';

export { ErreurMetier };
import { statutDeLaPriorite } from './analyse';
import {
  CODES_RESOLUTION,
  ELEMENTS_CONFIGURATION,
  PREFIXES,
  SLA,
  STATUTS,
  TRANSITIONS,
  estOuvert,
  echeancesSla,
  etatSla,
  type ContexteSla,
  libelleStatut,
  niveauxDePriorite,
  verbeTransition,
  prioriteDeMatrice,
  type ActiviteTicket,
  type Niveau,
  type PrioriteTicket,
  type Ticket,
  type TicketResume,
  type TypeTicket,
} from '../../shared/itsm';
import type { Alerte, Priorite } from '../../shared/types';
import type { EvenementTicket } from './notifications';
import { config } from './config';
import { calendrierParDefaut } from '../../shared/calendrier';

/**
 * Le moteur ITSM : création, cycle de vie, règles de passage, SLA, liens,
 * approbations, et incidents ouverts automatiquement par les alertes.
 * Les erreurs de règle métier sont des `ErreurMetier` (→ HTTP 422).
 */

const HEURE = 3_600_000;
const JOUR = 24 * HEURE;
/** Un ticket résolu se clôt seul après ce délai sans réouverture. */
const CLOTURE_AUTO = 3 * JOUR;

/** Ce que les tickets peuvent déclencher ailleurs (silences Alertmanager). */
export interface EffetsTickets {
  creerSilence(ci: string, debut: number, fin: number, commentaire: string, auteur: string): Promise<string>;
  supprimerSilence(id: string): Promise<void>;
  /** Ce qui arrive aux tickets (notifications). */
  signaler?(e: EvenementTicket): void;
}

export interface FiltreTickets {
  type?: TypeTicket;
  statut?: string;
  /** ouverts | clos | tous */
  etat?: string;
  priorite?: string;
  assigneA?: string;
  nonAssignes?: boolean;
  groupe?: string;
  ci?: string;
  q?: string;
}

/** Champs modifiables par type (le reste passe par les actions dédiées). */
const CHAMPS_COMMUNS = ['titre', 'description', 'impact', 'urgence', 'categorie', 'ci', 'groupe', 'assigneA', 'demandeur'] as const;
const CHAMPS_PAR_TYPE: Record<TypeTicket, readonly string[]> = {
  incident: [...CHAMPS_COMMUNS, 'codeResolution', 'notesResolution', 'postMortem'],
  probleme: [...CHAMPS_COMMUNS, 'causeRacine', 'contournement'],
  changement: [
    ...CHAMPS_COMMUNS,
    'typeChangement',
    'risque',
    'justification',
    'planMiseEnOeuvre',
    'planRetourArriere',
    'planTest',
    'debutPrevu',
    'finPrevue',
    'resultat',
    'silencerAlertes',
  ],
  demande: [...CHAMPS_COMMUNS, 'notesResolution'],
};

const LIBELLES_CHAMPS: Record<string, string> = {
  titre: 'Titre',
  impact: 'Impact',
  urgence: 'Urgence',
  categorie: 'Catégorie',
  ci: 'Élément de configuration',
  groupe: 'Groupe',
  assigneA: 'Assigné à',
  demandeur: 'Demandeur',
  typeChangement: 'Type de changement',
  risque: 'Risque',
  debutPrevu: 'Début prévu',
  finPrevue: 'Fin prévue',
  resultat: 'Résultat',
};

const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const niveau = (v: unknown): Niveau => (v === 1 || v === 2 || v === 3 ? v : Number(v) === 1 ? 1 : Number(v) === 2 ? 2 : 3);
const dateOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(n) ? n : null;
};

export class Tickets {
  constructor(
    private readonly stockage: Stockage,
    private readonly effets: EffetsTickets,
  ) {
    this.migrer();
  }

  private get liste(): Ticket[] {
    return this.stockage.donnees.tickets;
  }

  /** Les anciens « incidents » (avant l'ITSM) deviennent des tickets INC. */
  private migrer(): void {
    const anciens = this.stockage.donnees.incidents;
    if (!anciens?.length) return;
    this.stockage.modifier((e) => {
      for (const i of [...anciens].reverse()) {
        const p: PrioriteTicket = i.priorite === 'Info' ? 'P4' : i.priorite;
        const t = this.nouveauTicket('incident', { titre: i.titre, ...niveauxDePriorite(p) }, 'supervision', i.detecteLe);
        t.statut = i.statut === 'resolu' ? 'resolu' : i.statut === 'acquitte' ? 'en-cours' : 'nouveau';
        t.prisEnChargeLe = i.acquitteLe;
        t.resoluLe = i.resoluLe;
        t.alertes = i.alertes;
        t.automatique = i.automatique;
        t.postMortem = i.postMortem;
        t.activite = i.journal.map((n) => ({ t: n.t, auteur: n.auteur, type: 'note' as const, texte: n.texte }));
        if (t.resoluLe) t.codeResolution = 'Résolu automatiquement';
        e.tickets.unshift(t);
      }
      delete e.incidents;
    });
  }

  private numero(type: TypeTicket): string {
    const prefixe = PREFIXES[type];
    const n = (this.stockage.donnees.compteurs[prefixe] ?? 1000) + 1;
    this.stockage.donnees.compteurs[prefixe] = n;
    return `${prefixe}${String(n).padStart(7, '0')}`;
  }

  private nouveauTicket(type: TypeTicket, champs: Partial<Ticket>, auteur: string, maintenant = Date.now()): Ticket {
    const impact = niveau(champs.impact ?? 3);
    const urgence = niveau(champs.urgence ?? 3);
    const priorite = prioriteDeMatrice(impact, urgence);
    const t: Ticket = {
      id: randomUUID(),
      numero: this.numero(type),
      type,
      titre: texte(champs.titre, 200).trim() || 'Sans titre',
      description: texte(champs.description, 20000),
      statut: STATUTS[type][0].cle,
      impact,
      urgence,
      priorite,
      categorie: texte(champs.categorie, 80) || 'Autre',
      ci: champs.ci ? texte(champs.ci, 80) : null,
      groupe: champs.groupe ? texte(champs.groupe, 80) : null,
      assigneA: champs.assigneA ? texte(champs.assigneA, 40) : null,
      demandeur: texte(champs.demandeur, 80) || auteur,
      creeLe: maintenant,
      majLe: maintenant,
      prisEnChargeLe: null,
      resoluLe: null,
      closLe: null,
      echeanceReponse: null,
      echeanceResolution: null,
      activite: [],
      liens: [],
      alertes: [],
      automatique: false,
    };
    if (type === 'changement') {
      Object.assign(t, {
        typeChangement: ['standard', 'normal', 'urgent'].includes(champs.typeChangement as string) ? champs.typeChangement : 'normal',
        risque: ['faible', 'moyen', 'eleve'].includes(champs.risque as string) ? champs.risque : 'moyen',
        justification: texte(champs.justification, 20000),
        planMiseEnOeuvre: texte(champs.planMiseEnOeuvre, 20000),
        planRetourArriere: texte(champs.planRetourArriere, 20000),
        planTest: texte(champs.planTest, 20000),
        debutPrevu: dateOuNull(champs.debutPrevu),
        finPrevue: dateOuNull(champs.finPrevue),
        approbations: [],
        resultat: null,
        silencerAlertes: champs.silencerAlertes !== false,
        silenceId: null,
      });
    }
    if (type === 'probleme') Object.assign(t, { causeRacine: texte(champs.causeRacine, 20000), contournement: texte(champs.contournement, 20000) });
    if (type === 'incident') Object.assign(t, { codeResolution: '', notesResolution: '', postMortem: '' });
    if (type === 'demande') Object.assign(t, { notesResolution: '' });
    this.calculerSla(t);
    return t;
  }

  /** Échéances SLA à partir de la création (recalculées si la priorité change). */
  private calculerSla(t: Ticket): void {
    const e = echeancesSla(t, this.contexteSla());
    if (!e) return;
    t.echeanceReponse = e.reponse;
    t.echeanceResolution = e.resolution;
  }

  /** Calendrier de service et délais en vigueur (Paramètres). */
  contexteSla(): ContexteSla {
    const p = this.stockage.donnees.parametres;
    return {
      calendrier: p?.calendrier ?? calendrierParDefaut(config.fuseau, config.ouverture, config.fermeture),
      regles: p?.sla ?? SLA,
    };
  }

  /** L'état du SLA d'un ticket, selon les paramètres en vigueur. */
  sla(t: Ticket, maintenant = Date.now()) {
    return etatSla(t, maintenant, this.contexteSla());
  }

  private tracer(t: Ticket, auteur: string, texteTrace: string, type: ActiviteTicket['type'] = 'systeme'): void {
    t.activite.push({ t: Date.now(), auteur, type, texte: texteTrace });
    t.majLe = Date.now();
  }

  /** Un nom affiché a changé : on le reporte sur les tickets. */
  renommerPersonne(ancien: string, nouveau: string): void {
    this.stockage.modifier(() => {
      for (const t of this.liste) {
        if (t.assigneA === ancien) t.assigneA = nouveau;
        if (t.demandeur === ancien) t.demandeur = nouveau;
      }
    });
  }

  trouver(cle: string): Ticket | undefined {
    return this.liste.find((t) => t.numero === cle || t.id === cle);
  }

  private exiger(cle: string): Ticket {
    const t = this.trouver(cle);
    if (!t) throw new ErreurMetier(`Ticket ${cle} introuvable`);
    return t;
  }

  resume(t: Ticket, maintenant = Date.now()): TicketResume {
    const s = this.sla(t, maintenant);
    return {
      id: t.id,
      numero: t.numero,
      type: t.type,
      titre: t.titre,
      statut: t.statut,
      priorite: t.priorite,
      ci: t.ci,
      groupe: t.groupe,
      assigneA: t.assigneA,
      demandeur: t.demandeur,
      creeLe: t.creeLe,
      majLe: t.majLe,
      automatique: t.automatique,
      typeChangement: t.typeChangement,
      debutPrevu: t.debutPrevu,
      finPrevue: t.finPrevue,
      risque: t.risque,
      sla: s.etat,
      echeance: s.echeance,
      liens: t.liens.length,
    };
  }

  lister(f: FiltreTickets = {}): TicketResume[] {
    const q = f.q?.trim().toLowerCase();
    const ordre: Record<PrioriteTicket, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
    return this.liste
      .filter((t) => !f.type || t.type === f.type)
      .filter((t) => !f.statut || t.statut === f.statut)
      .filter((t) => (f.etat === 'clos' ? !estOuvert(t) : f.etat === 'tous' ? true : estOuvert(t)))
      .filter((t) => !f.priorite || t.priorite === f.priorite)
      .filter((t) => !f.assigneA || t.assigneA === f.assigneA)
      .filter((t) => !f.nonAssignes || !t.assigneA)
      .filter((t) => !f.groupe || t.groupe === f.groupe)
      .filter((t) => !f.ci || t.ci === f.ci)
      .filter((t) => !q || `${t.numero} ${t.titre} ${t.description} ${t.ci ?? ''} ${t.assigneA ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => (estOuvert(a) === estOuvert(b) ? ordre[a.priorite] - ordre[b.priorite] || b.majLe - a.majLe : estOuvert(a) ? -1 : 1))
      .map((t) => this.resume(t));
  }

  creer(type: TypeTicket, champs: Partial<Ticket>, auteur: string, options: { automatique?: boolean; alertes?: string[]; creeLe?: number; lien?: string } = {}): Ticket {
    if (!PREFIXES[type]) throw new ErreurMetier('Type de ticket inconnu');
    if (!texte(champs.titre, 200).trim()) throw new ErreurMetier('Le titre est obligatoire');
    let t!: Ticket;
    this.stockage.modifier((e) => {
      t = this.nouveauTicket(type, champs, auteur, options.creeLe);
      t.automatique = !!options.automatique;
      t.alertes = options.alertes ?? [];
      t.activite.push({
        t: Date.now(),
        auteur,
        type: 'systeme',
        texte: options.automatique ? 'Ouvert automatiquement par une alerte.' : `${type === 'changement' ? 'Changement créé' : 'Ticket ouvert'}.`,
      });
      e.tickets.unshift(t);
    });
    if (options.lien) this.lier(t.numero, options.lien, auteur);
    if ((type === 'incident' && (t.priorite === 'P1' || t.priorite === 'P2')) || type === 'changement') {
      this.stockage.ajouterEvenement({
        t: Date.now(),
        type: type === 'changement' ? 'info' : 'incident',
        titre: `${t.numero} ouvert · ${t.priorite}`,
        detail: t.titre,
        statut: type === 'changement' ? 'vert' : statutDeLaPriorite(t.priorite === 'P4' ? 'P3' : t.priorite),
      });
    }
    this.signaler({ type: 'cree', ticket: t, auteur });
    return t;
  }

  private signaler(e: EvenementTicket): void {
    try {
      this.effets.signaler?.(e);
    } catch (x) {
      console.error('[tickets] notification :', (x as Error).message);
    }
  }

  modifier(cle: string, champs: Record<string, unknown>, auteur: string): Ticket {
    const t = this.exiger(cle);
    if (!estOuvert(t) && Object.keys(champs).some((k) => k !== 'postMortem' && k !== 'notesResolution')) {
      throw new ErreurMetier(`${t.numero} est ${libelleStatut(t.type, t.statut).toLowerCase()} : rouvrez-le pour le modifier`);
    }
    const permis = CHAMPS_PAR_TYPE[t.type];
    const assigneAvant = t.assigneA;
    this.stockage.modifier(() => {
      for (const [cleChamp, brut] of Object.entries(champs)) {
        if (!permis.includes(cleChamp)) continue;
        const avant = (t as unknown as Record<string, unknown>)[cleChamp];
        let valeur: unknown = brut;
        if (cleChamp === 'impact' || cleChamp === 'urgence') valeur = niveau(brut);
        else if (cleChamp === 'debutPrevu' || cleChamp === 'finPrevue') valeur = dateOuNull(brut);
        else if (cleChamp === 'silencerAlertes') valeur = !!brut;
        else if (cleChamp === 'typeChangement' && !['standard', 'normal', 'urgent'].includes(String(brut))) continue;
        else if (cleChamp === 'risque' && !['faible', 'moyen', 'eleve'].includes(String(brut))) continue;
        else if (cleChamp === 'resultat' && brut !== null && !['reussi', 'echoue', 'retour-arriere'].includes(String(brut))) continue;
        else if (cleChamp === 'codeResolution' && brut && !CODES_RESOLUTION.includes(String(brut))) continue;
        else if (['ci', 'groupe', 'assigneA', 'resultat'].includes(cleChamp)) valeur = brut ? texte(brut, 80) : null;
        else if (cleChamp === 'titre') {
          valeur = texte(brut, 200).trim();
          if (!valeur) continue;
        } else valeur = texte(brut, 20000);
        if (avant === valeur) continue;
        (t as unknown as Record<string, unknown>)[cleChamp] = valeur;
        if (LIBELLES_CHAMPS[cleChamp]) {
          const affiche = (v: unknown) =>
            v === null || v === undefined || v === '' ? '—' : cleChamp.endsWith('Prevu') || cleChamp === 'finPrevue' ? new Date(Number(v)).toLocaleString('fr-FR') : String(v);
          this.tracer(t, auteur, `${LIBELLES_CHAMPS[cleChamp]} : ${affiche(avant)} → ${affiche(valeur)}`);
        }
        if (cleChamp === 'assigneA' && valeur && !t.prisEnChargeLe) t.prisEnChargeLe = Date.now();
      }
      const priorite = prioriteDeMatrice(t.impact, t.urgence);
      if (priorite !== t.priorite) {
        this.tracer(t, auteur, `Priorité : ${t.priorite} → ${priorite}`);
        t.priorite = priorite;
        this.calculerSla(t);
        t.slaNotifie = [];
      }
      t.majLe = Date.now();
    });
    if (t.assigneA && t.assigneA !== assigneAvant) this.signaler({ type: 'assigne', ticket: t, auteur });
    return t;
  }

  /** Les statuts atteignables maintenant, avec la raison quand c'est bloqué. */
  transitions(t: Ticket): { statut: string; libelle: string; bloque: string | null }[] {
    return (TRANSITIONS[t.type][t.statut] ?? [])
      .filter((s) => !this.parApprobation(t, s))
      .map((s) => ({ statut: s, libelle: verbeTransition(t.type, t.statut, s), bloque: this.blocage(t, s) }));
  }

  /** Approuver ou rejeter un changement passe par `approuver` (décision tracée), jamais par un simple changement d'état. */
  private parApprobation(t: Ticket, cible: string): boolean {
    return t.type === 'changement' && t.statut === 'evaluation' && (cible === 'approuve' || cible === 'rejete');
  }

  private blocage(t: Ticket, cible: string): string | null {
    if (t.type === 'incident' || t.type === 'demande') {
      if (cible === 'resolu' && t.type === 'incident' && !t.codeResolution) return 'Choisir un code de résolution';
      if (cible === 'resolu' && !t.notesResolution?.trim()) return 'Écrire les notes de résolution';
    }
    if (t.type === 'probleme') {
      if (cible === 'erreur-connue' && !t.contournement?.trim()) return 'Décrire le contournement';
      if (cible === 'resolu' && !t.causeRacine?.trim()) return 'Décrire la cause racine';
    }
    if (t.type === 'changement') {
      const plansRequis = t.typeChangement !== 'standard';
      if (cible === 'evaluation' && plansRequis) {
        if (!t.justification?.trim()) return 'Écrire la justification';
        if (!t.planMiseEnOeuvre?.trim()) return 'Écrire le plan de mise en œuvre';
        if (!t.planRetourArriere?.trim()) return 'Écrire le plan de retour arrière';
      }
      if (cible === 'approuve' && !(t.approbations ?? []).some((a) => a.decision === 'approuve')) return 'Une approbation est nécessaire';
      if (cible === 'planifie') {
        if (t.statut === 'brouillon' && t.typeChangement !== 'standard') return 'Seul un changement standard se planifie sans approbation';
        if (!t.debutPrevu || !t.finPrevue) return 'Renseigner la fenêtre (début et fin prévus)';
        if (t.finPrevue <= t.debutPrevu) return 'La fin doit suivre le début';
        if (plansRequis && !t.planRetourArriere?.trim()) return 'Écrire le plan de retour arrière';
      }
      if (cible === 'clos' && !t.resultat) return 'Indiquer le résultat (réussi, échoué, retour arrière)';
    }
    return null;
  }

  async changerStatut(cle: string, cible: string, auteur: string, commentaire?: string): Promise<Ticket> {
    const t = this.exiger(cle);
    if (!(TRANSITIONS[t.type][t.statut] ?? []).includes(cible)) {
      throw new ErreurMetier(`Passage impossible : ${libelleStatut(t.type, t.statut)} → ${libelleStatut(t.type, cible)}`);
    }
    if (this.parApprobation(t, cible)) throw new ErreurMetier('Approuver ou rejeter se fait depuis le bloc « Approbation (CAB) »');
    const bloque = this.blocage(t, cible);
    if (bloque) throw new ErreurMetier(bloque);

    const avant = t.statut;
    const assigneAvant = t.assigneA;
    const maintenant = Date.now();

    // Effets de bord des changements : silence pendant la fenêtre.
    if (t.type === 'changement' && cible === 'en-cours' && t.silencerAlertes && t.ci && !t.silenceId) {
      try {
        const fin = Math.max(t.finPrevue ?? 0, maintenant + HEURE);
        t.silenceId = await this.effets.creerSilence(t.ci, maintenant, fin, `${t.numero} — ${t.titre}`, auteur);
        this.tracer(t, 'supervision', `Alertes du CI « ${t.ci} » mises en silence jusqu’à ${new Date(fin).toLocaleString('fr-FR')}.`);
      } catch (e) {
        this.tracer(t, 'supervision', `Silence impossible : ${(e as Error).message}`);
      }
    }
    if (t.type === 'changement' && (cible === 'revue' || cible === 'annule') && t.silenceId) {
      await this.effets.supprimerSilence(t.silenceId).catch(() => undefined);
      this.tracer(t, 'supervision', 'Silence des alertes levé.');
      t.silenceId = null;
    }

    this.stockage.modifier(() => {
      t.statut = cible;
      // « En attente » met le SLA en pause ; à la reprise, les échéances sont repoussées d'autant.
      if (cible === 'en-attente') t.pauseDepuis = maintenant;
      else if (t.pauseDepuis) {
        t.pauses = [...(t.pauses ?? []), { debut: t.pauseDepuis, fin: maintenant }];
        t.pauseDepuis = null;
        this.calculerSla(t);
      }
      if (avant === STATUTS[t.type][0].cle && !t.prisEnChargeLe && cible !== 'annule') t.prisEnChargeLe = maintenant;
      if (!t.assigneA && ['en-cours', 'analyse'].includes(cible)) t.assigneA = auteur;
      if (cible === 'resolu') t.resoluLe = maintenant;
      if (cible === 'clos' || cible === 'annule' || cible === 'rejete') t.closLe = maintenant;
      if (avant === 'resolu' && !['clos'].includes(cible)) {
        t.resoluLe = null;
        t.closLe = null;
      }
      this.tracer(t, auteur, `État : ${libelleStatut(t.type, avant)} → ${libelleStatut(t.type, cible)}`);
      if (commentaire?.trim()) this.tracer(t, auteur, commentaire.trim().slice(0, 20000), 'note');
    });

    if (t.type === 'changement' && cible === 'en-cours') {
      this.stockage.ajouterEvenement({ t: maintenant, type: 'deploiement', titre: `${t.numero} en cours`, detail: t.titre, statut: 'vert' });
    }
    if ((t.type === 'incident' && cible === 'resolu') || (t.type === 'changement' && cible === 'clos')) {
      const echec = t.type === 'changement' && t.resultat !== 'reussi';
      this.stockage.ajouterEvenement({
        t: maintenant,
        type: 'resolution',
        titre: `${t.numero} ${t.type === 'incident' ? 'résolu' : `clos (${t.resultat === 'reussi' ? 'réussi' : t.resultat === 'echoue' ? 'échoué' : 'retour arrière'})`}`,
        detail: t.titre,
        statut: echec ? 'orange' : 'vert',
      });
    }
    this.signaler({ type: 'statut', ticket: t, avant, auteur });
    if (assigneAvant !== t.assigneA && t.assigneA && t.assigneA !== auteur) this.signaler({ type: 'assigne', ticket: t, auteur });
    return t;
  }

  ajouterActivite(cle: string, type: 'note' | 'commentaire', contenu: string, auteur: string): Ticket {
    const t = this.exiger(cle);
    if (!contenu.trim()) throw new ErreurMetier('Message vide');
    this.stockage.modifier(() => {
      this.tracer(t, auteur, contenu.trim().slice(0, 20000), type);
    });
    this.signaler({ type: 'activite', ticket: t, nature: type, texte: contenu.trim(), auteur });
    return t;
  }

  approuver(cle: string, decision: 'approuve' | 'rejete', commentaire: string, auteur: string): Ticket {
    const t = this.exiger(cle);
    if (t.type !== 'changement') throw new ErreurMetier('Seuls les changements s’approuvent');
    if (t.statut !== 'evaluation') throw new ErreurMetier('Le changement doit être en évaluation');
    if (decision === 'rejete' && !commentaire.trim()) throw new ErreurMetier('Expliquer le rejet');
    // Séparation des tâches : on n'approuve pas son propre changement.
    if (auteur === t.demandeur || t.activite[0]?.auteur === auteur) throw new ErreurMetier('Un changement doit être approuvé par quelqu’un d’autre que son demandeur');
    this.stockage.modifier(() => {
      t.approbations = [...(t.approbations ?? []), { par: auteur, decision, commentaire: commentaire.slice(0, 2000), le: Date.now() }];
      this.tracer(t, auteur, `${decision === 'approuve' ? 'Approuvé' : 'Rejeté'}${commentaire.trim() ? ` : ${commentaire.trim()}` : ''}`);
      t.statut = decision === 'approuve' ? 'approuve' : 'rejete';
      if (decision === 'rejete') t.closLe = Date.now();
      this.tracer(t, 'supervision', `État : Évaluation → ${decision === 'approuve' ? 'Approuvé' : 'Rejeté'}`);
    });
    this.signaler({ type: 'approbation', ticket: t, decision, commentaire, auteur });
    return t;
  }

  lier(cle: string, cible: string, auteur: string): Ticket {
    const a = this.exiger(cle);
    const b = this.exiger(cible);
    if (a.numero === b.numero) throw new ErreurMetier('Un ticket ne se lie pas à lui-même');
    if (a.liens.includes(b.numero)) return a;
    this.stockage.modifier(() => {
      a.liens.push(b.numero);
      b.liens.push(a.numero);
      this.tracer(a, auteur, `Lié à ${b.numero} (${b.titre})`);
      this.tracer(b, auteur, `Lié à ${a.numero} (${a.titre})`);
    });
    return a;
  }

  delier(cle: string, cible: string, auteur: string): Ticket {
    const a = this.exiger(cle);
    const b = this.trouver(cible);
    this.stockage.modifier(() => {
      a.liens = a.liens.filter((n) => n !== cible);
      this.tracer(a, auteur, `Lien avec ${cible} retiré`);
      if (b) {
        b.liens = b.liens.filter((n) => n !== a.numero);
        this.tracer(b, auteur, `Lien avec ${a.numero} retiré`);
      }
    });
    return a;
  }

  /** Changements dont la fenêtre chevauche celle de `t` sur le même CI. */
  conflits(t: Ticket): TicketResume[] {
    if (t.type !== 'changement' || !t.debutPrevu || !t.finPrevue) return [];
    return this.liste
      .filter((x) => x.type === 'changement' && x.numero !== t.numero && estOuvert(x) && x.debutPrevu && x.finPrevue)
      .filter((x) => !t.ci || !x.ci || x.ci === t.ci)
      .filter((x) => (x.debutPrevu as number) < (t.finPrevue as number) && (x.finPrevue as number) > (t.debutPrevu as number))
      .map((x) => this.resume(x));
  }

  calendrier(de: number, a: number): TicketResume[] {
    return this.liste
      .filter((t) => t.type === 'changement' && t.debutPrevu && t.finPrevue && t.statut !== 'annule' && t.statut !== 'rejete')
      .filter((t) => (t.debutPrevu as number) < a && (t.finPrevue as number) > de)
      .sort((x, y) => (x.debutPrevu as number) - (y.debutPrevu as number))
      .map((t) => this.resume(t));
  }

  /**
   * Rapproche les tickets des alertes actives (toutes les 30 s) :
   * fil d'activité, incident automatique pour P1/P2, et clôtures.
   */
  synchroniser(alertes: Alerte[], maintenant = Date.now()): void {
    const actives = alertes.filter((a) => !a.silencieuse);
    const ids = new Set(actives.map((a) => a.id));
    const vus = this.stockage.donnees.vus.alertes;

    for (const a of actives) {
      if (vus[a.id]) continue;
      this.stockage.ajouterEvenement({ t: a.debut, type: 'alerte', titre: `${a.priorite} · ${a.nom}`, detail: a.resume, statut: statutDeLaPriorite(a.priorite) });
      this.stockage.modifier((e) => {
        e.vus.alertes[a.id] = a.debut;
      });
    }
    for (const id of Object.keys(vus)) {
      if (ids.has(id) || alertes.some((a) => a.id === id)) continue;
      this.stockage.modifier((e) => {
        delete e.vus.alertes[id];
      });
      this.stockage.ajouterEvenement({ t: maintenant, type: 'resolution', titre: 'Alerte terminée', detail: 'Retour à la normale', statut: 'vert' });
    }

    // Un incident par alerte P1 / P2 (sauf si un ticket la couvre déjà).
    for (const a of actives.filter((x) => x.priorite === 'P1' || x.priorite === 'P2')) {
      if (this.liste.some((t) => t.alertes.includes(a.id))) continue;
      const p = a.priorite as Exclude<Priorite, 'Info' | 'P3'>;
      this.creer(
        'incident',
        {
          titre: a.resume || a.nom,
          description: `Alerte ${a.nom}${a.action ? `\nPremière action : ${a.action}` : ''}`,
          ...niveauxDePriorite(p),
          categorie: a.labels.job === 'machine' ? 'Serveur' : a.labels.job === 'postgresql' ? 'Base de données' : 'Application',
          ci: a.labels.service ?? (a.labels.job === 'postgresql' ? 'postgres' : a.labels.job === 'machine' ? 'serveur' : null),
          groupe: 'Exploitation',
        },
        'supervision',
        { automatique: true, alertes: [a.id], creeLe: a.debut },
      );
    }

    // Quand les alertes disparaissent : résolu si personne ne l'a pris, sinon une note.
    for (const t of this.liste) {
      if (t.type !== 'incident' || !t.automatique || !estOuvert(t) || !t.alertes.length) continue;
      if (t.alertes.some((id) => ids.has(id))) continue;
      if (t.activite.some((x) => x.texte.startsWith('Les alertes ont disparu'))) continue;
      this.stockage.modifier(() => {
        if (t.statut === 'nouveau') {
          t.statut = 'resolu';
          t.resoluLe = maintenant;
          t.codeResolution = 'Résolu automatiquement';
          t.notesResolution = 'Les alertes ont disparu sans intervention.';
          this.tracer(t, 'supervision', 'Les alertes ont disparu : résolu automatiquement.');
        } else {
          this.tracer(t, 'supervision', 'Les alertes ont disparu : vérifier puis résoudre.');
        }
      });
    }

    // Clôture automatique des tickets résolus depuis 3 jours.
    for (const t of this.liste) {
      if (t.statut === 'resolu' && t.resoluLe && maintenant - t.resoluLe > CLOTURE_AUTO) {
        this.stockage.modifier(() => {
          t.statut = 'clos';
          t.closLe = maintenant;
          this.tracer(t, 'supervision', 'Clos automatiquement 3 jours après la résolution.');
        });
      }
    }
    this.verifierSla(maintenant);
  }

  /** Prévient une seule fois par phase quand un SLA devient à risque, puis dépassé. */
  verifierSla(maintenant = Date.now()): void {
    for (const t of this.liste) {
      if (!estOuvert(t) || (t.type !== 'incident' && t.type !== 'demande')) continue;
      const s = this.sla(t, maintenant);
      if ((s.etat !== 'a-risque' && s.etat !== 'depasse') || !s.phase) continue;
      const cle = `${s.phase}:${s.etat}`;
      if (t.slaNotifie?.includes(cle)) continue;
      this.stockage.modifier(() => {
        t.slaNotifie = [...(t.slaNotifie ?? []), cle];
        if (s.etat === 'depasse') this.tracer(t, 'supervision', `SLA dépassé (${s.phase === 'reponse' ? 'prise en charge' : 'résolution'}).`);
      });
      this.signaler({ type: 'sla', ticket: t, etat: s.etat, phase: s.phase });
    }
  }

  /** Accueil du service desk : compteurs et listes de travail. */
  tableau(moi: string, maintenant = Date.now()) {
    const ouverts = this.liste.filter(estOuvert);
    const parType = (type: TypeTicket) => ouverts.filter((t) => t.type === type);
    const recents = this.liste.filter((t) => t.type === 'incident' && t.creeLe > maintenant - 30 * JOUR);
    const moyenne = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length / 60_000 : null);
    const slaTickets = this.liste.filter((t) => t.type === 'incident' || t.type === 'demande');
    const slaClos = slaTickets.filter((t) => t.resoluLe && t.resoluLe > maintenant - 30 * JOUR);
    const debutMois = new Date(maintenant);
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    const resume = (t: Ticket) => this.resume(t, maintenant);
    return {
      compteurs: {
        incidents: parType('incident').length,
        majeurs: parType('incident').filter((t) => t.priorite === 'P1' || t.priorite === 'P2').length,
        problemes: parType('probleme').length,
        erreursConnues: this.liste.filter((t) => t.type === 'probleme' && t.statut === 'erreur-connue').length,
        changements: parType('changement').length,
        aApprouver: this.liste.filter((t) => t.type === 'changement' && t.statut === 'evaluation').length,
        demandes: parType('demande').length,
        slaDepasses: ouverts.filter((t) => this.sla(t, maintenant).etat === 'depasse').length,
        slaARisque: ouverts.filter((t) => this.sla(t, maintenant).etat === 'a-risque').length,
        nonAssignes: ouverts.filter((t) => !t.assigneA && t.type !== 'changement').length,
        incidentsCeMois: this.liste.filter((t) => t.type === 'incident' && t.creeLe >= debutMois.getTime()).length,
        postMortemsEnRetard: this.liste.filter(
          (t) =>
            t.type === 'incident' && (t.priorite === 'P1' || t.priorite === 'P2') && t.resoluLe && maintenant - t.resoluLe > 5 * JOUR && !t.postMortem?.trim() && !t.automatique,
        ).length,
      },
      indicateurs: {
        mttaMinutes: moyenne(recents.filter((t) => t.prisEnChargeLe).map((t) => (t.prisEnChargeLe as number) - t.creeLe)),
        mttrMinutes: moyenne(recents.filter((t) => t.resoluLe).map((t) => (t.resoluLe as number) - t.creeLe)),
        respectSla: slaClos.length ? slaClos.filter((t) => this.sla(t, maintenant).etat === 'tenu').length / slaClos.length : null,
      },
      mesTickets: ouverts.filter((t) => t.assigneA === moi).map(resume),
      nonAssignes: ouverts.filter((t) => !t.assigneA && t.type !== 'changement').map(resume),
      majeurs: ouverts.filter((t) => t.type === 'incident' && (t.priorite === 'P1' || t.priorite === 'P2')).map(resume),
      prochainsChangements: this.calendrier(maintenant - JOUR, maintenant + 14 * JOUR).filter((t) => t.statut !== 'clos'),
      aApprouver: this.liste.filter((t) => t.type === 'changement' && t.statut === 'evaluation').map(resume),
    };
  }

  /** Incidents récents pour la page de statut publique. */
  incidentsPublics(): { titre: string; statut: string; detecteLe: number; resoluLe: number | null }[] {
    return this.liste
      .filter((t) => t.type === 'incident' && (t.priorite === 'P1' || t.priorite === 'P2') && t.statut !== 'annule')
      .slice(0, 5)
      .map((t) => ({ titre: 'Perturbation du service', statut: t.resoluLe ? 'resolu' : 'en-cours', detecteLe: t.creeLe, resoluLe: t.resoluLe }));
  }

  /** CI valides pour les formulaires : la CMDB légère + ceux déjà utilisés. */
  elementsConfiguration(): string[] {
    return [...new Set([...ELEMENTS_CONFIGURATION, ...this.liste.map((t) => t.ci).filter((c): c is string => !!c)])];
  }
}
