import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Box, CircleArrowUp, CircleCheck, CircleHelp, Circle, Ghost, Heart, HeartCrack, RefreshCw, X } from 'lucide-react';
import type { EtatSynchro, SanteDeploiement, VueDeploiement } from '../../../../shared/deploiements';

/** Les trois états de synchronisation d'Argo CD ; nos quatre états s'y ramènent. */
export type Synchro3 = 'synchronise' | 'desynchronise' | 'inconnu';
export const synchro3 = (s: EtatSynchro): Synchro3 => (s === 'synchronise' ? 'synchronise' : s === 'non-suivi' ? 'inconnu' : 'desynchronise');
export const LIBELLE_SYNCHRO3: Record<Synchro3, string> = { synchronise: 'Synchronisé', desynchronise: 'Désynchronisé', inconnu: 'Inconnu' };

export const SANTES: SanteDeploiement[] = ['en-cours', 'sain', 'degrade', 'absent', 'inconnu'];
export const LIBELLE_SANTE: Record<SanteDeploiement, string> = { 'en-cours': 'En cours', sain: 'Sain', degrade: 'Dégradé', absent: 'Absent', inconnu: 'Inconnu' };
export const COULEUR_SANTE: Record<SanteDeploiement, string> = {
  'en-cours': 'var(--a-bleu)',
  sain: 'var(--a-vert)',
  degrade: 'var(--a-rouge)',
  absent: 'var(--a-jaune)',
  inconnu: 'var(--a-gris)',
};

export function IconeSante({ s, taille = 16 }: { s: SanteDeploiement; taille?: number }) {
  const c = COULEUR_SANTE[s];
  if (s === 'sain') return <Heart size={taille} color={c} fill={c} aria-label={LIBELLE_SANTE[s]} />;
  if (s === 'degrade') return <HeartCrack size={taille} color={c} fill={c} aria-label={LIBELLE_SANTE[s]} />;
  if (s === 'absent') return <Ghost size={taille} color={c} fill={c} aria-label={LIBELLE_SANTE[s]} />;
  if (s === 'en-cours') return <RefreshCw size={taille} color={c} aria-label={LIBELLE_SANTE[s]} />;
  return <CircleHelp size={taille} color="#6d7f8b" aria-label={LIBELLE_SANTE[s]} />;
}

export function IconeSynchro({ s, taille = 16 }: { s: Synchro3; taille?: number }) {
  if (s === 'synchronise') return <CircleCheck size={taille} color="var(--a-vert)" aria-label={LIBELLE_SYNCHRO3[s]} />;
  if (s === 'desynchronise') return <CircleArrowUp size={taille} color="var(--a-jaune)" aria-label={LIBELLE_SYNCHRO3[s]} />;
  return <Circle size={taille} color="#6d7f8b" aria-label={LIBELLE_SYNCHRO3[s]} />;
}

/** Couleur du bord d'une tuile : la santé. */
export const bordSante = (s: SanteDeploiement) => ({ borderLeftColor: COULEUR_SANTE[s] });

/** Durée lisible : « 3 h 05 », « 12 j ». */
export function duree(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} j`;
}

/** La coquille d'Argo CD : barre latérale sombre (navigation + filtres), en-tête blanc, contenu sur fond bleu-gris. */
export function CoquilleArgo({ fil, titre, filtres, children }: { fil: ReactNode; titre: string; filtres?: ReactNode; children: ReactNode }) {
  return (
    <div className="argo">
      <aside className="argo-barre">
        <div className="argo-marque">
          <img src="/logo.svg" alt="" />
          <div>
            Déploiements
            <small>Supervision</small>
          </div>
        </div>
        <nav className="argo-nav">
          <Link to="/deploiements" className="actif">
            <Box size={22} /> Applications
          </Link>
          <Link to="/">
            <ArrowLeft size={22} /> Supervision
          </Link>
        </nav>
        {filtres}
      </aside>
      <div className="argo-coin">
        <header className="argo-entete">
          <div className="fil">{fil}</div>
          <div className="titre">{titre}</div>
        </header>
        <div className="argo-contenu">{children}</div>
      </div>
    </div>
  );
}

/** Panneau qui glisse depuis la droite (historique, diff, détails…). */
export function Panneau({ fermer, children }: { fermer: () => void; children: ReactNode }) {
  return (
    <>
      <div className="argo-panneau-voile" onClick={fermer} />
      <aside className="argo-panneau" role="dialog" aria-modal="true">
        <button className="fermer" onClick={fermer} aria-label="Fermer">
          <X size={20} />
        </button>
        {children}
      </aside>
    </>
  );
}

/** Le dépôt d'une image, sans sa version : « officina/sales:1.8.3 » → « officina/sales ». */
export const depotDe = (image: string | null) => (image ? image.replace(/(@[^/]*|:[^/:]*)$/, '') : '—');

/** « Synchroniser » chez Argo CD : ici, planifier un changement de déploiement pour ce service. */
export const lienPlanifier = (l: Pick<VueDeploiement, 'ci' | 'prevue'>) =>
  `/tickets/nouveau?${new URLSearchParams({ type: 'changement', ci: l.ci, titre: `Déploiement de ${l.ci}`, ...(l.prevue ? { versionCible: l.prevue } : {}) })}`;
