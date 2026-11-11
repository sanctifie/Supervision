import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Radar, RefreshCw, Trash2 } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, Modale, Pages, Pastille, Vide } from '../components/ui';
import { Etincelle } from '../components/graphiques';
import { useSupervision } from '../components/Coquille';
import { depuis, pourcent } from '../../../shared/format';
import { ECHECS_AVANT_PANNE, INTERVALLES_MIN, type Sonde } from '../../../shared/sondes';

const LIBELLE = { vert: 'Répond', orange: 'Instable', rouge: 'En panne', inconnu: 'Pas encore contrôlée' };

function Formulaire({ sonde, fermer, fait }: { sonde: Sonde | null; fermer: () => void; fait: () => void }) {
  const [d, setD] = useState({
    nom: sonde?.nom ?? '',
    type: sonde?.type ?? 'http',
    cible: sonde?.cible ?? '',
    codeAttendu: sonde?.codeAttendu || '',
    intervalleMin: sonde?.intervalleMin ?? 5,
    incident: sonde?.incident ?? false,
    actif: sonde?.actif ?? true,
  });
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <Modale titre={sonde ? `Modifier « ${sonde.nom} »` : 'Nouvelle sonde'} fermer={fermer} large>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await appeler(sonde ? `/sondes/${sonde.id}` : '/sondes', { methode: sonde ? 'PUT' : 'POST', corps: d });
            fait();
          } catch (x) {
            setErreur((x as Error).message);
          }
        }}
      >
        <div className="grille g2">
          <div className="champ-groupe">
            <label htmlFor="son-nom">Nom</label>
            <input id="son-nom" className="champ" required value={d.nom} onChange={(e) => setD({ ...d, nom: e.target.value })} />
          </div>
          <div className="champ-groupe">
            <label htmlFor="son-type">Contrôle</label>
            <select id="son-type" className="champ" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as Sonde['type'] })}>
              <option value="http">Adresse web (HTTP/HTTPS)</option>
              <option value="tcp">Port ouvert (TCP)</option>
            </select>
          </div>
        </div>
        <div className="champ-groupe">
          <label htmlFor="son-cible">{d.type === 'http' ? 'Adresse' : 'Hôte et port'}</label>
          <input
            id="son-cible"
            className="champ mono"
            required
            placeholder={d.type === 'http' ? 'https://officina.exemple.fr/health' : 'postgres:5432'}
            value={d.cible}
            onChange={(e) => setD({ ...d, cible: e.target.value })}
          />
        </div>
        <div className="grille g2">
          <div className="champ-groupe">
            <label htmlFor="son-intervalle">Fréquence</label>
            <select id="son-intervalle" className="champ" value={d.intervalleMin} onChange={(e) => setD({ ...d, intervalleMin: Number(e.target.value) })}>
              {INTERVALLES_MIN.map((m) => (
                <option key={m} value={m}>
                  {m === 60 ? 'Toutes les heures' : m === 1 ? 'Toutes les minutes' : `Toutes les ${m} minutes`}
                </option>
              ))}
            </select>
          </div>
          {d.type === 'http' && (
            <div className="champ-groupe">
              <label htmlFor="son-code">Code attendu (vide : tout code sous 400)</label>
              <input
                id="son-code"
                className="champ"
                type="number"
                min={100}
                max={599}
                placeholder="200"
                value={d.codeAttendu}
                onChange={(e) => setD({ ...d, codeAttendu: e.target.value })}
              />
            </div>
          )}
        </div>
        <label className="ligne-flex" style={{ marginTop: 12, gap: 8, fontSize: '0.86rem' }}>
          <input type="checkbox" checked={d.incident} onChange={(e) => setD({ ...d, incident: e.target.checked })} /> Ouvrir un incident après {ECHECS_AVANT_PANNE} échecs de suite
        </label>
        <label className="ligne-flex" style={{ marginTop: 12, gap: 8, fontSize: '0.86rem' }}>
          <input type="checkbox" checked={d.actif} onChange={(e) => setD({ ...d, actif: e.target.checked })} /> Sonde active
        </label>
        {erreur && (
          <div className="erreur" style={{ marginTop: 12 }}>
            {erreur}
          </div>
        )}
        <div className="ligne-flex" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="bouton" onClick={fermer}>
            Annuler
          </button>
          <button className="bouton primaire" type="submit">
            Enregistrer
          </button>
        </div>
      </form>
    </Modale>
  );
}

