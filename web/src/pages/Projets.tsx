import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FolderKanban, Play, Plus, Trash2 } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, Modale, Pages, Pastille, Vide } from '../components/ui';
import { LienTicket, PastilleStatut } from '../components/itsm';
import { useSupervision } from '../components/Coquille';
import { Kanban } from './itsm/Tableau';
import { dateHeure } from '../../../shared/format';
import { estOuvert, type TicketResume } from '../../../shared/itsm';
import type { ResumeProjet, Sprint, VueProjet } from '../../../shared/projets';

function NouveauProjet({ fermer, fait }: { fermer: () => void; fait: () => void }) {
  const [d, setD] = useState({ cle: '', nom: '', description: '' });
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <Modale titre="Nouveau projet" fermer={fermer}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await appeler('/projets', { methode: 'POST', corps: d });
            fait();
          } catch (x) {
            setErreur((x as Error).message);
          }
        }}
      >
        <div className="champ-groupe">
          <label htmlFor="prj-cle">Clé (2 à 6 lettres)</label>
          <input id="prj-cle" className="champ mono" required maxLength={6} placeholder="OPS" value={d.cle} onChange={(e) => setD({ ...d, cle: e.target.value.toUpperCase() })} />
        </div>
        <div className="champ-groupe">
          <label htmlFor="prj-nom">Nom</label>
          <input id="prj-nom" className="champ" required value={d.nom} onChange={(e) => setD({ ...d, nom: e.target.value })} />
        </div>
        <div className="champ-groupe">
          <label htmlFor="prj-desc">Description</label>
          <input id="prj-desc" className="champ" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        </div>
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
            Créer le projet
          </button>
        </div>
      </form>
    </Modale>
  );
}

