import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Inbox, OctagonAlert } from 'lucide-react';
import { LIBELLE_STATUT } from '../../../shared/seuils';
import { duree, millisecondes, nombre, octets, pourcent } from '../../../shared/format';
import type { Mesure, Statut } from '../../../shared/types';

export function Point({ statut }: { statut: Statut }) {
  return <span className={`point ${statut}`} aria-label={LIBELLE_STATUT[statut]} />;
}

export function Pastille({ statut, children }: { statut: Statut | 'bleu' | 'violet'; children?: ReactNode }) {
  const s = statut as Statut;
  return (
    <span className={`pastille ${statut}`}>
      {statut !== 'bleu' && statut !== 'violet' && <Point statut={s} />}
      {children ?? LIBELLE_STATUT[s]}
    </span>
  );
}

export function IconeStatut({ statut, taille = 20 }: { statut: Statut; taille?: number }) {
  if (statut === 'vert') return <CheckCircle2 size={taille} />;
  if (statut === 'orange') return <AlertTriangle size={taille} />;
  if (statut === 'rouge') return <OctagonAlert size={taille} />;
  return <CircleHelp size={taille} />;
}

export function Carte({
  titre,
  sousTitre,
  droite,
  children,
  serree,
  className = '',
}: {
  titre?: ReactNode;
  sousTitre?: ReactNode;
  droite?: ReactNode;
  children: ReactNode;
  serree?: boolean;
  className?: string;
}) {
  return (
    <section className={`carte ${serree ? 'serree' : ''} ${className}`}>
      {(titre || droite) && (
        <div className="carte-tete">
          <div>
            {titre && <h3>{titre}</h3>}
            {sousTitre && <p>{sousTitre}</p>}
          </div>
          {droite && <div className="droite">{droite}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Valeur d'une mesure, selon son unité. */
export function valeurMesure(m: Pick<Mesure, 'valeur' | 'unite'>): string {
  const v = m.valeur;
  if (v === null) return '—';
  switch (m.unite) {
    case '%':
      return pourcent(v, v < 10 ? 1 : 0);
    case 'ms':
      return millisecondes(v);
    case 'o':
      return octets(v);
    case 'o/s':
      return `${octets(v)}/s`;
    case 's':
      return v < 60 ? `${nombre(v * 1000, v < 0.01 ? 1 : 0)} ms` : duree(v);
    case 'h':
      return duree(v * 3600);
    case 'j':
      return `${nombre(v, 0)} j`;
    case 'bool':
      return v ? 'Oui' : 'Non';
    case '':
      return nombre(v, v < 10 && !Number.isInteger(v) ? 2 : 0);
    default:
      return `${nombre(v, v < 10 && !Number.isInteger(v) ? 2 : 0)} ${m.unite}`;
  }
}

export function CarteMesure({ m }: { m: Mesure }) {
  let valeur = valeurMesure(m);
  if (m.cle === 'ntp') valeur = m.valeur === null ? '—' : m.valeur ? 'Oui' : 'Non';
  if (m.cle === 'pg-up') valeur = m.valeur === null ? '—' : m.valeur ? 'En marche' : 'Arrêté';
  return (
    <div className={`mesure ${m.statut}`}>
      <div className="mesure-tete">
        <span>{m.libelle}</span>
        <Point statut={m.statut} />
      </div>
      <div className="mesure-valeur">{valeur}</div>
      {m.detail && <div className="mesure-detail">{m.detail}</div>}
      {(m.seuilWarning || m.seuilCritique) && (
        <div className="mesure-seuils">
          {m.seuilWarning && <span>⚠ {m.seuilWarning}</span>}
          {m.seuilCritique && <span>⛔ {m.seuilCritique}</span>}
        </div>
      )}
    </div>
  );
}

export function GrilleMesures({ mesures }: { mesures: Mesure[] }) {
  return (
    <div className="mesures">
      {mesures.map((m) => (
        <CarteMesure key={m.cle} m={m} />
      ))}
    </div>
  );
}

export function BarreProgres({ valeur, statut }: { valeur: number | null; statut?: Statut }) {
  const v = Math.max(0, Math.min(100, valeur ?? 0));
  return (
    <div className={`barre-progres ${statut ?? ''}`}>
      <div style={{ width: `${v}%` }} />
    </div>
  );
}

/** Jauge circulaire (SVG). */
export function Jauge({ valeur, statut, libelle, taille = 132, texte }: { valeur: number | null; statut: Statut; libelle: string; taille?: number; texte?: string }) {
  const r = taille / 2 - 10;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, valeur ?? 0));
  const couleurs: Record<Statut, string> = { vert: '#16a34a', orange: '#e5860a', rouge: '#dc2626', inconnu: '#94a3b8' };
  return (
    <div className="jauge" style={{ width: taille, height: taille }}>
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`}>
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="#edf1f9" strokeWidth="10" />
        <circle
          cx={taille / 2}
          cy={taille / 2}
          r={r}
          fill="none"
          stroke={couleurs[statut]}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(c * v) / 100} ${c}`}
          transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
          style={{ transition: 'stroke-dasharray .6s' }}
        />
      </svg>
      <div className="jauge-texte">
        <strong>{texte ?? (valeur === null ? '—' : pourcent(valeur, 0))}</strong>
        <span>{libelle}</span>
      </div>
    </div>
  );
}

export function Vide({ icone, children }: { icone?: ReactNode; children: ReactNode }) {
  return (
    <div className="vide">
      {icone ?? <Inbox size={28} />}
      <div>{children}</div>
    </div>
  );
}

export function Erreur({ message }: { message: string }) {
  return <div className="erreur">Lecture impossible : {message}</div>;
}

export function Squelette({ hauteur = 120 }: { hauteur?: number }) {
  return <div className="squelette" style={{ height: hauteur }} />;
}

/** Affiche le chargement, l'erreur, ou le contenu. */
export function Charge<T>({ etat, children, hauteur }: { etat: { donnees: T | null; erreur: string | null }; children: (d: T) => ReactNode; hauteur?: number }) {
  if (etat.donnees) return <>{children(etat.donnees)}</>;
  if (etat.erreur) return <Erreur message={etat.erreur} />;
  return (
    <div className="empile">
      <Squelette hauteur={hauteur ?? 140} />
      <Squelette hauteur={hauteur ?? 260} />
    </div>
  );
}

export function Modale({ titre, children, fermer, large }: { titre: string; children: ReactNode; fermer: () => void; large?: boolean }) {
  return (
    <div className="modale-fond" onMouseDown={(e) => e.target === e.currentTarget && fermer()} role="dialog" aria-modal="true" aria-label={titre}>
      <div className={`modale ${large ? 'large' : ''}`}>
        <h3>{titre}</h3>
        {children}
      </div>
    </div>
  );
}