/** Les sondes configurées : état, latence, disponibilité sur les derniers contrôles. */
export default function Sondes() {
  const etat = useDonnees<Sonde[]>('/sondes', 15_000);
  const { peut } = useSupervision();
  const admin = peut('administrer');
  const [formulaire, setFormulaire] = useState<Sonde | 'nouvelle' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const faire = async (f: () => Promise<unknown>) => {
    try {
      await f();
      setErreur(null);
    } catch (e) {
      setErreur((e as Error).message);
    }
    await etat.recharger();
  };

  return (
    <Charge etat={etat}>
      {(liste) => {
        const pannes = liste.filter((s) => s.actif && s.statut === 'rouge').length;
        return (
          <div className="empile">
            {erreur && (
              <div className="erreur" role="alert">
                {erreur}
              </div>
            )}
            <Carte
              serree
              titre={`Sondes (${liste.length})`}
              sousTitre={pannes ? `${pannes} en panne` : 'La supervision contrôle elle-même ces adresses et ces ports'}
              droite={
                admin && (
                  <button className="bouton primaire petit" onClick={() => setFormulaire('nouvelle')}>
                    <Plus size={13} /> Nouvelle sonde
                  </button>
                )
              }
            >
              {liste.length ? (
                <Pages liste={liste} parPage={10}>
                  {(visibles) => (
                    <div className="tableau-conteneur">
                      <table className="tableau">
                        <thead>
                          <tr>
                            <th>Sonde</th>
                            <th>État</th>
                            <th className="num">Dernière réponse</th>
                            <th className="num">Disponibilité</th>
                            <th>Temps de réponse</th>
                            <th>Contrôlée</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {visibles.map((s) => {
                            const dernier = s.historique.at(-1);
                            return (
                              <tr key={s.id} style={{ opacity: s.actif ? 1 : 0.5 }}>
                                <td>
                                  <strong style={{ color: 'var(--encre)' }}>{s.nom}</strong>
                                  <div className="discret mono">{s.cible}</div>
                                </td>
                                <td>
                                  <Pastille statut={s.statut}>{s.actif ? LIBELLE[s.statut] : 'En pause'}</Pastille>
                                  {s.ticket && (
                                    <div>
                                      <Link to={`/tickets/${s.ticket}`} className="mono lien-ticket">
                                        {s.ticket}
                                      </Link>
                                    </div>
                                  )}
                                </td>
                                <td className="num">{dernier ? `${dernier.detail} · ${dernier.dureeMs} ms` : '—'}</td>
                                <td className="num" title={`Sur les ${s.historique.length} derniers contrôles`}>
                                  {s.historique.length ? pourcent((100 * s.historique.filter((c) => c.ok).length) / s.historique.length, 1) : '—'}
                                </td>
                                <td style={{ width: 140, height: 36 }}>
                                  <Etincelle points={s.historique.map((c) => ({ t: c.t, v: c.dureeMs }))} couleur={s.statut === 'rouge' ? '#dc2626' : '#2f5bea'} />
                                </td>
                                <td className="discret">{dernier ? depuis(dernier.t) : 'jamais'}</td>
                                <td>
                                  <div className="ligne-flex" style={{ justifyContent: 'flex-end', gap: 6, flexWrap: 'nowrap' }}>
                                    <button
                                      className="icone-bouton"
                                      title="Contrôler maintenant"
                                      aria-label={`Contrôler ${s.nom} maintenant`}
                                      onClick={() => void faire(() => appeler(`/sondes/${s.id}/controler`, { methode: 'POST', corps: {} }))}
                                    >
                                      <RefreshCw size={13} />
                                    </button>
                                    {admin && (
                                      <>
                                        <button className="icone-bouton" title="Modifier" aria-label={`Modifier ${s.nom}`} onClick={() => setFormulaire(s)}>
                                          <Pencil size={13} />
                                        </button>
                                        <button
                                          className="icone-bouton"
                                          title="Supprimer"
                                          aria-label={`Supprimer ${s.nom}`}
                                          onClick={() =>
                                            confirm(`Supprimer la sonde « ${s.nom} » et son historique ?`) && void faire(() => appeler(`/sondes/${s.id}`, { methode: 'DELETE' }))
                                          }
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Pages>
              ) : (
                <Vide icone={<Radar size={28} />}>Aucune sonde. {admin ? 'Ajoutez une adresse web ou un port à surveiller.' : 'Un administrateur doit en ajouter.'}</Vide>
              )}
            </Carte>
            {formulaire && (
              <Formulaire
                sonde={formulaire === 'nouvelle' ? null : formulaire}
                fermer={() => setFormulaire(null)}
                fait={() => {
                  setFormulaire(null);
                  void etat.recharger();
                }}
              />
            )}
          </div>
        );
      }}
    </Charge>
  );
}
