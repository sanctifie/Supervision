import { randomUUID } from 'node:crypto';
import type { Stockage } from './stockage';
import type { Comptes, CompteStocke } from './comptes';
import { echapperHtml, type Canaux } from './canaux';
import { config } from './config';
import { LIBELLE_TYPE, libelleStatut, type Ticket } from '../../shared/itsm';
import { permissionsDe } from '../../shared/comptes';

/**
 * Qui prévenir, et comment. Chaque notification est gardée dans l'application
 * (la cloche) ; elle part aussi sur Telegram et par e-mail selon les
 * préférences de chacun. Personne n'est prévenu de sa propre action.
 */

export interface Notification {
  id: string;
  compteId: string;
  t: number;
  titre: string;
  texte: string;
  lien: string;
  lu: boolean;
}

/** Ce que le moteur de tickets signale. */
export type EvenementTicket =
  | { type: 'cree'; ticket: Ticket; auteur: string }
  | { type: 'assigne'; ticket: Ticket; auteur: string }
  | { type: 'statut'; ticket: Ticket; avant: string; auteur: string }
  | { type: 'activite'; ticket: Ticket; nature: 'note' | 'commentaire'; texte: string; auteur: string }
  | { type: 'approbation'; ticket: Ticket; decision: 'approuve' | 'rejete'; commentaire: string; auteur: string }
  | { type: 'sla'; ticket: Ticket; etat: 'a-risque' | 'depasse'; phase: 'reponse' | 'resolution' };

const MAX_PAR_PERSONNE = 200;

export class Notifications {
  constructor(
    private readonly stockage: Stockage,
    private readonly comptes: Comptes,
    private readonly canaux: Canaux,
  ) {}

  // --- Lecture (la cloche) ----------------------------------------------------

  lister(compteId: string): { notifications: Notification[]; nonLues: number } {
    const miennes = this.stockage.donnees.notifications.filter((n) => n.compteId === compteId);
    return { notifications: miennes.slice(0, 50), nonLues: miennes.filter((n) => !n.lu).length };
  }

  marquerLues(compteId: string, id?: string): void {
    this.stockage.modifier((e) => {
      for (const n of e.notifications) if (n.compteId === compteId && (!id || n.id === id)) n.lu = true;
    });
  }

  etatCanaux() {
    return { telegram: this.canaux.telegramActif(), email: this.canaux.emailActif(), equipe: this.canaux.telegramActif() && !!config.telegramEquipe };
  }

  /** Envoie un message de test sur mes canaux ; dit lesquels ont marché. */
  async tester(c: CompteStocke): Promise<Record<string, string>> {
    const resultat: Record<string, string> = {};
    this.garder([c], { titre: 'Notification de test', texte: 'Si vous lisez ceci, la cloche fonctionne.', lien: '/profil' });
    resultat.application = 'ok';
    if (!this.canaux.telegramActif()) resultat.telegram = 'non configuré sur le serveur (TELEGRAM_BOT_TOKEN)';
    else if (!c.telegram) resultat.telegram = 'renseignez votre identifiant Telegram';
    else
      resultat.telegram = await this.canaux
        .telegram(c.telegram, '✅ <b>Supervision</b> : notification de test.')
        .then(() => 'ok')
        .catch((e: Error) => e.message);
    if (!this.canaux.emailActif()) resultat.email = 'non configuré sur le serveur (SMTP_HOTE)';
    else if (!c.email) resultat.email = 'renseignez votre e-mail';
    else
      resultat.email = await this.canaux
        .email(c.email, 'Supervision : notification de test', 'Si vous lisez ceci, les e-mails de la supervision vous parviennent.')
        .then(() => 'ok')
        .catch((e: Error) => e.message);
    return resultat;
  }

  // --- Envoi ---------------------------------------------------------------------

  private garder(destinataires: CompteStocke[], n: { titre: string; texte: string; lien: string }) {
    if (!destinataires.length) return;
    const t = Date.now();
    this.stockage.modifier((e) => {
      for (const c of destinataires) e.notifications.unshift({ id: randomUUID(), compteId: c.id, t, titre: n.titre, texte: n.texte, lien: n.lien, lu: false });
      // Au plus 200 par personne.
      const compte = new Map<string, number>();
      e.notifications = e.notifications.filter((x) => {
        const k = (compte.get(x.compteId) ?? 0) + 1;
        compte.set(x.compteId, k);
        return k <= MAX_PAR_PERSONNE;
      });
    });
  }

