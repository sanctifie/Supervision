import { Link } from 'react-router-dom';
import { Check, ClipboardList, GitPullRequest, Siren, Timer, Wrench } from 'lucide-react';
import { duree, dateHeure } from '../../../shared/format';
import { STATUTS, libelleStatut, type EtatSla, type PrioriteTicket, type TicketResume, type TypeTicket } from '../../../shared/itsm';
import { useDonnees } from '../lib/useDonnees';
import { Pastille } from './ui';
import type { Statut } from '../../../shared/types';

/** Petits éléments visuels communs aux pages ITSM. */

export const CHEMIN_TYPE: Record<TypeTicket, string> = { incident: '/incidents', probleme: '/problemes', changement: '/changements', demande: '/demandes' };

export function IconeType({ type, taille = 16 }: { type: TypeTicket; taille?: number }) {
  if (type === 'incident') return <Siren size={taille} />;
  if (type === 'probleme') return <Wrench size={taille} />;
  if (type === 'changement') return <GitPullRequest size={taille} />;
  return <ClipboardList size={taille} />;
}

const STATUT_PRIORITE: Record<PrioriteTicket, Statut | 'bleu'> = { P1: 'rouge', P2: 'orange', P3: 'bleu', P4: 'inconnu' };

export function PastillePriorite({ p }: { p: PrioriteTicket }) {
  return <Pastille statut={STATUT_PRIORITE[p]}>{p}</Pastille>;
}

export function PastilleStatut({ type, statut }: { type: TypeTicket; statut: string }) {
  const etape = STATUTS[type].find((s) => s.cle === statut);
  const couleur: Statut | 'bleu' | 'violet' =
    statut === 'rejete' || statut === 'annule' ? 'inconnu' : etape?.final ? 'vert' : statut === 'en-attente' ? 'violet' : statut === STATUTS[type][0].cle ? 'bleu' : 'orange';
  return <Pastille statut={couleur}>{libelleStatut(type, statut)}</Pastille>;
}

export function texteEcheance(echeance: number | null, maintenant = Date.now()): string {
  if (!echeance) return '—';
  const reste = (echeance - maintenant) / 1000;
  return reste >= 0 ? `reste ${duree(reste)}` : `dépassé de ${duree(-reste)}`;
}

export function BadgeSla({ etat, echeance }: { etat: EtatSla; echeance: number | null }) {
  if (etat === 'non-applicable') return <span className="discret">—</span>;
  const couleur: Statut = etat === 'depasse' ? 'rouge' : etat === 'a-risque' ? 'orange' : 'vert';
  return (
    <span className={`pastille ${couleur}`} title={echeance ? `Échéance : ${dateHeure(echeance)}` : undefined}>
      {etat === 'tenu' ? <Check size={11} /> : <Timer size={11} />}
      {etat === 'tenu' ? 'SLA tenu' : etat === 'depasse' && !echeance ? 'SLA dépassé' : texteEcheance(echeance)}
    </span>
  );
}

/** La barre d'étapes du cycle de vie (comme le « process flow » de ServiceNow). */
export function BarreEtapes({ type, statut }: { type: TypeTicket; statut: string }) {
  const etapes = STATUTS[type].filter((s) => !s.horsParcours);
  const horsParcours = STATUTS[type].find((s) => s.cle === statut)?.horsParcours;
  const index = etapes.findIndex((s) => s.cle === statut);
  return (
    <div className="barre-etapes">
      {etapes.map((e, i) => (
        <div key={e.cle} className={`barre-etape ${horsParcours ? '' : i < index ? 'passee' : i === index ? 'courante' : ''}`}>
          {e.libelle}
        </div>
      ))}
      {horsParcours && <div className="barre-etape hors">{libelleStatut(type, statut)}</div>}
    </div>
  );
}

export function LienTicket({ t }: { t: Pick<TicketResume, 'numero' | 'type'> }) {
  return (
    <Link to={`/tickets/${t.numero}`} className="mono lien-ticket">
      <IconeType type={t.type} taille={13} /> {t.numero}
    </Link>
  );
}

export interface Referentiels {
  elementsConfiguration: string[];
  equipe: { membres: string[]; groupes: string[] };
}

export function useReferentiels(): Referentiels {
  const { donnees } = useDonnees<Referentiels>('/itsm/referentiels', 60_000);
  return donnees ?? { elementsConfiguration: [], equipe: { membres: [], groupes: [] } };
}

/** Pour les champs <input type="datetime-local"> (heure locale du navigateur). */
export function versChampDate(t: number | null | undefined): string {
  if (!t) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function depuisChampDate(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}
