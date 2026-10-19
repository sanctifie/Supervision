import { randomUUID } from 'node:crypto';
import { estOuvert, niveauxDePriorite, type PrioriteTicket } from '../../shared/itsm';
import type { RegleJournal } from '../../shared/journaux';
import type { FiltreJournaux, LigneJournal } from '../../shared/types';
import { ErreurMetier } from './erreurs';
import type { Stockage } from './stockage';
import type { Tickets } from './tickets';

const MAX_REGLES = 20;
const FENETRES = [5, 15, 60, 360, 1440];
const NIVEAUX = ['', 'warn', 'error'];
const PRIORITES: PrioriteTicket[] = ['P1', 'P2', 'P3', 'P4'];

/**
 * Règles sur les journaux (inspirées des règles de seuil de logs de Kibana) :
 * si une recherche ramène au moins `seuil` lignes dans la fenêtre, un incident
 * s'ouvre ; il n'y en a jamais deux en même temps pour la même règle.
 */
export class ReglesJournaux {
  constructor(
    private readonly stockage: Stockage,
    private readonly tickets: Tickets,
    private readonly lire: (f: FiltreJournaux) => Promise<LigneJournal[]>,
  ) {}

  lister(): RegleJournal[] {
    return this.stockage.donnees.reglesJournaux;
  }

  private exiger(id: string): RegleJournal {
    const r = this.lister().find((x) => x.id === id);
    if (!r) throw new ErreurMetier(`Règle ${id} introuvable`);
    return r;
  }

  /** Valide les champs modifiables ; `base` complète ce qui n'est pas envoyé. */
  private valider(champs: Record<string, unknown>, base?: RegleJournal) {
    const texte = (v: unknown, max: number, defaut = '') => (typeof v === 'string' ? v.trim().slice(0, max) : defaut);
    const v = { ...(base ?? {}), ...champs } as Record<string, unknown>;
    const nom = texte(v.nom, 60);
    if (!nom) throw new ErreurMetier('Donnez un nom à la règle');
    const service = texte(v.service, 40);
    const niveau = NIVEAUX.includes(texte(v.niveau, 10)) ? texte(v.niveau, 10) : '';
    const motif = texte(v.texte, 200);
    if (!service && !niveau && !motif) throw new ErreurMetier('Précisez au moins un filtre (service, niveau ou texte)');
    const seuil = Math.round(Number(v.seuil));
    if (!(seuil >= 1 && seuil <= 1000)) throw new ErreurMetier('Seuil : entre 1 et 1000 lignes');
    const minutes = Number(v.minutes);
    if (!FENETRES.includes(minutes)) throw new ErreurMetier(`Fenêtre : ${FENETRES.join(', ')} minutes`);
    const priorite = PRIORITES.includes(v.priorite as PrioriteTicket) ? (v.priorite as PrioriteTicket) : 'P3';
    return { nom, service, niveau, texte: motif, seuil, minutes, priorite, actif: v.actif !== false };
  }

  creer(champs: Record<string, unknown>, auteur: string): RegleJournal {
    if (this.lister().length >= MAX_REGLES) throw new ErreurMetier(`${MAX_REGLES} règles au plus`);
    const r: RegleJournal = {
      id: randomUUID(),
      ...this.valider(champs),
      par: auteur,
      le: Date.now(),
      etat: 'ok',
      dernierDeclenchement: null,
      dernierComptage: null,
      ticket: null,
      erreur: null,
    };
    this.stockage.modifier((e) => e.reglesJournaux.unshift(r));
    return r;
  }

  modifier(id: string, champs: Record<string, unknown>): RegleJournal {
    const r = this.exiger(id);
    const v = this.valider(champs, r);
    this.stockage.modifier(() => Object.assign(r, v));
    return r;
  }

  supprimer(id: string): void {
    this.stockage.modifier((e) => {
      e.reglesJournaux = e.reglesJournaux.filter((x) => x.id !== id);
    });
  }

  /** Lit les journaux de chaque règle active et ouvre un incident si le seuil est atteint. */
  async evaluer(maintenant = Date.now()): Promise<void> {
    for (const r of this.lister().filter((x) => x.actif)) {
      let lignes: LigneJournal[];
      try {
        lignes = await this.lire({ service: r.service || undefined, niveau: r.niveau || undefined, texte: r.texte || undefined, minutes: r.minutes, limite: r.seuil });
      } catch (e) {
        if (r.erreur !== (e as Error).message) this.stockage.modifier(() => void (r.erreur = (e as Error).message));
        continue;
      }
      const declenchee = lignes.length >= r.seuil;
      const ticket = r.ticket ? this.tickets.trouver(r.ticket) : undefined;
      const ticketOuvert = !!ticket && estOuvert(ticket);
      // Après un déclenchement, on laisse passer une fenêtre avant d'en ouvrir un autre.
      const refroidie = !r.dernierDeclenchement || maintenant - r.dernierDeclenchement >= r.minutes * 60_000;
      const ouvrir = declenchee && !ticketOuvert && refroidie;

      if (ouvrir) {
        const t = this.tickets.creer(
          'incident',
          {
            titre: `Règle « ${r.nom} » : au moins ${r.seuil} ligne(s) en ${libelleFenetre(r.minutes)}`,
            description: this.description(r, lignes),
            ...niveauxDePriorite(r.priorite),
            categorie: 'Application',
            ci: r.service && this.tickets.elementsConfiguration().includes(r.service) ? r.service : null,
            groupe: 'Exploitation',
          },
          'supervision',
          { automatique: true, regle: r.id },
        );
        r.ticket = t.numero;
        r.dernierDeclenchement = maintenant;
      } else if (!declenchee && r.etat === 'declenchee' && ticketOuvert) {
        this.tickets.noter(ticket.numero, `La règle n’est plus déclenchée : moins de ${r.seuil} ligne(s) en ${libelleFenetre(r.minutes)}.`);
      }
      const etat = declenchee ? 'declenchee' : 'ok';
      if (ouvrir || r.etat !== etat || r.dernierComptage !== lignes.length || r.erreur) {
        this.stockage.modifier(() => {
          r.etat = etat;
          r.dernierComptage = lignes.length;
          r.erreur = null;
        });
      }
    }
  }

  private description(r: RegleJournal, lignes: LigneJournal[]): string {
    const filtres = [r.service && `service ${r.service}`, r.niveau && `niveau ${r.niveau}`, r.texte && `texte « ${r.texte} »`].filter(Boolean).join(', ');
    const exemples = lignes.slice(0, 3).map((l) => `- [${l.service}] ${l.message.slice(0, 200)}`);
    const q = new URLSearchParams({
      minutes: String(r.minutes),
      ...(r.service && { service: r.service }),
      ...(r.niveau && { niveau: r.niveau }),
      ...(r.texte && { texte: r.texte }),
    });
    return [
      `Règle de journaux « ${r.nom} » (${filtres}) : ${lignes.length} ligne(s) ou plus dans les ${libelleFenetre(r.minutes)}, seuil ${r.seuil}.`,
      '',
      'Dernières lignes :',
      ...exemples,
      '',
      `Voir les journaux : /journaux?${q}`,
    ].join('\n');
  }
}

function libelleFenetre(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`;
}
