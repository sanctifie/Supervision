import type { PrioriteTicket } from './itsm';

/**
 * Le calendrier de service : les heures pendant lesquelles les délais (SLA)
 * courent. Hors de ces heures (nuit, jour non travaillé, jour férié), le
 * chronomètre s'arrête — sauf pour les priorités « continues » (P1 par
 * défaut), traitées 24 h/24.
 */

export interface CalendrierService {
  fuseau: string;
  /** Jours travaillés : 0 = lundi … 6 = dimanche. */
  jours: number[];
  /** « HH:MM » */
  debut: string;
  fin: string;
  /** « MM-JJ » (chaque année) ou « AAAA-MM-JJ » (une fois). */
  feries: string[];
  /** Priorités dont le SLA court 24 h/24, 7 j/7. */
  prioritesContinues: PrioriteTicket[];
}

export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** Jours fériés fixes du Gabon ; les fêtes mobiles (Pâques, Ascension, Aïd…) s'ajoutent chaque année. */
export const FERIES_GABON = ['01-01', '04-17', '05-01', '08-15', '08-16', '08-17', '11-01', '12-25'];

export function calendrierParDefaut(fuseau: string, ouverture: number, fermeture: number): CalendrierService {
  const hh = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  return { fuseau, jours: [0, 1, 2, 3, 4, 5], debut: hh(ouverture), fin: hh(fermeture), feries: [...FERIES_GABON], prioritesContinues: ['P1'] };
}

const MINUTE = 60_000;
const JOUR = 86_400_000;

interface PartiesLocales {
  annee: number;
  mois: number;
  jour: number;
  heure: number;
  minute: number;
}

const formateurs = new Map<string, Intl.DateTimeFormat>();
function formateur(fuseau: string): Intl.DateTimeFormat {
  let f = formateurs.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: fuseau, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
    formateurs.set(fuseau, f);
  }
  return f;
}

export function partiesLocales(t: number, fuseau: string): PartiesLocales {
  const p = Object.fromEntries(
    formateur(fuseau)
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return { annee: Number(p.year), mois: Number(p.month), jour: Number(p.day), heure: Number(p.hour) % 24, minute: Number(p.minute) };
}

/** L'instant UTC d'une heure locale dans un fuseau (gère les changements d'heure). */
export function instantLocal(annee: number, mois: number, jour: number, minutes: number, fuseau: string): number {
  const voulu = Date.UTC(annee, mois - 1, jour) + minutes * MINUTE;
  let t = voulu;
  for (let i = 0; i < 2; i++) {
    const p = partiesLocales(t, fuseau);
    const lu = Date.UTC(p.annee, p.mois - 1, p.jour) + (p.heure * 60 + p.minute) * MINUTE;
    t += voulu - lu;
  }
  return t;
}

const enMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Les plages ouvrées [début, fin[ (UTC) du jour local contenant `t`, et le début du jour suivant. */
function plageDuJour(t: number, cal: CalendrierService): { plage: [number, number] | null; lendemain: number } {
  const p = partiesLocales(t, cal.fuseau);
  const minuit = instantLocal(p.annee, p.mois, p.jour, 0, cal.fuseau);
  const d = new Date(Date.UTC(p.annee, p.mois - 1, p.jour));
  const suivant = new Date(d.getTime() + JOUR);
  const lendemain = instantLocal(suivant.getUTCFullYear(), suivant.getUTCMonth() + 1, suivant.getUTCDate(), 0, cal.fuseau);
  const jourSemaine = (d.getUTCDay() + 6) % 7;
  const mmjj = `${String(p.mois).padStart(2, '0')}-${String(p.jour).padStart(2, '0')}`;
  const ferie = cal.feries.includes(mmjj) || cal.feries.includes(`${p.annee}-${mmjj}`);
  if (!cal.jours.includes(jourSemaine) || ferie) return { plage: null, lendemain };
  const debut = instantLocal(p.annee, p.mois, p.jour, enMinutes(cal.debut), cal.fuseau);
  const fin = instantLocal(p.annee, p.mois, p.jour, enMinutes(cal.fin), cal.fuseau);
  return { plage: fin > debut ? [debut, fin] : null, lendemain: Math.max(lendemain, minuit + JOUR / 2) };
}

/** `depart` + `duree` d'heures ouvrées. */
export function ajouterHeuresOuvrees(depart: number, duree: number, cal: CalendrierService): number {
  if (duree <= 0) return depart;
  let curseur = depart;
  let reste = duree;
  for (let i = 0; i < 800; i++) {
    const { plage, lendemain } = plageDuJour(curseur, cal);
    if (plage) {
      const debut = Math.max(plage[0], curseur);
      if (debut < plage[1]) {
        const dispo = plage[1] - debut;
        if (reste <= dispo) return debut + reste;
        reste -= dispo;
      }
    }
    curseur = lendemain;
  }
  // Calendrier sans aucun jour ouvré : on retombe sur le temps calendaire.
  return depart + duree;
}

/** Heures ouvrées entre deux instants. */
export function heuresOuvreesEntre(a: number, b: number, cal: CalendrierService): number {
  if (b <= a) return 0;
  let total = 0;
  let curseur = a;
  for (let i = 0; i < 800 && curseur < b; i++) {
    const { plage, lendemain } = plageDuJour(curseur, cal);
    if (plage) total += Math.max(0, Math.min(plage[1], b) - Math.max(plage[0], curseur));
    curseur = lendemain;
  }
  return total;
}

/** Le calendrier à appliquer pour une priorité (null = 24 h/24). */
export function calendrierPour(p: PrioriteTicket, cal: CalendrierService | null): CalendrierService | null {
  if (!cal || cal.prioritesContinues.includes(p) || !cal.jours.length) return null;
  return cal;
}

export function ajouter(depart: number, duree: number, cal: CalendrierService | null): number {
  return cal ? ajouterHeuresOuvrees(depart, duree, cal) : depart + duree;
}

export function entre(a: number, b: number, cal: CalendrierService | null): number {
  return cal ? heuresOuvreesEntre(a, b, cal) : Math.max(0, b - a);
}
