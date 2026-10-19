import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Pause, Play, Trash2 } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { useSupervision } from '../components/Coquille';
import { Carte, Modale, Pastille } from '../components/ui';
import { PastillePriorite } from '../components/itsm';
import { depuis } from '../../../shared/format';
import type { PrioriteTicket } from '../../../shared/itsm';
import type { RegleJournal } from '../../../shared/journaux';

export interface FiltreRegle {
  service: string;
  niveau: string;
  texte: string;
  minutes: number;
}

const FENETRES: [number, string][] = [
  [5, '5 minutes'],
  [15, '15 minutes'],
  [60, '1 heure'],
  [360, '6 heures'],
  [1440, '24 heures'],
];
const AIDE_PRIORITE: Record<PrioriteTicket, string> = {
  P1: 'P1 — tout est bloqué : prévient toute l’équipe',
  P2: 'P2 — grave : prévient toute l’équipe',
  P3: 'P3 — gênant, à traiter dans la journée',
  P4: 'P4 — à regarder quand on peut',
};
const decrire = (f: FiltreRegle) =>
  [f.service && `service ${f.service}`, f.niveau && `niveau ${f.niveau}`, f.texte && `« ${f.texte} »`].filter(Boolean).join(' · ') || 'aucun filtre';

/** Bouton « Alerter sur cette recherche » : transforme les filtres de la page en règle. */
export function BoutonRegle({ filtre, apres }: { filtre: FiltreRegle; apres: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState('');
  const [minutes, setMinutes] = useState(filtre.minutes);
  const [seuil, setSeuil] = useState(10);
  const [priorite, setPriorite] = useState<PrioriteTicket>('P3');
  const [erreur, setErreur] = useState<string | null>(null);
  const { peut } = useSupervision();
  if (!peut('agir')) return null;

  const creer = async () => {
    setErreur(null);
    try {
      await appeler('/journaux/regles', { methode: 'POST', corps: { ...filtre, nom, minutes, seuil, priorite } });
      setOuvert(false);
      apres();
    } catch (e) {
      setErreur((e as Error).message);
    }
  };

  return (
    <>
      <button
        type="button"
        className="bouton petit"
        onClick={() => {
          setMinutes(filtre.minutes);
          setOuvert(true);
        }}
      >
        <BellRing size={12} /> Alerter sur cette recherche
      </button>
      {ouvert && (
        <Modale titre="Nouvelle règle sur les journaux" fermer={() => setOuvert(false)}>
          <p className="discret" style={{ marginTop: 0 }}>
            Recherche surveillée : <strong>{decrire(filtre)}</strong>. Quand elle ramène assez de lignes, un incident s’ouvre tout seul.
          </p>
          <div className="champ-groupe">
            <label className="etiquette">Nom</label>
            <input className="champ" autoFocus placeholder="Erreurs de notify" value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div className="grille g2" style={{ gap: 12 }}>
            <div className="champ-groupe">
              <label className="etiquette">Au moins (lignes)</label>
              <input className="champ" type="number" min={1} max={1000} value={seuil} onChange={(e) => setSeuil(Number(e.target.value))} />
            </div>
            <div className="champ-groupe">
              <label className="etiquette">Pendant</label>
              <select className="champ" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {FENETRES.map(([m, l]) => (
                  <option key={m} value={m}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Priorité de l’incident</label>
            <select className="champ" value={priorite} onChange={(e) => setPriorite(e.target.value as PrioriteTicket)}>
              {(Object.keys(AIDE_PRIORITE) as PrioriteTicket[]).map((p) => (
                <option key={p} value={p}>
                  {AIDE_PRIORITE[p]}
                </option>
              ))}
            </select>
          </div>
          {erreur && <div className="erreur">{erreur}</div>}
          <div className="ligne-flex" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="bouton" onClick={() => setOuvert(false)}>
              Annuler
            </button>
            <button className="bouton primaire" onClick={creer}>
              Créer la règle
            </button>
          </div>
        </Modale>
      )}
    </>
  );
}

/** Les règles en place : état, dernier comptage, incident ouvert, pause et suppression. */
export function CarteRegles({ regles, recharger }: { regles: RegleJournal[]; recharger: () => Promise<void> }) {
  const { peut } = useSupervision();
  const agent = peut('agir');
  const [erreur, setErreur] = useState<string | null>(null);
  const agir = async (chemin: string, methode: string, corps?: unknown) => {
    setErreur(null);
    try {
      await appeler(chemin, { methode, corps });
      await recharger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  };
  if (!regles.length) return null;
  return (
    <Carte serree titre={`Règles sur les journaux (${regles.length})`} sousTitre="Évaluées toutes les 30 secondes ; un seul incident ouvert à la fois par règle">
      {erreur && (
        <div className="erreur" style={{ margin: '0 20px 12px' }}>
          {erreur}
        </div>
      )}
      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th>Règle</th>
              <th>Recherche</th>
              <th>Seuil</th>
              <th>Priorité</th>
              <th>État</th>
              <th>Incident</th>
              {agent && <th />}
            </tr>
          </thead>
          <tbody>
            {regles.map((r) => (
              <tr key={r.id} style={r.actif ? undefined : { opacity: 0.55 }}>
                <td>
                  <strong style={{ color: 'var(--encre)', fontWeight: 600 }}>{r.nom}</strong>
                  <div className="discret">par {r.par}</div>
                </td>
                <td className="discret">{decrire(r)}</td>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                  ≥ {r.seuil} / {r.minutes >= 60 ? `${r.minutes / 60} h` : `${r.minutes} min`}
                </td>
                <td>
                  <PastillePriorite p={r.priorite} />
                </td>
                <td>
                  {!r.actif ? (
                    <Pastille statut="inconnu">en pause</Pastille>
                  ) : r.erreur ? (
                    <span title={r.erreur}>
                      <Pastille statut="orange">lecture impossible</Pastille>
                    </span>
                  ) : r.etat === 'declenchee' ? (
                    <Pastille statut="rouge">déclenchée</Pastille>
                  ) : (
                    <Pastille statut="vert">calme</Pastille>
                  )}
                  {r.actif && r.dernierComptage !== null && (
                    <div className="discret">
                      {r.dernierComptage} / {r.seuil} ligne(s)
                    </div>
                  )}
                </td>
                <td>
                  {r.ticket ? (
                    <>
                      <Link to={`/tickets/${r.ticket}`} className="mono">
                        {r.ticket}
                      </Link>
                      {r.dernierDeclenchement && <div className="discret">{depuis(r.dernierDeclenchement)}</div>}
                    </>
                  ) : (
                    <span className="discret">—</span>
                  )}
                </td>
                {agent && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="bouton petit"
                      title={r.actif ? 'Mettre en pause' : 'Réactiver'}
                      aria-label={r.actif ? 'Mettre en pause' : 'Réactiver'}
                      onClick={() => agir(`/journaux/regles/${r.id}`, 'PATCH', { actif: !r.actif })}
                    >
                      {r.actif ? <Pause size={12} /> : <Play size={12} />}
                    </button>{' '}
                    <button className="bouton petit" title="Supprimer" aria-label={`Supprimer la règle ${r.nom}`} onClick={() => agir(`/journaux/regles/${r.id}`, 'DELETE')}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Carte>
  );
}

export function useRegles() {
  return useDonnees<RegleJournal[]>('/journaux/regles', 30_000);
}
