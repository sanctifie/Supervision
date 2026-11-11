import { useState } from 'react';
import { Pencil, Play, Plus, Server, Trash2 } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, Modale, Pages, Pastille, Vide } from '../components/ui';
import { useSupervision } from '../components/Coquille';
import { dateHeure, depuis, duree } from '../../../shared/format';
import { LIBELLE_EXECUTION, type Agent, type Execution, type Job, type StatutExecution, type VueOrdonnanceur } from '../../../shared/ordonnanceur';

const COULEUR: Record<StatutExecution, 'vert' | 'rouge' | 'bleu' | 'inconnu' | 'orange'> = {
  'en-attente': 'inconnu',
  'en-cours': 'bleu',
  reussi: 'vert',
  echoue: 'rouge',
  expire: 'orange',
  annule: 'inconnu',
};

function Jeton({ nom, jeton, fermer }: { nom: string; jeton: string; fermer: () => void }) {
  return (
    <Modale titre={`Installer l’agent sur ${nom}`} fermer={fermer} large>
      <p>
        Copiez <code>agent/agent.py</code> (dépôt de la supervision) sur le serveur, puis lancez-le avec un compte dédié, sans droits root :
      </p>
      <pre className="sortie">{`SUPERVISION_URL=${location.origin} \\\nAGENT_JETON=${jeton} \\\npython3 agent.py`}</pre>
      <p className="discret">Ce jeton ne sera plus jamais affiché. Perdu : supprimez l’agent et recréez-le.</p>
      <div className="ligne-flex" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="bouton primaire" onClick={fermer}>
          J’ai copié le jeton
        </button>
      </div>
    </Modale>
  );
}

function FormulaireJob({ job, v, fermer, fait }: { job: Job | null; v: VueOrdonnanceur; fermer: () => void; fait: () => void }) {
  const [d, setD] = useState({
    nom: job?.nom ?? '',
    agentId: job?.agentId ?? v.agents[0]?.id ?? '',
    commande: job?.commande ?? '',
    cron: job?.cron ?? '',
    apres: job?.apres ?? '',
    delaiMax: job?.delaiMax ?? 300,
    actif: job?.actif ?? true,
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = <K extends keyof typeof d>(k: K, valeur: (typeof d)[K]) => setD({ ...d, [k]: valeur });
  return (
    <Modale titre={job ? `Modifier « ${job.nom} »` : 'Nouveau job'} fermer={fermer} large>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await appeler(job ? `/ordonnanceur/jobs/${job.id}` : '/ordonnanceur/jobs', { methode: job ? 'PATCH' : 'POST', corps: d });
            fait();
          } catch (x) {
            setErreur((x as Error).message);
          }
        }}
      >
        <div className="grille g2">
          <div className="champ-groupe">
            <label htmlFor="job-nom">Nom</label>
            <input id="job-nom" className="champ" required value={d.nom} onChange={(e) => champ('nom', e.target.value)} />
          </div>
          <div className="champ-groupe">
            <label htmlFor="job-agent">Serveur (agent)</label>
            <select id="job-agent" className="champ" required value={d.agentId} onChange={(e) => champ('agentId', e.target.value)}>
              {v.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="champ-groupe">
          <label htmlFor="job-commande">Commande (exécutée par sh sur le serveur)</label>
          <textarea id="job-commande" className="champ mono" rows={4} required value={d.commande} onChange={(e) => champ('commande', e.target.value)} />
        </div>
        <div className="grille g3">
          <div className="champ-groupe">
            <label htmlFor="job-cron">Planification (cron)</label>
            <input id="job-cron" className="champ mono" placeholder="0 2 * * *" value={d.cron} onChange={(e) => champ('cron', e.target.value)} />
            <div className="discret" style={{ marginTop: 6 }}>
              minute heure jour mois jour-de-semaine, heure de {v.fuseau}. Vide : à la demande.
            </div>
          </div>
          <div className="champ-groupe">
            <label htmlFor="job-apres">Lancer après la réussite de</label>
            <select id="job-apres" className="champ" value={d.apres} onChange={(e) => champ('apres', e.target.value)}>
              <option value="">— aucun —</option>
              {v.jobs
                .filter((j) => j.id !== job?.id)
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nom}
                  </option>
                ))}
            </select>
          </div>
          <div className="champ-groupe">
            <label htmlFor="job-delai">Durée maximale (secondes)</label>
            <input id="job-delai" className="champ" type="number" min={5} max={3600} value={d.delaiMax} onChange={(e) => champ('delaiMax', Number(e.target.value))} />
          </div>
        </div>
        <label className="ligne-flex" style={{ marginTop: 12, gap: 8, fontSize: '0.86rem' }}>
          <input type="checkbox" checked={d.actif} onChange={(e) => champ('actif', e.target.checked)} /> Job actif (décoché : plus de lancement planifié ni en chaîne)
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

