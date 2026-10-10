import { randomUUID } from 'node:crypto';
import type { Stockage } from './stockage';
import type { Tickets } from './tickets';
import { ErreurMetier } from './erreurs';
import { CATEGORIES_ARTICLES, motsDe, normaliser, type Article, type ArticleResume, type Audience, type StatutArticle } from '../../shared/connaissances';
import type { Ticket } from '../../shared/itsm';

/**
 * La base de connaissances : rédaction, versions, publication, recherche
 * (titre, mots-clés et texte, sans accents), liens avec les tickets.
 * Un demandeur ne voit que les articles publiés ouverts à tous.
 */

const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export class BaseConnaissances {
  constructor(
    private readonly stockage: Stockage,
    private readonly tickets: Tickets,
  ) {}

  private get liste(): Article[] {
    return this.stockage.donnees.articles;
  }

  private visible(a: Article, interne: boolean): boolean {
    return interne || (a.statut === 'publie' && a.audience === 'tous');
  }

  trouver(cle: string, interne: boolean): Article {
    const a = this.liste.find((x) => x.numero === cle || x.id === cle);
    if (!a || !this.visible(a, interne)) throw new ErreurMetier(`Article ${cle} introuvable`);
    return a;
  }

  resume(a: Article, pertinence?: number): ArticleResume {
    const { id, numero, titre, resume, categorie, ci, statut, audience, auteur, majLe, vues, avis } = a;
    return {
      id,
      numero,
      titre,
      resume,
      categorie,
      ci,
      statut,
      audience,
      auteur,
      majLe,
      vues,
      avis,
      tickets: a.tickets.length,
      ...(pertinence !== undefined ? { pertinence } : {}),
    };
  }

  /** Score de pertinence : titre ×3, mots-clés ×2, résumé et texte ×1. */
  private score(a: Article, mots: string[]): number {
    const titre = normaliser(a.titre);
    const cles = normaliser(a.motsCles.join(' '));
    const corps = normaliser(`${a.resume} ${a.contenu} ${a.ci ?? ''}`);
    let s = 0;
    for (const m of mots) {
      if (titre.includes(m)) s += 3;
      if (cles.includes(m)) s += 2;
      if (corps.includes(m)) s += 1;
    }
    return s;
  }

  lister(f: { q?: string; statut?: string; categorie?: string }, interne: boolean): ArticleResume[] {
    const mots = f.q ? motsDe(f.q) : [];
    return this.liste
      .filter((a) => this.visible(a, interne))
      .filter((a) => (f.statut ? a.statut === f.statut : interne ? a.statut !== 'retire' : true))
      .filter((a) => !f.categorie || a.categorie === f.categorie)
      .map((a) => ({ a, s: mots.length ? this.score(a, mots) : 0 }))
      .filter((x) => !mots.length || x.s > 0)
      .sort((x, y) => y.s - x.s || (x.a.statut === 'publie' ? -1 : 1) - (y.a.statut === 'publie' ? -1 : 1) || y.a.majLe - x.a.majLe)
      .map((x) => this.resume(x.a, mots.length ? x.s : undefined));
  }

  /** Les articles publiés qui peuvent aider pour un texte donné (titre d'un ticket…). */
  suggerer(q: string, interne: boolean, limite = 5): ArticleResume[] {
    if (motsDe(q).length === 0) return [];
    return this.lister({ q, statut: 'publie' }, interne)
      .filter((a) => (a.pertinence ?? 0) >= 3)
      .slice(0, limite);
  }

  private numero(): string {
    const n = (this.stockage.donnees.compteurs.KB ?? 1000) + 1;
    this.stockage.donnees.compteurs.KB = n;
    return `KB${String(n).padStart(7, '0')}`;
  }

  /** Un brouillon pré-rempli à partir d'un ticket résolu ou d'une erreur connue. */
  modeleDepuis(t: Ticket): Partial<Article> {
    const sections =
      t.type === 'probleme'
        ? [`## Symptômes\n${t.description || t.titre}`, `## Cause\n${t.causeRacine || '…'}`, `## Contournement\n${t.contournement || '…'}`]
        : [`## Symptômes\n${t.description || t.titre}`, `## Solution\n${t.notesResolution || t.contournement || '…'}`];
    return {
      titre: t.type === 'probleme' ? `Erreur connue : ${t.titre}` : `Que faire si : ${t.titre}`,
      resume: '',
      contenu: [...sections, `## Pour vérifier\n- …`].join('\n\n'),
      ci: t.ci,
      categorie: CATEGORIES_ARTICLES.find((c) => normaliser(c).includes(normaliser(t.categorie).split(' ')[0])) ?? 'Autre',
      motsCles: motsDe(t.titre).slice(0, 6),
    };
  }

  creer(d: Record<string, unknown>, auteur: string): Article {
    const titre = texte(d.titre, 200).trim();
    if (!titre) throw new ErreurMetier('Le titre est obligatoire');
    const maintenant = Date.now();
    let a!: Article;
    this.stockage.modifier((e) => {
      a = {
        id: randomUUID(),
        numero: this.numero(),
        titre,
        resume: texte(d.resume, 500),
        contenu: texte(d.contenu, 100_000),
        categorie: CATEGORIES_ARTICLES.includes(d.categorie as string) ? (d.categorie as string) : 'Autre',
        ci: d.ci ? texte(d.ci, 80) : null,
        motsCles: Array.isArray(d.motsCles)
          ? d.motsCles
              .filter((m): m is string => typeof m === 'string')
              .map((m) => m.trim().slice(0, 40))
              .filter(Boolean)
              .slice(0, 20)
          : [],
        statut: 'brouillon',
        audience: d.audience === 'tous' ? 'tous' : 'equipe',
        auteur,
        creeLe: maintenant,
        majLe: maintenant,
        publieLe: null,
        versions: [],
        tickets: [],
        vues: 0,
        avis: { utile: 0, inutile: 0 },
      };
      e.articles.unshift(a);
    });
    if (typeof d.ticket === 'string' && d.ticket) this.lierTicket(a.numero, d.ticket, auteur);
    return a;
  }

  modifier(cle: string, d: Record<string, unknown>, auteur: string): Article {
    const a = this.trouver(cle, true);
    this.stockage.modifier(() => {
      const contenuAvant = a.contenu;
      const titreAvant = a.titre;
      if (d.titre !== undefined && texte(d.titre, 200).trim()) a.titre = texte(d.titre, 200).trim();
      if (d.resume !== undefined) a.resume = texte(d.resume, 500);
      if (d.contenu !== undefined) a.contenu = texte(d.contenu, 100_000);
      if (d.categorie !== undefined && CATEGORIES_ARTICLES.includes(d.categorie as string)) a.categorie = d.categorie as string;
      if (d.ci !== undefined) a.ci = d.ci ? texte(d.ci, 80) : null;
      if (d.audience !== undefined) a.audience = (d.audience === 'tous' ? 'tous' : 'equipe') as Audience;
      if (Array.isArray(d.motsCles))
        a.motsCles = d.motsCles
          .filter((m): m is string => typeof m === 'string')
          .map((m) => m.trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 20);
      // Une version est gardée à chaque changement du titre ou du texte.
      if (a.contenu !== contenuAvant || a.titre !== titreAvant) {
        a.versions = [{ t: a.majLe, auteur: a.modifiePar ?? a.auteur, titre: titreAvant, contenu: contenuAvant }, ...a.versions].slice(0, 20);
      }
      a.modifiePar = auteur;
      a.majLe = Date.now();
    });
    return a;
  }

  changerStatut(cle: string, statut: StatutArticle, auteur: string): Article {
    const a = this.trouver(cle, true);
    if (!['brouillon', 'publie', 'retire'].includes(statut)) throw new ErreurMetier('Statut inconnu');
    if (statut === 'publie' && !a.contenu.trim()) throw new ErreurMetier('Un article vide ne se publie pas');
    this.stockage.modifier(() => {
      a.statut = statut;
      if (statut === 'publie') a.publieLe = Date.now();
      a.majLe = Date.now();
    });
    if (statut === 'publie') {
      this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: `${a.numero} publié`, detail: `${a.titre} — par ${auteur}`, statut: 'vert' });
    }
    return a;
  }

  lierTicket(cle: string, numeroTicket: string, auteur: string): Article {
    const a = this.trouver(cle, true);
    const t = this.tickets.trouver(numeroTicket);
    if (!t) throw new ErreurMetier(`Ticket ${numeroTicket} introuvable`);
    if (a.tickets.includes(t.numero)) return a;
    this.stockage.modifier(() => {
      a.tickets.push(t.numero);
      t.activite.push({ t: Date.now(), auteur, type: 'systeme', texte: `Article lié : ${a.numero} (${a.titre})` });
    });
    return a;
  }

  delierTicket(cle: string, numeroTicket: string): Article {
    const a = this.trouver(cle, true);
    this.stockage.modifier(() => {
      a.tickets = a.tickets.filter((n) => n !== numeroTicket);
    });
    return a;
  }

  /** Les articles liés à un ticket (visibles pour ce lecteur). */
  pourTicket(numero: string, interne: boolean): ArticleResume[] {
    return this.liste.filter((a) => a.tickets.includes(numero) && this.visible(a, interne)).map((a) => this.resume(a));
  }

  consulter(cle: string, interne: boolean): Article {
    const a = this.trouver(cle, interne);
    this.stockage.modifier(() => {
      a.vues += 1;
    });
    return a;
  }

  /** Un avis par personne. */
  donnerAvis(cle: string, utile: boolean, interne: boolean, votant: string): Article {
    const a = this.trouver(cle, interne);
    if ((a.votants ?? []).includes(votant)) throw new ErreurMetier('Vous avez déjà donné votre avis sur cet article');
    this.stockage.modifier(() => {
      a.votants = [...(a.votants ?? []), votant];
      if (utile) a.avis.utile += 1;
      else a.avis.inutile += 1;
    });
    return a;
  }
}
