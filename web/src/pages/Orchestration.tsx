import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, GitMerge, Play, RotateCw } from 'lucide-react';
import { useSupervision } from '../components/Coquille';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { BandeStats, Carte, Charge, Pastille, Vide, VoirPlus } from '../components/ui';
import { dateHeure, depuis, duree } from '../../../shared/format';
import { LIBELLE_EXECUTION, NOM_OUTIL, STATUT_EXECUTION, type Execution, type VueOutils } from '../../../shared/outils';

const VARIABLES = {
  gitlab: 'GITLAB_URL, GITLAB_JETON, GITLAB_PROJET',
  github: 'GITHUB_JETON, GITHUB_DEPOT',
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

/** Une tuile compacte par outil : nom (lien), état, une ligne de contexte. */
function TuileOutil({
  nom,
  url,
  actif,
  joignable,
  enfant,
  droite,
}: {
  nom: string;
  url: string | null;
  actif: boolean;
  joignable: boolean;
  enfant: React.ReactNode;
  droite?: React.ReactNode;
}) {
  return (
    <div className="carte" style={{ padding: '12px 14px' }}>
      <div className="ligne-flex" style={{ marginBottom: 6 }}>
        <strong style={{ color: 'var(--encre)', fontSize: '0.9rem' }}>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
              {nom} <ExternalLink size={11} style={{ verticalAlign: -1, opacity: 0.5 }} />
            </a>
          ) : (
            nom
          )}
        </strong>
        <span className="espace" />
        {droite ?? (!actif || !joignable ? <Pastille statut={!actif ? 'inconnu' : 'rouge'}>{!actif ? 'Non configuré' : 'Injoignable'}</Pastille> : null)}
      </div>
      <div style={{ fontSize: '0.8rem' }}>{enfant}</div>
    </div>
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
        const q = v.qualite;
        const qActif = q.configure || q.demo;
        const lancable = v.lancables.find((l) => `${l.outil}:${l.id}` === choix) ?? v.lancables[0];
        return (
          <div className="empile">
            <div className="grille g5">
              {v.outils.map((o) => {
                const actif = o.configure || o.demo;
                const derniere = v.executions.find((e) => e.outil === o.cle);
                return (
                  <TuileOutil
                    key={o.cle}
                    nom={o.nom}
                    url={o.url}
                    actif={actif}
                    joignable={o.joignable}
                    enfant={
                      o.erreur ? (
                        <span className="texte-rouge">{o.erreur}</span>
                      ) : !actif ? (
                        <code className="discret">{VARIABLES[o.cle]}</code>
                      ) : derniere ? (
                        <span className="ligne-flex" style={{ gap: 6 }}>
                          <EtatExecution e={derniere} />
                          <span className="discret" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {derniere.nom} · {depuis(derniere.debut)}
                          </span>
                        </span>
                      ) : (
                        <span className="discret">Aucune exécution récente</span>
                      )
                    }
                  />
                );
              })}
              <TuileOutil
                nom={q.nom}
                url={q.lien ?? q.url}
                actif={qActif}
                joignable={q.joignable}
                droite={
                  qActif && q.joignable ? (
                    <Pastille statut={q.porte === 'OK' ? 'vert' : q.porte === 'ERROR' ? 'rouge' : 'inconnu'}>
                      {q.porte === 'OK' ? 'Porte OK' : q.porte === 'ERROR' ? 'Porte en échec' : 'Porte inconnue'}
                    </Pastille>
                  ) : undefined
                }
                enfant={
                  q.erreur ? (
                    <span className="texte-rouge">{q.erreur}</span>
                  ) : !qActif ? (
                    <code className="discret">{VARIABLES.sonar}</code>
                  ) : (
                    <span className="discret">
                      {q.conditions.filter((c) => c.statut === 'OK').length}/{q.conditions.length} conditions · {q.mesures.find((m) => m.cle === 'coverage')?.valeur ?? '—'} %
                      couvert
                    </span>
                  )
                }
              />
            </div>

            {message && <div className={message.ok ? 'encadre' : 'erreur'}>{message.texte}</div>}

            <div className="grille g-principal">
              <Carte serree titre="Dernières exécutions" sousTitre="Pipelines, jobs AWX et jobs Control-M, du plus récent au plus ancien">
                {v.executions.length === 0 ? (
                  <Vide>Aucune exécution à afficher.</Vide>
                ) : (
                  <VoirPlus
                    elements={v.executions}
                    n={8}
                    rendu={(visibles) => (
                      <div className="tableau-conteneur">
                        <table className="tableau">
                          <thead>
                            <tr>
                              <th>Exécution</th>
                              <th>État</th>
                              <th>Début</th>
                              <th className="num">Durée</th>
                              <th>Ticket</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {visibles.map((e) => (
                              <tr key={`${e.outil}:${e.id}`}>
                                <td style={{ maxWidth: 0, width: '44%' }}>
                                  <div className="ligne-flex" style={{ gap: 8, flexWrap: 'nowrap' }}>
                                    <Pastille statut="bleu">{NOM_OUTIL[e.outil]}</Pastille>
                                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${e.nom} · ${e.contexte}`}>
                                      <strong>{e.nom}</strong>
                                      <span className="discret"> · {e.contexte}</span>
                                    </span>
                                  </div>
                                </td>
                                <td title={e.statutBrut}>
                                  <EtatExecution e={e} />
                                </td>
                                <td title={dateHeure(e.debut)} style={{ whiteSpace: 'nowrap' }}>
                                  {depuis(e.debut)}
                                </td>
                                <td className="num">{e.debut && e.fin ? duree((e.fin - e.debut) / 1000) : '—'}</td>
                                <td className="mono">
                                  {v.tickets[`${e.outil}:${e.id}`] ? <Link to={`/tickets/${v.tickets[`${e.outil}:${e.id}`]}`}>{v.tickets[`${e.outil}:${e.id}`]}</Link> : '—'}
                                </td>
                                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
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
                                      <RotateCw size={13} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  />
                )}
              </Carte>

              <div className="empile">
                {agent && v.lancables.length > 0 && (
                  <Carte titre="Lancer" sousTitre="Pipeline sur une branche ou modèle de job AWX, signé de votre nom">
                    <div className="ligne-flex">
                      <select
                        className="champ"
                        style={{ flex: 1, minWidth: 0 }}
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
                      <button
                        className="bouton primaire"
                        disabled={enCours || !lancable}
                        onClick={() => lancable && action(`/outils/${lancable.outil}/lancer`, { id: lancable.id })}
                      >
                        <Play size={14} /> Lancer
                      </button>
                    </div>
                    {lancable?.description && (
                      <p className="discret" style={{ margin: '8px 0 0', fontSize: '0.78rem' }}>
                        {lancable.description}
                      </p>
                    )}
                  </Carte>
                )}

                {v.etapes.length > 0 && (
                  <Carte titre="Étapes du dernier pipeline" sousTitre="Branche principale ; elles cochent les étapes du guide (Automatisations)">
                    <div className="chips-etapes">
                      {v.etapes.map((e, i) => (
                        <a key={i} className="chip-etape" href={e.lien ?? undefined} target={e.lien ? '_blank' : undefined} rel="noreferrer" title={e.nom}>
                          <span className={`point ${STATUT_EXECUTION[e.etat]}`} />
                          <strong>{e.etape}</strong>
                          <span className="discret">{e.nom}</span>
                        </a>
                      ))}
                    </div>
                  </Carte>
                )}

                {qActif && q.joignable && (
                  <Carte titre="Qualité du code" sousTitre={`${q.nom} — ${q.projet}`}>
                    <BandeStats mesures={q.mesures.filter((m) => m.cle !== 'ncloc')} />
                    {q.conditions.some((c) => c.statut !== 'OK') && (
                      <ul className="liste-points" style={{ margin: '6px 0 0', fontSize: '0.8rem' }}>
                        {q.conditions
                          .filter((c) => c.statut !== 'OK')
                          .map((c) => (
                            <li key={c.libelle}>
                              <span className="point rouge" /> {c.libelle} : {c.valeur} <span className="discret">({c.seuil})</span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </Carte>
                )}

                {v.demandesFusion.length > 0 && (
                  <Carte titre="Demandes de fusion ouvertes" sousTitre="En attente de revue, avec l’état du pipeline de la branche">
                    <ul className="activite">
                      {v.demandesFusion.slice(0, 5).map((m) => (
                        <li key={m.iid}>
                          <span className={`tuile ${m.pipeline ? STATUT_EXECUTION[m.pipeline] : 'inconnu'}`}>
                            <GitMerge size={14} />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <strong>
                              <a href={m.lien} target="_blank" rel="noreferrer">
                                !{m.iid} {m.titre}
                              </a>
                            </strong>
                            <span>
                              {m.auteur} ·{' '}
                              <span className="mono">
                                {m.source} → {m.cible}
                              </span>
                            </span>
                          </div>
                          <time title={dateHeure(m.majLe)}>{depuis(m.majLe)}</time>
                        </li>
                      ))}
                    </ul>
                  </Carte>
                )}
              </div>
            </div>
          </div>
        );
      }}
    </Charge>
  );
}