function Sortie({ id, fermer }: { id: string; fermer: () => void }) {
  const etat = useDonnees<Execution>(`/ordonnanceur/executions/${id}`, 5_000);
  return (
    <Modale titre={etat.donnees ? `${etat.donnees.nomJob} · ${LIBELLE_EXECUTION[etat.donnees.statut]}` : 'Exécution'} fermer={fermer} large>
      <Charge etat={etat}>
        {(x) => (
          <>
            <p className="discret">
              Demandé {dateHeure(x.demandeLe)} par {x.declenchePar}
              {x.code !== null && ` · code de sortie ${x.code}`}
            </p>
            <pre className="sortie">{x.sortie || (x.finLe ? '(aucune sortie)' : 'En attente du résultat de l’agent…')}</pre>
          </>
        )}
      </Charge>
      <div className="ligne-flex" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="bouton" onClick={fermer}>
          Fermer
        </button>
      </div>
    </Modale>
  );
}

export default function Ordonnanceur() {
  const etat = useDonnees<VueOrdonnanceur>('/ordonnanceur', 5_000);
  const { peut } = useSupervision();
  const admin = peut('administrer');
  const [jeton, setJeton] = useState<{ nom: string; jeton: string } | null>(null);
  const [formulaire, setFormulaire] = useState<Job | 'nouveau' | null>(null);
  const [sortie, setSortie] = useState<string | null>(null);
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
  const ajouterAgent = () => {
    const nom = prompt('Nom du serveur (par exemple : srv-prod-1)');
    if (nom) void faire(async () => setJeton({ nom, jeton: (await appeler<{ agent: Agent; jeton: string }>('/ordonnanceur/agents', { methode: 'POST', corps: { nom } })).jeton }));
  };

  return (
    <Charge etat={etat}>
      {(v) => {
        const nomAgent = (id: string) => v.agents.find((a) => a.id === id)?.nom ?? '—';
        const derniere = (jobId: string) => v.executions.find((x) => x.jobId === jobId);
        return (
          <div className="empile">
            {erreur && (
              <div className="erreur" role="alert">
                {erreur}
              </div>
            )}
            <Carte
              titre="Serveurs"
              sousTitre="Un agent par serveur vient chercher ses jobs : aucun port à ouvrir"
              droite={
                admin && (
                  <button className="bouton petit" onClick={ajouterAgent}>
                    <Plus size={13} /> Ajouter un serveur
                  </button>
                )
              }
            >
              {v.agents.length ? (
                <div className="chips">
                  {v.agents.map((a) => (
                    <span key={a.id} className="noeud" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Server size={14} />
                      <strong>{a.nom}</strong>
                      <Pastille statut={a.enLigne ? 'vert' : a.vuLe ? 'rouge' : 'inconnu'}>{a.enLigne ? 'En ligne' : a.vuLe ? `Vu ${depuis(a.vuLe)}` : 'Jamais vu'}</Pastille>
                      {admin && (
                        <button
                          className="icone-bouton"
                          title={`Supprimer l’agent ${a.nom}`}
                          aria-label={`Supprimer l’agent ${a.nom}`}
                          onClick={() =>
                            confirm(`Supprimer l’agent ${a.nom} ? Son jeton ne marchera plus.`) && void faire(() => appeler(`/ordonnanceur/agents/${a.id}`, { methode: 'DELETE' }))
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <Vide icone={<Server size={28} />}>Aucun serveur. {admin ? 'Ajoutez-en un pour obtenir le jeton de son agent.' : 'Un administrateur doit en ajouter un.'}</Vide>
              )}
            </Carte>

            <Carte
              serree
              titre={`Jobs (${v.jobs.length})`}
              sousTitre="À la demande, à heure fixe, ou à la suite d’un autre job"
              droite={
                admin &&
                v.agents.length > 0 && (
                  <button className="bouton primaire petit" onClick={() => setFormulaire('nouveau')}>
                    <Plus size={13} /> Nouveau job
                  </button>
                )
              }
            >
              {v.jobs.length ? (
                <Pages liste={v.jobs} parPage={10}>
                  {(visibles) => (
                    <div className="tableau-conteneur">
                      <table className="tableau">
                        <thead>
                          <tr>
                            <th>Job</th>
                            <th>Serveur</th>
                            <th>Déclenchement</th>
                            <th>Dernière exécution</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {visibles.map((j) => {
                            const x = derniere(j.id);
                            return (
                              <tr key={j.id} style={{ opacity: j.actif ? 1 : 0.5 }}>
                                <td>
                                  <strong style={{ color: 'var(--encre)' }}>{j.nom}</strong>
                                  <div className="discret mono">{j.commande.length > 60 ? `${j.commande.slice(0, 60)}…` : j.commande}</div>
                                </td>
                                <td>{nomAgent(j.agentId)}</td>
                                <td className="discret">
                                  {j.cron && <span className="mono">{j.cron} </span>}
                                  {j.apres && `après « ${v.jobs.find((y) => y.id === j.apres)?.nom ?? '?'} »`}
                                  {!j.cron && !j.apres && 'À la demande'}
                                  {!j.actif && ' · en pause'}
                                </td>
                                <td>
                                  {x ? (
                                    <button className="lien-bouton" onClick={() => setSortie(x.id)}>
                                      <Pastille statut={COULEUR[x.statut]}>{LIBELLE_EXECUTION[x.statut]}</Pastille> <span className="discret">{depuis(x.demandeLe)}</span>
                                    </button>
                                  ) : (
                                    <span className="discret">jamais</span>
                                  )}
                                </td>
                                <td>
                                  <div className="ligne-flex" style={{ justifyContent: 'flex-end', gap: 6, flexWrap: 'nowrap' }}>
                                    <button className="bouton petit" onClick={() => void faire(() => appeler(`/ordonnanceur/jobs/${j.id}/lancer`, { methode: 'POST', corps: {} }))}>
                                      <Play size={13} /> Lancer
                                    </button>
                                    {admin && (
                                      <>
                                        <button className="icone-bouton" title="Modifier" aria-label={`Modifier ${j.nom}`} onClick={() => setFormulaire(j)}>
                                          <Pencil size={13} />
                                        </button>
                                        <button
                                          className="icone-bouton"
                                          title="Supprimer"
                                          aria-label={`Supprimer ${j.nom}`}
                                          onClick={() =>
                                            confirm(`Supprimer le job « ${j.nom} » ?`) && void faire(() => appeler(`/ordonnanceur/jobs/${j.id}`, { methode: 'DELETE' }))
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
                <Vide>Aucun job pour l’instant.</Vide>
              )}
            </Carte>

            <Carte serree titre="Exécutions" sousTitre="Les plus récentes d’abord ; cliquez pour lire la sortie de la commande">
              {v.executions.length ? (
                <Pages liste={v.executions} parPage={10}>
                  {(visibles) => (
                    <div className="tableau-conteneur">
                      <table className="tableau">
                        <thead>
                          <tr>
                            <th>Job</th>
                            <th>État</th>
                            <th>Serveur</th>
                            <th>Déclenché par</th>
                            <th>Demandé</th>
                            <th>Durée</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {visibles.map((x) => (
                            <tr key={x.id} className="ligne-cliquable" onClick={(e) => (e.target as HTMLElement).closest('button') || setSortie(x.id)}>
                              <td>{x.nomJob}</td>
                              <td>
                                <Pastille statut={COULEUR[x.statut]}>{LIBELLE_EXECUTION[x.statut]}</Pastille>
                              </td>
                              <td>{nomAgent(x.agentId)}</td>
                              <td className="discret">{x.declenchePar}</td>
                              <td className="discret">{depuis(x.demandeLe)}</td>
                              <td className="discret">{x.debutLe && x.finLe ? duree((x.finLe - x.debutLe) / 1000) : '—'}</td>
                              <td style={{ textAlign: 'right' }}>
                                {x.statut === 'en-attente' && (
                                  <button
                                    className="bouton petit"
                                    onClick={() => void faire(() => appeler(`/ordonnanceur/executions/${x.id}/annuler`, { methode: 'POST', corps: {} }))}
                                  >
                                    Annuler
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Pages>
              ) : (
                <Vide>Aucune exécution pour l’instant.</Vide>
              )}
            </Carte>

            {jeton && <Jeton {...jeton} fermer={() => setJeton(null)} />}
            {formulaire && (
              <FormulaireJob
                job={formulaire === 'nouveau' ? null : formulaire}
                v={v}
                fermer={() => setFormulaire(null)}
                fait={() => {
                  setFormulaire(null);
                  void etat.recharger();
                }}
              />
            )}
            {sortie && <Sortie id={sortie} fermer={() => setSortie(null)} />}
          </div>
        );
      }}
    </Charge>
  );
}