  private envoyer(destinataires: CompteStocke[], n: { titre: string; texte: string; lien: string }, equipe = false) {
    const uniques = [...new Map(destinataires.filter((c) => c.actif).map((c) => [c.id, c])).values()];
    this.garder(uniques, n);
    const lien = config.urlPublique ? `${config.urlPublique}${n.lien}` : '';
    const html = `<b>${echapperHtml(n.titre)}</b>\n${echapperHtml(n.texte)}${lien ? `\n${lien}` : ''}`;
    const texte = `${n.texte}${lien ? `\n\n${lien}` : ''}\n\n— Supervision ${config.nomProduit}`;
    const journaliser = (canal: string, qui: string) => (e: Error) => console.error(`[notifications] ${canal} vers ${qui} : ${e.message}`);
    for (const c of uniques) {
      if (c.notifications.telegram && c.telegram && this.canaux.telegramActif()) void this.canaux.telegram(c.telegram, html).catch(journaliser('Telegram', c.nom));
      if (c.notifications.email && c.email && this.canaux.emailActif()) void this.canaux.email(c.email, n.titre, texte).catch(journaliser('e-mail', c.nom));
    }
    if (equipe && config.telegramEquipe && this.canaux.telegramActif()) void this.canaux.telegram(config.telegramEquipe, html).catch(journaliser('Telegram', 'l’équipe'));
  }

  // --- Qui prévenir ---------------------------------------------------------------

  private personne(nom: string | null | undefined): CompteStocke[] {
    const c = nom ? this.comptes.parNom(nom) : undefined;
    return c ? [c] : [];
  }

  private agents(groupe?: string | null): CompteStocke[] {
    const tous = this.stockage.donnees.comptes.filter((c) => c.actif && permissionsDe(c).includes('agir'));
    const duGroupe = groupe ? tous.filter((c) => c.groupes.includes(groupe)) : [];
    return duGroupe.length ? duGroupe : tous;
  }

  private approbateurs(): CompteStocke[] {
    return this.stockage.donnees.comptes.filter((c) => c.actif && permissionsDe(c).includes('approuver'));
  }

  /** Qui travaille sur le ticket : l'assigné, sinon son groupe, sinon tous les agents. */
  private responsables(t: Ticket): CompteStocke[] {
    const assigne = this.personne(t.assigneA);
    return assigne.length ? assigne : this.agents(t.groupe);
  }

