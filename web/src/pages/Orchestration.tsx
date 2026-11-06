import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, GitMerge, Play, RotateCw, Sparkles } from 'lucide-react';
import { useSupervision } from '../components/Coquille';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, GrilleMesures, Pastille, Vide } from '../components/ui';
import { dateHeure, depuis, duree } from '../../../shared/format';
import { LIBELLE_EXECUTION, NOM_OUTIL, STATUT_EXECUTION, type Execution, type VueOutils } from '../../../shared/outils';

const VARIABLES = {
  gitlab: 'GITLAB_URL, GITLAB_JETON, GITLAB_PROJET',
  awx: 'AWX_URL, AWX_JETON',
  controlm: 'CONTROLM_URL, CONTROLM_JETON',
  sonar: 'SONAR_URL, SONAR_JETON, SONAR_PROJET',
};

function EtatExecution({ e }: { e: Execution }) {
  return (
    <Pastille statut={STATUT_EXECUTION[e.etat]}>
      {e.etat === 'en-cours' && <RotateCw size={11} className="tourne" />}
      {LIBELLE_EXECUTION[e.etat]}
    </Pastille>
  );
}

export default function Orchestration() {
  const etat = useDonnees<VueOutils>('/outils', 15_000);
  const agent = useSupervision().peut('agir');
  const [choix, setChoix] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  async function action(chemin: string, corps: unknown) {
    setEnCours(true);
    setMessage(null);
    try {
      const e = await appeler<Execution>(chemin, { methode: 'POST', corps });
      setMessage({ ok: true, texte: `${e.nom} (${NOM_OUTIL[e.outil]}) : ${LIBELLE_EXECUTION[e.etat].toLowerCase()}.` });
      void etat.recharger();
    } catch (x) {
      setMessage({ ok: false, texte: (x as Error).message });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Charge etat={etat}>
      {(v) => {
        const demo = [...v.outils, ...(v.qualite.demo ? [{ cle: 'sonar' as const, nom: v.qualite.nom }] : [])].filter((o) => ('demo' in o ? o.demo : true));
        const q = v.qualite;
        const qActif = q.configure || q.demo;
        const lancable = v.lancables.find((l) => `${l.outil}:${l.id}` === choix) ?? v.lancables[0];
        return (
          <div className="empile">
            {demo.length > 0 && (
              <div className="bandeau-mode">
                <Sparkles size={16} />
                <span>
                  <strong>Démonstration</strong> pour {demo.map((o) => o.nom).join(', ')} : renseignez {demo.map((o) => VARIABLES[o.cle]).join(' ; ')} dans <code>.env</code> pour
                  lire vos vrais outils.
                </span>
              </div>
            )}

            <div className="grille g4">
              {v.outils.map((o) => {
                const derniere = v.executions.find((e) => e.outil === o.cle);
                return (
                  <Carte
                    key={o.cle}
                    titre={o.nom}
                    sousTitre={{ gitlab: 'Pipelines CI/CD et demandes de fusion', awx: 'Jobs Ansible et modèles de job', controlm: 'Jobs planifiés (batch)' }[o.cle]}
                    droite={
                      <Pastille statut={!o.configure && !o.demo ? 'inconnu' : o.joignable ? 'vert' : 'rouge'}>
                        {!o.configure && !o.demo ? 'Non configuré' : o.joignable ? 'Joignable' : 'Injoignable'}
                      </Pastille>
                    }
                  >
                    {o.erreur && <div className="erreur">{o.erreur}</div>}
                    {!o.configure && !o.demo ? (
                      <p className="discret">
                        Variables : <code>{VARIABLES[o.cle]}</code>
                      </p>
                    ) : derniere ? (
                      <div style={{ fontSize: '0.88rem' }}>
                        <div className="ligne-flex">
                          <EtatExecution e={derniere} />
                          <strong>{derniere.nom}</strong>
                        </div>
                        <div className="discret" style={{ marginTop: 6 }}>
                          {derniere.contexte} · {depuis(derniere.debut)}
                        </div>
                      </div>
                    ) : (
                      <p className="discret">Aucune exécution récente.</p>
                    )}
                    {o.url && (
                      <a className="lien-fleche" href={o.url} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>
                        Ouvrir {o.nom} <ExternalLink size={13} />
                      </a>
                    )}
                  </Carte>
                );
              })}
              <Carte
                titre={q.nom}
                sousTitre="Qualité du code : porte qualité et mesures"
                droite={
                  <Pastille statut={!qActif ? 'inconnu' : !q.joignable ? 'rouge' : q.porte === 'OK' ? 'vert' : q.porte === 'ERROR' ? 'rouge' : 'inconnu'}>
                    {!qActif
                      ? 'Non configuré'
                      : !q.joignable
                        ? 'Injoignable'
                        : q.porte === 'OK'
                          ? 'Porte qualité OK'
                          : q.porte === 'ERROR'
                            ? 'Porte qualité en échec'
                            : 'Porte inconnue'}
                  </Pastille>
                }
              >
                {q.erreur && <div className="erreur">{q.erreur}</div>}
                {!qActif ? (
                  <p className="discret">
                    Variables : <code>{VARIABLES.sonar}</code>
                  </p>
                ) : (
                  <ul className="liste-points" style={{ margin: 0, fontSize: '0.84rem' }}>
                    {q.conditions.map((c) => (
                      <li key={c.libelle}>
                        <span className={`point ${c.statut === 'OK' ? 'vert' : 'rouge'}`} /> {c.libelle} : {c.valeur} <span className="discret">({c.seuil})</span>
                      </li>
                    ))}
                  </ul>
                )}
                {(q.lien ?? q.url) && (
                  <a className="lien-fleche" href={q.lien ?? (q.url as string)} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>
                    Ouvrir {q.nom} <ExternalLink size={13} />
                  </a>
                )}
              </Carte>
            </div>

            {qActif && q.joignable && (
              <Carte titre={`Mesures SonarQube — ${q.projet}`} sousTitre="Bugs, vulnérabilités, points chauds, dette, couverture et duplication du projet">
                <GrilleMesures mesures={q.mesures} />
              </Carte>
            )}

            {agent && v.lancables.length > 0 && (
              <Carte titre="Lancer" sousTitre="Un pipeline GitLab sur une branche, ou un modèle de job AWX. L’action est signée de votre nom dans le fil d’activité.">
                <div className="ligne-flex">
                  <select
                    className="champ"
                    style={{ flex: 1 }}
                    value={lancable ? `${lancable.outil}:${lancable.id}` : ''}
                    onChange={(e) => setChoix(e.target.value)}
                    aria-label="Quoi lancer"
                  >
                    {v.lancables.map((l) => (
                      <option key={`${l.outil}:${l.id}`} value={`${l.outil}:${l.id}`}>
                        {NOM_OUTIL[l.outil]} — {l.nom}
                      </option>
                    ))}
                  </select>
                  <button className="bouton primaire" disabled={enCours || !lancable} onClick={() => lancable && action(`/outils/${lancable.outil}/lancer`, { id: lancable.id })}>
                    <Play size={14} /> Lancer
                  </button>
                </div>
                {lancable?.description && (
                  <p className="discret" style={{ marginTop: 8 }}>
                    {lancable.description}
                  </p>
                )}
              </Carte>
            )}
            {message && <div className={message.ok ? 'encadre' : 'erreur'}>{message.texte}</div>}

            <Carte serree titre="Dernières exécutions" sousTitre="Pipelines, jobs AWX et jobs Control-M, du plus récent au plus ancien">
              {v.executions.length === 0 ? (
                <Vide>Aucune exécution à afficher.</Vide>
              ) : (
                <div className="tableau-conteneur">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Outil</th>
                        <th>Exécution</th>
                        <th>État</th>
                        <th>Début</th>
                        <th className="num">Durée</th>
                        <th>Par</th>
                        <th>Ticket</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {v.executions.map((e) => (
                        <tr key={`${e.outil}:${e.id}`}>
                          <td>
                            <Pastille statut="bleu">{NOM_OUTIL[e.outil]}</Pastille>
                          </td>
                          <td>
                            <strong>{e.nom}</strong>
                            <div className="discret" style={{ fontSize: '0.78rem' }}>
                              {e.contexte}
                            </div>
                          </td>
                          <td>
                            <EtatExecution e={e} />
                            <div className="discret mono" style={{ fontSize: '0.72rem' }}>
                              {e.statutBrut}
                            </div>
                          </td>
                          <td title={dateHeure(e.debut)}>{depuis(e.debut)}</td>
                          <td className="num">{e.debut && e.fin ? duree((e.fin - e.debut) / 1000) : '—'}</td>
                          <td className="discret">{e.par ?? '—'}</td>
                          <td className="mono">
                            {v.tickets[`${e.outil}:${e.id}`] ? <Link to={`/tickets/${v.tickets[`${e.outil}:${e.id}`]}`}>{v.tickets[`${e.outil}:${e.id}`]}</Link> : '—'}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {e.lien && (
                              <a className="bouton petit" href={e.lien} target="_blank" rel="noreferrer" title="Ouvrir dans l’outil">
                                <ExternalLink size={13} />
                              </a>
                            )}{' '}
                            {agent && e.etat !== 'en-cours' && e.etat !== 'attente' && (
                              <button
                                className="bouton petit"
                                disabled={enCours}
                                onClick={() => action(`/outils/${e.outil}/executions/${encodeURIComponent(e.id)}/relancer`, {})}
                                title="Relancer"
                              >
                                <RotateCw size={13} /> Relancer
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Carte>

            {v.demandesFusion.length > 0 && (
              <Carte serree titre="Demandes de fusion ouvertes" sousTitre="GitLab : ce qui attend une revue, avec l’état du pipeline de la branche">
                <div className="tableau-conteneur">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>MR</th>
                        <th>Titre</th>
                        <th>Branches</th>
                        <th>Pipeline</th>
                        <th>Mise à jour</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.demandesFusion.map((m) => (
                        <tr key={m.iid}>
                          <td>
                            <a href={m.lien} target="_blank" rel="noreferrer" className="mono">
                              <GitMerge size={13} style={{ verticalAlign: -2 }} /> !{m.iid}
                            </a>
                          </td>
                          <td>
                            <strong>{m.titre}</strong>
                            <div className="discret" style={{ fontSize: '0.78rem' }}>
                              {m.auteur}
                            </div>
                          </td>
                          <td className="mono discret">
                            {m.source} → {m.cible}
                          </td>
                          <td>{m.pipeline ? <Pastille statut={STATUT_EXECUTION[m.pipeline]}>{LIBELLE_EXECUTION[m.pipeline]}</Pastille> : '—'}</td>
                          <td title={dateHeure(m.majLe)}>{depuis(m.majLe)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Carte>
            )}
          </div>
        );
      }}
    </Charge>
  );
}
