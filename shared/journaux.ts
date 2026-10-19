/**
 * Analyse des journaux (inspirée de Kibana Discover et de l'explorateur de logs) :
 * histogramme par niveau, catégories de messages, export CSV, recherches enregistrées.
 */
import type { PrioriteTicket } from './itsm';
import type { LigneJournal } from './types';

type Niveau = LigneJournal['niveau'];
const ORDRE: Record<Niveau, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface SeauJournal {
  t: number;
  debug: number;
  info: number;
  warn: number;
  error: number;
}

export interface CategorieJournal {
  /** Le message type, chiffres et identifiants remplacés (« POST /v1/sales # — # ms »). */
  motif: string;
  /** Un texte à chercher pour retrouver ces lignes (le plus long passage fixe du motif). */
  recherche: string;
  niveau: Niveau;
  nombre: number;
  premier: number;
  dernier: number;
  services: string[];
  exemple: string;
  /** Jamais vu avant le dernier quart de la période. */
  nouveau: boolean;
}

export interface AnalyseJournaux {
  lignes: number;
  /** La limite de lecture est atteinte : l'analyse ne couvre que les lignes les plus récentes. */
  tronque: boolean;
  debut: number;
  fin: number;
  seaux: SeauJournal[];
  categories: CategorieJournal[];
  services: { service: string; nombre: number; erreurs: number }[];
}

export interface RechercheJournaux {
  id: string;
  nom: string;
  service: string;
  niveau: string;
  texte: string;
  minutes: number;
  par: string;
  le: number;
}

/** Une recherche de journaux surveillée : trop de lignes dans la fenêtre → un incident s'ouvre. */
export interface RegleJournal {
  id: string;
  nom: string;
  service: string;
  niveau: string;
  texte: string;
  /** Fenêtre glissante, en minutes. */
  minutes: number;
  /** Nombre de lignes à partir duquel la règle se déclenche. */
  seuil: number;
  priorite: PrioriteTicket;
  actif: boolean;
  par: string;
  le: number;
  etat: 'ok' | 'declenchee';
  dernierDeclenchement: number | null;
  /** Lignes vues à la dernière évaluation (plafonné au seuil). */
  dernierComptage: number | null;
  /** Dernier incident ouvert par la règle. */
  ticket: string | null;
  /** Dernière erreur de lecture (journaux injoignables…). */
  erreur: string | null;
}

/** Remplace ce qui change d'une ligne à l'autre pour que les lignes semblables se regroupent. */
export function motifDe(message: string): string {
  let texte = message;
  if (texte.trimStart().startsWith('{')) {
    try {
      const j = JSON.parse(texte) as Record<string, unknown>;
      const msg = j.msg ?? j.message;
      if (typeof msg === 'string') texte = msg;
    } catch {
      /* pas du JSON : on garde la ligne */
    }
  }
  return texte
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '<ip>')
    .replace(/\b[0-9a-f]{12,}\b/gi, '<hex>')
    .replace(/\d+(?:[.,]\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/** Le passage sans variable qui a le plus de lettres : de quoi retrouver les lignes d'une catégorie. */
function rechercheDe(motif: string): string {
  const passages = motif.split(/<id>|<ip>|<hex>|#/).map((p) => p.trim());
  const lettres = (t: string) => (t.match(/\p{L}/gu) ?? []).length;
  return passages.reduce((a, b) => (lettres(b) > lettres(a) ? b : a), '').slice(0, 60);
}

/** Lignes semblables regroupées, les plus fréquentes d'abord. */
export function categoriser(lignes: LigneJournal[], debut: number, fin: number, max = 15): CategorieJournal[] {
  const groupes = new Map<string, CategorieJournal>();
  for (const l of lignes) {
    const motif = motifDe(l.message);
    const cle = `${l.niveau}|${motif}`;
    const g = groupes.get(cle);
    if (g) {
      g.nombre++;
      g.premier = Math.min(g.premier, l.t);
      g.dernier = Math.max(g.dernier, l.t);
      if (!g.services.includes(l.service)) g.services.push(l.service);
    } else {
      groupes.set(cle, {
        motif,
        recherche: rechercheDe(motif),
        niveau: l.niveau,
        nombre: 1,
        premier: l.t,
        dernier: l.t,
        services: [l.service],
        exemple: l.message.slice(0, 300),
        nouveau: false,
      });
    }
  }
  const seuilNouveau = fin - (fin - debut) / 4;
  return [...groupes.values()]
    .map((g) => ({ ...g, services: g.services.sort(), nouveau: g.premier >= seuilNouveau }))
    .sort((a, b) => ORDRE[b.niveau] - ORDRE[a.niveau] || b.nombre - a.nombre)
    .slice(0, max);
}

/** Nombre de lignes par niveau dans `n` tranches de temps égales. */
export function histogramme(lignes: LigneJournal[], debut: number, fin: number, n = 40): SeauJournal[] {
  const pas = Math.max(1, (fin - debut) / n);
  const seaux: SeauJournal[] = Array.from({ length: n }, (_, i) => ({ t: Math.round(debut + i * pas), debug: 0, info: 0, warn: 0, error: 0 }));
  for (const l of lignes) {
    const i = Math.floor((l.t - debut) / pas);
    if (i >= 0 && i < n) seaux[i][l.niveau]++;
  }
  return seaux;
}

/** CSV lisible par un tableur ; une cellule qui commencerait par = + - @ est neutralisée (injection de formule). */
export function versCsv(lignes: LigneJournal[]): string {
  const cellule = (v: string) => {
    const sure = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${sure.replace(/"/g, '""')}"`;
  };
  const corps = lignes.map((l) => [new Date(l.t).toISOString(), l.service, l.niveau, l.message].map(cellule).join(','));
  return ['horodatage,service,niveau,message', ...corps].join('\r\n');
}

/** Tout ce que l'écran d'analyse affiche, calculé sur les lignes lues (de la plus récente à la plus ancienne). */
export function analyser(lignes: LigneJournal[], debut: number, fin: number, limite: number): AnalyseJournaux {
  const tronque = lignes.length >= limite;
  // Si la lecture s'arrête avant le début de la période, l'histogramme part de la plus ancienne ligne lue.
  const debutReel = tronque && lignes.length ? Math.max(debut, Math.min(...lignes.map((l) => l.t))) : debut;
  const parService = new Map<string, { service: string; nombre: number; erreurs: number }>();
  for (const l of lignes) {
    const s = parService.get(l.service) ?? { service: l.service, nombre: 0, erreurs: 0 };
    s.nombre++;
    if (l.niveau === 'error') s.erreurs++;
    parService.set(l.service, s);
  }
  return {
    lignes: lignes.length,
    tronque,
    debut: debutReel,
    fin,
    seaux: histogramme(lignes, debutReel, fin),
    categories: categoriser(lignes, debutReel, fin),
    services: [...parService.values()].sort((a, b) => b.erreurs - a.erreurs || b.nombre - a.nombre),
  };
}