  traiter(e: EvenementTicket): void {
    const t = e.ticket;
    const lien = `/tickets/${t.numero}`;
    const sauf = (liste: CompteStocke[], nom?: string) => liste.filter((c) => c.nom !== nom);
    const entete = `${t.numero} · ${t.priorite}`;

    switch (e.type) {
      case 'cree': {
        if (t.type === 'incident' && (t.priorite === 'P1' || t.priorite === 'P2')) {
          this.envoyer(
            sauf(this.agents(), e.auteur),
            { titre: `🚨 Incident ${t.priorite} : ${t.titre}`, texte: `${t.numero}${t.ci ? ` · ${t.ci}` : ''} — ouvert par ${e.auteur}.`, lien },
            true,
          );
        } else if (t.type !== 'changement' && t.type !== 'probleme') {
          this.envoyer(sauf(this.responsables(t), e.auteur), { titre: `${LIBELLE_TYPE[t.type].nouveau} : ${t.titre}`, texte: `${entete} — ouvert par ${e.auteur}.`, lien });
        } else if (t.assigneA) {
          this.envoyer(sauf(this.personne(t.assigneA), e.auteur), { titre: `${LIBELLE_TYPE[t.type].un} assigné : ${t.titre}`, texte: `${t.numero} — par ${e.auteur}.`, lien });
        }
        break;
      }
      case 'assigne':
        this.envoyer(sauf(this.personne(t.assigneA), e.auteur), { titre: `Vous êtes assigné à ${t.numero}`, texte: `${t.titre} (${t.priorite}) — par ${e.auteur}.`, lien });
        break;
      case 'statut': {
        if (t.type === 'changement' && t.statut === 'evaluation') {
          this.envoyer(sauf(this.approbateurs(), e.auteur), {
            titre: `Changement à approuver : ${t.titre}`,
            texte: `${t.numero}${t.debutPrevu ? ` · prévu le ${new Date(t.debutPrevu).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: config.fuseau })}` : ''} — soumis par ${e.auteur}.`,
            lien,
          });
        } else if ((t.type === 'incident' || t.type === 'demande') && t.statut === 'resolu') {
          this.envoyer(sauf(this.personne(t.demandeur), e.auteur), { titre: `${t.numero} est résolu`, texte: `${t.titre}\n${t.notesResolution ?? ''}`.trim(), lien });
        } else if (e.avant === 'resolu' && t.statut !== 'clos') {
          this.envoyer(sauf(this.responsables(t), e.auteur), { titre: `${t.numero} rouvert`, texte: `${t.titre} — par ${e.auteur}.`, lien });
        }
        break;
      }
      case 'activite': {
        const apercu = e.texte.length > 300 ? `${e.texte.slice(0, 300)}…` : e.texte;
        if (e.nature === 'commentaire' && e.auteur !== t.demandeur) {
          this.envoyer(sauf(this.personne(t.demandeur), e.auteur), { titre: `Réponse sur ${t.numero}`, texte: `${e.auteur} : ${apercu}`, lien });
        }
        if (e.nature === 'commentaire' && e.auteur === t.demandeur) {
          this.envoyer(sauf(this.responsables(t), e.auteur), { titre: `${t.demandeur} a écrit sur ${t.numero}`, texte: apercu, lien });
        }
        if (e.nature === 'note' && t.assigneA && t.assigneA !== e.auteur) {
          this.envoyer(this.personne(t.assigneA), { titre: `Note de ${e.auteur} sur ${t.numero}`, texte: apercu, lien });
        }
        break;
      }
      case 'approbation': {
        const createur = t.activite[0]?.auteur;
        this.envoyer(sauf([...this.personne(t.demandeur), ...this.personne(createur), ...this.personne(t.assigneA)], e.auteur), {
          titre: `${t.numero} ${e.decision === 'approuve' ? 'approuvé' : 'rejeté'} par ${e.auteur}`,
          texte: `${t.titre}${e.commentaire ? `\n« ${e.commentaire} »` : ''}`,
          lien,
        });
        break;
      }
      case 'sla': {
        const quoi = e.phase === 'reponse' ? 'la prise en charge' : 'la résolution';
        const majeur = t.priorite === 'P1' || t.priorite === 'P2';
        if (e.etat === 'a-risque') {
          this.envoyer(this.responsables(t), {
            titre: `⏳ SLA à risque : ${t.numero}`,
            texte: `${t.titre} — délai de ${quoi} bientôt atteint (${t.priorite}, ${libelleStatut(t.type, t.statut)}).`,
            lien,
          });
        } else {
          const admins = this.stockage.donnees.comptes.filter((c) => c.actif && c.role === 'admin');
          this.envoyer(
            [...this.responsables(t), ...admins],
            { titre: `⛔ SLA dépassé : ${t.numero}`, texte: `${t.titre} — délai de ${quoi} dépassé (${t.priorite}).`, lien },
            majeur,
          );
        }
        break;
      }
    }
    this.prevenirSuivi(e, lien);
  }

  /** La liste de suivi apprend les changements d'état et les messages (notes internes : agents seulement). */
  private prevenirSuivi(e: EvenementTicket, lien: string): void {
    if (e.type !== 'statut' && e.type !== 'activite') return;
    const t = e.ticket;
    const auteur = e.auteur;
    const deja = [auteur, t.assigneA, t.demandeur];
    const qui = (t.suivi ?? [])
      .filter((n) => !deja.includes(n))
      .flatMap((n) => this.personne(n))
      .filter((c) => e.type !== 'activite' || e.nature !== 'note' || permissionsDe(c).includes('agir'));
    const texte = e.type === 'statut' ? `${libelleStatut(t.type, t.statut)} — par ${auteur}.` : `${auteur} : ${e.texte.slice(0, 300)}`;
    this.envoyer(qui, { titre: `Suivi ${t.numero} : ${t.titre}`, texte, lien });
  }
}