/** La liste des projets. */
export default function Projets() {
  const etat = useDonnees<ResumeProjet[]>('/projets', 30_000);
  const { peut } = useSupervision();
  const [nouveau, setNouveau] = useState(false);
  return (
    <div className="empile">
      {peut('administrer') && (
        <div className="ligne-flex">
          <span className="espace" />
          <button className="bouton primaire" onClick={() => setNouveau(true)}>
            <Plus size={15} /> Nouveau projet
          </button>
        </div>
      )}
      <Charge etat={etat}>
        {(liste) =>
          liste.length ? (
            <Pages liste={liste} parPage={12}>
              {(visibles) => (
                <div className="grille g3">
                  {visibles.map((p) => (
                    <Link key={p.cle} to={`/projets/${p.cle}`} className="carte domaine" style={{ display: 'block' }}>
                      <div className="ligne-flex" style={{ marginBottom: 8 }}>
                        <span className="tuile">
                          <FolderKanban size={16} />
                        </span>
                        <strong style={{ color: 'var(--encre)' }}>{p.nom}</strong>
                        <span className="espace" />
                        <span className="mono discret">{p.cle}</span>
                      </div>
                      <p className="discret">{p.description || 'Sans description'}</p>
                      <div className="ligne-flex" style={{ marginTop: 10 }}>
                        <Pastille statut={p.sprintActif ? 'bleu' : 'inconnu'}>{p.sprintActif ?? 'Pas de sprint actif'}</Pastille>
                        <span className="espace" />
                        <span className="discret">{p.ouvertes} tâche(s) ouverte(s)</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Pages>
          ) : (
            <Carte>
              <Vide icone={<FolderKanban size={28} />}>Aucun projet. {peut('administrer') ? 'Créez-en un pour ouvrir son backlog.' : 'Un administrateur doit en créer un.'}</Vide>
            </Carte>
          )
        }
      </Charge>
      {nouveau && (
        <NouveauProjet
          fermer={() => setNouveau(false)}
          fait={() => {
            setNouveau(false);
            void etat.recharger();
          }}
        />
      )}
    </div>
  );
}

const sommePoints = (taches: TicketResume[]) => taches.reduce((n, t) => n + (t.points ?? 0), 0);

/** Une liste de tâches (un sprint ou le backlog) : estimer, planifier, ouvrir. */
function Taches({ taches, sprints, faire, vide }: { taches: TicketResume[]; sprints: Sprint[]; faire: (f: () => Promise<unknown>) => Promise<void>; vide: string }) {
  if (!taches.length)
    return (
      <div className="discret" style={{ padding: '0 20px 16px' }}>
        {vide}
      </div>
    );
  return (
    <Pages liste={taches} parPage={8}>
      {(visibles) => (
        <div className="tableau-conteneur">
          <table className="tableau">
            <tbody>
              {visibles.map((t) => (
                <tr key={t.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <LienTicket t={t} />
                  </td>
                  <td style={{ width: '45%' }}>{t.titre}</td>
                  <td>
                    <PastilleStatut type="tache" statut={t.statut} />
                  </td>
                  <td className="discret">{t.assigneA ?? 'Non assigné'}</td>
                  <td>
                    <input
                      className="champ"
                      style={{ width: 70 }}
                      type="number"
                      min={0}
                      max={100}
                      placeholder="pts"
                      defaultValue={t.points ?? ''}
                      disabled={!estOuvert(t)}
                      aria-label={`Points de ${t.numero}`}
                      onBlur={(e) =>
                        String(t.points ?? '') !== e.target.value && void faire(() => appeler(`/tickets/${t.numero}`, { methode: 'PATCH', corps: { points: e.target.value } }))
                      }
                    />
                  </td>
                  <td>
                    <select
                      className="champ"
                      value={t.sprint ?? ''}
                      aria-label={`Planifier ${t.numero}`}
                      onChange={(e) => void faire(() => appeler(`/tickets/${t.numero}/sprint`, { methode: 'PUT', corps: { sprint: e.target.value || null } }))}
                    >
                      <option value="">Backlog</option>
                      {sprints.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nom}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Pages>
  );
}

/** Un projet : son backlog, ses sprints et le tableau du sprint actif. */
export function PageProjet() {
  const { cle = '' } = useParams();
  const etat = useDonnees<VueProjet>(`/projets/${cle}`, 15_000);
  const [onglet, setOnglet] = useState<'backlog' | 'tableau'>('backlog');
  const [erreur, setErreur] = useState<string | null>(null);
  const [titre, setTitre] = useState('');
  const [points, setPoints] = useState('');

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
      {(v) => {
        const ouverts = v.sprints.filter((s) => s.statut !== 'termine');
        const termines = v.sprints.filter((s) => s.statut === 'termine');
        const actif = ouverts.find((s) => s.statut === 'actif');
        const de = (id: string | null) => v.taches.filter((t) => (t.sprint ?? null) === id);
        return (
          <div className="empile">
            <div className="filtres">
              <Link className="bouton petit" to="/projets">
                <ArrowLeft size={13} /> Projets
              </Link>
              <strong style={{ color: 'var(--encre)' }}>
                {v.projet.nom} <span className="mono discret">{v.projet.cle}</span>
              </strong>
              <div className="onglets">
                <button className={onglet === 'backlog' ? 'actif' : ''} onClick={() => setOnglet('backlog')}>
                  Backlog et sprints
                </button>
                <button className={onglet === 'tableau' ? 'actif' : ''} onClick={() => setOnglet('tableau')}>
                  Tableau du sprint
                </button>
              </div>
              <span className="espace" />
              <button className="bouton petit" onClick={() => void faire(() => appeler(`/projets/${cle}/sprints`, { methode: 'POST', corps: {} }))}>
                <Plus size={13} /> Nouveau sprint
              </button>
            </div>
            {erreur && (
              <div className="erreur" role="alert">
                {erreur}
              </div>
            )}

            {onglet === 'tableau' ? (
              actif ? (
                <>
                  <div className="discret">
                    {actif.nom} · jusqu’au {dateHeure(actif.fin)} · {sommePoints(de(actif.id).filter((t) => t.statut === 'termine'))} / {sommePoints(de(actif.id))} point(s)
                    terminé(s)
                  </div>
                  <Kanban type="tache" tickets={de(actif.id)} recharger={etat.recharger} />
                </>
              ) : (
                <Carte>
                  <Vide icone={<Play size={28} />}>Aucun sprint actif. Planifiez des tâches dans un sprint, puis démarrez-le depuis « Backlog et sprints ».</Vide>
                </Carte>
              )
            ) : (
              <>
                {ouverts.map((s) => (
                  <Carte
                    key={s.id}
                    serree
                    titre={
                      <>
                        {s.nom} <Pastille statut={s.statut === 'actif' ? 'bleu' : 'inconnu'}>{s.statut === 'actif' ? 'Actif' : 'Prévu'}</Pastille>
                      </>
                    }
                    sousTitre={`${de(s.id).length} tâche(s) · ${sommePoints(de(s.id))} point(s)${s.statut === 'actif' ? ` · se termine le ${dateHeure(s.fin)}` : ''}`}
                    droite={
                      s.statut === 'actif' ? (
                        <button
                          className="bouton petit"
                          onClick={() =>
                            confirm(`Terminer « ${s.nom} » ? Les tâches non terminées retournent au backlog.`) &&
                            void faire(() => appeler(`/sprints/${s.id}/terminer`, { methode: 'POST', corps: {} }))
                          }
                        >
                          Terminer le sprint
                        </button>
                      ) : (
                        <div className="ligne-flex">
                          <button
                            className="bouton primaire petit"
                            onClick={() => void faire(() => appeler(`/sprints/${s.id}/demarrer`, { methode: 'POST', corps: { jours: 14 } }))}
                          >
                            <Play size={13} /> Démarrer (2 semaines)
                          </button>
                          <button
                            className="icone-bouton"
                            title="Supprimer ce sprint"
                            aria-label={`Supprimer ${s.nom}`}
                            onClick={() =>
                              confirm(`Supprimer « ${s.nom} » ? Ses tâches retournent au backlog.`) && void faire(() => appeler(`/sprints/${s.id}`, { methode: 'DELETE' }))
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )
                    }
                  >
                    <Taches taches={de(s.id)} sprints={ouverts} faire={faire} vide="Aucune tâche : planifiez-en depuis le backlog." />
                  </Carte>
                ))}

                <Carte serree titre="Backlog" sousTitre={`${de(null).length} tâche(s) à planifier · ${sommePoints(de(null))} point(s)`}>
                  <form
                    className="filtres"
                    style={{ padding: '0 20px 16px' }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void faire(async () => {
                        await appeler('/tickets', { methode: 'POST', corps: { type: 'tache', projet: cle, titre, points } });
                        setTitre('');
                        setPoints('');
                      });
                    }}
                  >
                    <input
                      className="champ"
                      style={{ flex: 1, minWidth: 220 }}
                      required
                      placeholder="Nouvelle tâche : ce qu’il faut faire"
                      value={titre}
                      onChange={(e) => setTitre(e.target.value)}
                      aria-label="Titre de la tâche"
                    />
                    <input
                      className="champ"
                      style={{ width: 90 }}
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Points"
                      value={points}
                      onChange={(e) => setPoints(e.target.value)}
                      aria-label="Points"
                    />
                    <button className="bouton primaire" type="submit">
                      <Plus size={14} /> Ajouter
                    </button>
                  </form>
                  <Taches taches={de(null)} sprints={ouverts} faire={faire} vide="Le backlog est vide." />
                </Carte>

                {termines.length > 0 && (
                  <Carte serree titre="Sprints terminés" sousTitre="Les 5 derniers ; les points terminés donnent la vélocité">
                    <div className="tableau-conteneur">
                      <table className="tableau">
                        <thead>
                          <tr>
                            <th>Sprint</th>
                            <th>Terminé le</th>
                            <th className="num">Tâches terminées</th>
                            <th className="num">Reportées</th>
                            <th className="num">Vélocité (points)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {termines.map((s) => (
                            <tr key={s.id}>
                              <td>{s.nom}</td>
                              <td className="discret">{dateHeure(s.fin)}</td>
                              <td className="num">{s.bilan?.terminees ?? '—'}</td>
                              <td className="num">{s.bilan?.reportees ?? '—'}</td>
                              <td className="num">{s.bilan?.points ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Carte>
                )}
              </>
            )}
          </div>
        );
      }}
    </Charge>
  );
}
