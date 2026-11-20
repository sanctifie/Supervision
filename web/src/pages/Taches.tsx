import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, Erreur, Modale, Pastille, Squelette, Vide } from '../components/ui';
import { useSupervision } from '../components/Coquille';
import { dateHeure, depuis, duree } from '../../../shared/format';
import { estTermine, JOURS, LIBELLE_FREQUENCE, LIBELLE_STATUT_TRAVAIL, type ModeleTache, type Planning, type StatutTravail, type Travail } from '../../../shared/taches';

const COULEUR: Record<StatutTravail, 'vert' | 'orange' | 'rouge' | 'inconnu' | 'bleu' | 'violet'> = {
  approbation: 'violet',
  attente: 'bleu',
  'en-cours': 'bleu',
  reussi: 'vert',
  echoue: 'rouge',
  annule: 'inconnu',
  refuse: 'inconnu',
};

type ModeleVue = ModeleTache & { scriptPresent: boolean; dernier: Travail | null };

export function PastilleTravail({ s }: { s: StatutTravail }) {
  return <Pastille statut={COULEUR[s]}>{LIBELLE_STATUT_TRAVAIL[s]}</Pastille>;
}

export default function Taches() {
  const [onglet, setOnglet] = useState<'modeles' | 'historique' | 'plannings'>('modeles');
  const modeles = useDonnees<ModeleVue[]>('/taches/modeles', 10_000);
  const travaux = useDonnees<Omit<Travail, 'sortie'>[]>('/taches/travaux', 5_000);
  const plannings = useDonnees<Planning[]>('/taches/plannings', 30_000);
  const { peut, etat } = useSupervision();
  const [lancement, setLancement] = useState<ModeleVue | null>(null);
  const [edition, setEdition] = useState<ModeleVue | 'nouveau' | null>(null);
  const [planifier, setPlanifier] = useState(false);
  const naviguer = useNavigate();
  const aApprouver = travaux.donnees?.filter((t) => t.statut === 'approbation') ?? [];
  const nom = (id: string) => modeles.donnees?.find((m) => m.id === id)?.nom ?? '(modèle supprimé)';

  return (
    <div className="empile">
      <div className="encadre">
        <strong>Comment ça marche :</strong> un <strong>modèle de tâche</strong> lance un script du dossier <code>scripts/</code> (monté en lecture seule) — jamais autre chose,
        sans shell, et un paramètre ne peut prendre qu’une valeur prévue. Un agent lance la tâche ; si le modèle est <strong>sensible</strong>, un approbateur (autre que lui) doit
        d’abord accepter. La sortie s’affiche <strong>en direct</strong>, tout est gardé dans l’historique, un échec prévient l’équipe. Les <strong>plannings</strong> lancent une
        tâche toutes les heures, chaque jour ou chaque semaine.
        {etat?.sources.mode === 'demo' && ' En démonstration, les tâches sont simulées : aucun script n’est lancé.'}
      </div>

      {aApprouver.length > 0 && (
        <div className="encadre orange">
          <strong>{aApprouver.length} tâche(s) attendent une approbation :</strong>{' '}
          {aApprouver.map((t) => (
            <Link key={t.id} to={`/taches/${t.id}`} style={{ marginRight: 10 }}>
              #{t.id} {t.nom}
              {t.valeur ? ` (${t.valeur})` : ''}
            </Link>
          ))}
        </div>
      )}

      <div className="ligne-flex">
        <div className="onglets">
          {(
            [
              ['modeles', 'Modèles'],
              ['historique', 'Historique'],
              ['plannings', 'Plannings'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={onglet === k ? 'actif' : ''} onClick={() => setOnglet(k)}>
              {l}
            </button>
          ))}
        </div>
        <span className="espace" />
        {onglet === 'modeles' && peut('administrer') && (
          <button className="bouton primaire" onClick={() => setEdition('nouveau')}>
            <Plus size={15} /> Nouveau modèle
          </button>
        )}
        {onglet === 'plannings' && peut('agir') && (
          <button className="bouton primaire" onClick={() => setPlanifier(true)}>
            <CalendarClock size={15} /> Planifier
          </button>
        )}
      </div>

      {onglet === 'modeles' && (
        <Charge etat={modeles}>
          {(liste) => (
            <div className="grille g3">
              {liste.map((m) => (
                <Carte
                  key={m.id}
                  titre={m.nom}
                  sousTitre={
                    <>
                      <code>{m.script}</code>
                      {m.approbation && ' · approbation requise'}
                      {!m.actif && ' · désactivé'}
                    </>
                  }
                  droite={
                    peut('administrer') && (
                      <button className="icone-bouton" title="Modifier" onClick={() => setEdition(m)}>
                        <Pencil size={14} />
                      </button>
                    )
                  }
                >
                  <p style={{ fontSize: '0.84rem', minHeight: 40 }}>{m.description}</p>
                  {!m.scriptPresent && (
                    <div className="discret" style={{ fontSize: '0.76rem' }}>
                      Script absent du dossier des scripts
                    </div>
                  )}
                  <div className="ligne-flex" style={{ marginTop: 10 }}>
                    {m.dernier ? (
                      <Link to={`/taches/${m.dernier.id}`} className="ligne-flex" style={{ gap: 6 }}>
                        <PastilleTravail s={m.dernier.statut} />
                        <span className="discret">{depuis(m.dernier.creeLe)}</span>
                      </Link>
                    ) : (
                      <span className="discret">Jamais lancée</span>
                    )}
                    <span className="espace" />
                    {peut('agir') && m.actif && (
                      <button className="bouton primaire petit" onClick={() => setLancement(m)}>
                        <Play size={13} /> Lancer
                      </button>
                    )}
                  </div>
                </Carte>
              ))}
            </div>
          )}
        </Charge>
      )}

      {onglet === 'historique' && (
        <Carte serree>
          <Charge etat={travaux}>
            {(liste) =>
              liste.length ? (
                <div className="tableau-conteneur">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Tâche</th>
                        <th>État</th>
                        <th>Lancée par</th>
                        <th>Début</th>
                        <th>Durée</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liste.map((t) => (
                        <tr key={t.id} className="ligne-cliquable" onClick={() => naviguer(`/taches/${t.id}`)}>
                          <td>
                            <strong>{t.id}</strong>
                          </td>
                          <td>
                            {t.nom}
                            {t.valeur && <span className="discret"> · {t.valeur}</span>}
                            {t.simule && <span className="discret"> · simulée</span>}
                          </td>
                          <td>
                            <PastilleTravail s={t.statut} />
                          </td>
                          <td>{t.lancePar}</td>
                          <td className="discret">{dateHeure(t.debut ?? t.creeLe)}</td>
                          <td className="discret">{t.debut ? duree(((t.fin ?? Date.now()) - t.debut) / 1000) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Vide>Aucune tâche lancée pour l’instant.</Vide>
              )
            }
          </Charge>
        </Carte>
      )}

      {onglet === 'plannings' && (
        <Carte serree>
          <Charge etat={plannings}>
            {(liste) =>
              liste.length ? (
                <div className="tableau-conteneur">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Tâche</th>
                        <th>Quand</th>
                        <th>Prochaine</th>
                        <th>Créé par</th>
                        <th>Actif</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {liste.map((p) => (
                        <tr key={p.id}>
                          <td>
                            {nom(p.modeleId)}
                            {p.valeur && <span className="discret"> · {p.valeur}</span>}
                          </td>
                          <td>
                            {LIBELLE_FREQUENCE[p.frequence]}
                            {p.frequence === 'horaire' ? ` à la minute ${p.heure.slice(3)}` : ` à ${p.heure}`}
                            {p.frequence === 'hebdomadaire' && `, le ${JOURS[p.jour]}`}
                          </td>
                          <td className="discret">{p.actif ? dateHeure(p.prochain) : '—'}</td>
                          <td>{p.creePar}</td>
                          <td>
                            <input
                              type="checkbox"
                              checked={p.actif}
                              disabled={!peut('agir')}
                              aria-label="Actif"
                              onChange={async (e) => {
                                await appeler(`/taches/plannings/${p.id}`, { methode: 'PATCH', corps: { actif: e.target.checked } });
                                void plannings.recharger();
                              }}
                            />
                          </td>
                          <td>
                            {peut('agir') && (
                              <button
                                className="icone-bouton"
                                title="Supprimer"
                                onClick={async () => {
                                  if (!confirm('Supprimer ce planning ?')) return;
                                  await appeler(`/taches/plannings/${p.id}`, { methode: 'DELETE' });
                                  void plannings.recharger();
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Vide>Aucun planning. Exemple : « Vérifier les services » toutes les heures, « Tester la restauration » chaque dimanche à 03:00.</Vide>
              )
            }
          </Charge>
        </Carte>
      )}

      {lancement && (
        <Lancer
          modele={lancement}
          fermer={() => setLancement(null)}
          lance={(t) => {
            setLancement(null);
            naviguer(`/taches/${t.id}`);
          }}
        />
      )}
      {edition && (
        <EditionModele
          initial={edition === 'nouveau' ? null : edition}
          fermer={() => setEdition(null)}
          fait={() => {
            setEdition(null);
            void modeles.recharger();
          }}
        />
      )}
      {planifier && modeles.donnees && (
        <NouveauPlanning
          modeles={modeles.donnees}
          fermer={() => setPlanifier(false)}
          fait={() => {
            setPlanifier(false);
            void plannings.recharger();
          }}
        />
      )}
    </div>
  );
}

function Lancer({ modele, fermer, lance }: { modele: ModeleVue; fermer: () => void; lance: (t: Travail) => void }) {
  const [valeur, setValeur] = useState(modele.parametre?.choix[0] ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <Modale titre={`Lancer « ${modele.nom} »`} fermer={fermer}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            lance(await appeler<Travail>(`/taches/modeles/${modele.id}/lancer`, { methode: 'POST', corps: { valeur } }));
          } catch (x) {
            setErreur((x as Error).message);
          }
        }}
      >
        <p style={{ fontSize: '0.86rem' }}>{modele.description}</p>
        {modele.parametre && (
          <div className="champ-groupe">
            <label className="etiquette">{modele.parametre.libelle}</label>
            <select className="champ" value={valeur} onChange={(e) => setValeur(e.target.value)} autoFocus>
              {modele.parametre.choix.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
        {modele.approbation && (
          <div className="encadre orange" style={{ marginTop: 12 }}>
            Tâche sensible : elle partira quand un approbateur l’aura acceptée.
          </div>
        )}
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
            <Play size={14} /> {modele.approbation ? 'Demander l’approbation' : 'Lancer'}
          </button>
        </div>
      </form>
    </Modale>
  );
}

function EditionModele({ initial, fermer, fait }: { initial: ModeleVue | null; fermer: () => void; fait: () => void }) {
  const [d, setD] = useState({
    nom: initial?.nom ?? '',
    description: initial?.description ?? '',
    script: initial?.script ?? '',
    arguments: initial?.arguments.join(' ') ?? '',
    parametreNom: initial?.parametre?.nom ?? '',
    parametreLibelle: initial?.parametre?.libelle ?? '',
    choix: initial?.parametre?.choix.join(', ') ?? '',
    approbation: initial?.approbation ?? false,
    delaiMinutes: initial?.delaiMinutes ?? 15,
    actif: initial?.actif ?? true,
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = (k: keyof typeof d) => ({ value: String(d[k]), onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }) });
  return (
    <Modale titre={initial ? `Modifier « ${initial.nom} »` : 'Nouveau modèle de tâche'} fermer={fermer} large>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const corps = {
            nom: d.nom,
            description: d.description,
            script: d.script,
            arguments: d.arguments.split(/\s+/).filter(Boolean),
            parametre: d.parametreNom ? { nom: d.parametreNom, libelle: d.parametreLibelle, choix: d.choix.split(',').map((c) => c.trim()) } : null,
            approbation: d.approbation,
            delaiMinutes: Number(d.delaiMinutes),
            actif: d.actif,
          };
          try {
            await appeler(initial ? `/taches/modeles/${initial.id}` : '/taches/modeles', { methode: initial ? 'PATCH' : 'POST', corps });
            fait();
          } catch (x) {
            setErreur((x as Error).message);
          }
        }}
      >
        <div className="grille g2" style={{ gap: 12 }}>
          <div className="champ-groupe">
            <label className="etiquette">Nom</label>
            <input className="champ" required {...champ('nom')} />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Script (dans le dossier des scripts)</label>
            <input className="champ" required placeholder="sauvegarder.sh" {...champ('script')} />
          </div>
        </div>
        <div className="champ-groupe">
          <label className="etiquette">Description (ce que fait la tâche, ses risques)</label>
          <textarea className="champ" rows={2} {...champ('description')} />
        </div>
        <div className="grille g2" style={{ gap: 12 }}>
          <div className="champ-groupe">
            <label className="etiquette">Arguments fixes (séparés par des espaces)</label>
            <input className="champ" {...champ('arguments')} />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Délai maximum (minutes)</label>
            <input className="champ" type="number" min={1} max={240} {...champ('delaiMinutes')} />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Paramètre demandé au lancement (facultatif)</label>
            <input className="champ" placeholder="service" {...champ('parametreNom')} />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Libellé du paramètre</label>
            <input className="champ" placeholder="Service à redémarrer" {...champ('parametreLibelle')} />
          </div>
        </div>
        {d.parametreNom && (
          <div className="champ-groupe">
            <label className="etiquette">Valeurs autorisées (séparées par des virgules)</label>
            <input className="champ" required {...champ('choix')} />
          </div>
        )}
        <label className="ligne-flex" style={{ marginTop: 12, gap: 8, fontSize: '0.86rem' }}>
          <input type="checkbox" checked={d.approbation} onChange={(e) => setD({ ...d, approbation: e.target.checked })} /> Sensible : un approbateur doit accepter chaque lancement
        </label>
        <label className="ligne-flex" style={{ marginTop: 8, gap: 8, fontSize: '0.86rem' }}>
          <input type="checkbox" checked={d.actif} onChange={(e) => setD({ ...d, actif: e.target.checked })} /> Actif
        </label>
        {erreur && (
          <div className="erreur" style={{ marginTop: 12 }}>
            {erreur}
          </div>
        )}
        <div className="ligne-flex" style={{ marginTop: 16 }}>
          {initial && (
            <button
              type="button"
              className="bouton danger"
              onClick={async () => {
                if (!confirm(`Supprimer « ${initial.nom} » et ses plannings ?`)) return;
                await appeler(`/taches/modeles/${initial.id}`, { methode: 'DELETE' });
                fait();
              }}
            >
              Supprimer
            </button>
          )}
          <span className="espace" />
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

function NouveauPlanning({ modeles, fermer, fait }: { modeles: ModeleVue[]; fermer: () => void; fait: () => void }) {
  const [modeleId, setModeleId] = useState(modeles[0]?.id ?? '');
  const [frequence, setFrequence] = useState('quotidien');
  const [heure, setHeure] = useState('03:00');
  const [jour, setJour] = useState(0);
  const m = modeles.find((x) => x.id === modeleId);
  const [valeur, setValeur] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <Modale titre="Planifier une tâche" fermer={fermer}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await appeler('/taches/plannings', { methode: 'POST', corps: { modeleId, frequence, heure, jour, valeur: valeur || m?.parametre?.choix[0] } });
            fait();
          } catch (x) {
            setErreur((x as Error).message);
          }
        }}
      >
        <div className="champ-groupe">
          <label className="etiquette">Tâche</label>
          <select className="champ" value={modeleId} onChange={(e) => setModeleId(e.target.value)}>
            {modeles.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nom}
              </option>
            ))}
          </select>
        </div>
        {m?.parametre && (
          <div className="champ-groupe">
            <label className="etiquette">{m.parametre.libelle}</label>
            <select className="champ" value={valeur} onChange={(e) => setValeur(e.target.value)}>
              {m.parametre.choix.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
        <div className="grille g3" style={{ gap: 12 }}>
          <div className="champ-groupe">
            <label className="etiquette">Fréquence</label>
            <select className="champ" value={frequence} onChange={(e) => setFrequence(e.target.value)}>
              {Object.entries(LIBELLE_FREQUENCE).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">{frequence === 'horaire' ? 'Minute (HH:MM, HH ignoré)' : 'Heure'}</label>
            <input className="champ" type="time" value={heure} onChange={(e) => setHeure(e.target.value)} required />
          </div>
          {frequence === 'hebdomadaire' && (
            <div className="champ-groupe">
              <label className="etiquette">Jour</label>
              <select className="champ" value={jour} onChange={(e) => setJour(Number(e.target.value))}>
                {JOURS.map((j, i) => (
                  <option key={j} value={i}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {m?.approbation && <p className="discret">Ce modèle est sensible : le planifier vaut approbation, réservé aux approbateurs.</p>}
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
            Planifier
          </button>
        </div>
      </form>
    </Modale>
  );
}

/** /taches/:id — une exécution, sa sortie en direct, ses actions. */
export function FicheTravail() {
  const { id } = useParams();
  const etat = useDonnees<Travail>(`/taches/travaux/${id}`, 1_000);
  const { peut, nom } = useSupervision();
  const [erreur, setErreur] = useState<string | null>(null);
  const sortie = useRef<HTMLPreElement>(null);
  const t = etat.donnees;
  useEffect(() => {
    const el = sortie.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [t?.sortie]);
  const agir = async (chemin: string, corps: unknown = {}) => {
    setErreur(null);
    try {
      etat.remplacer(await appeler<Travail>(chemin, { methode: 'POST', corps }));
    } catch (x) {
      setErreur((x as Error).message);
    }
  };
  return (
    <div className="empile">
      <Link to="/taches" className="ligne-flex discret" style={{ gap: 6 }}>
        <ArrowLeft size={14} /> Toutes les tâches
      </Link>
      {etat.erreur && !t ? (
        <Erreur message={etat.erreur} />
      ) : !t ? (
        <Squelette hauteur={400} />
      ) : (
        <Carte
          titre={`#${t.id} — ${t.nom}${t.valeur ? ` (${t.valeur})` : ''}`}
          sousTitre={`Demandée par ${t.lancePar} ${depuis(t.creeLe)}${t.approuvePar ? ` · décision : ${t.approuvePar}` : ''}${t.debut ? ` · durée ${duree(((t.fin ?? Date.now()) - t.debut) / 1000)}` : ''}${t.code !== null ? ` · code ${t.code}` : ''}${t.simule ? ' · simulée (démonstration)' : ''}`}
          droite={<PastilleTravail s={t.statut} />}
        >
          <div className="ligne-flex" style={{ marginBottom: 12 }}>
            {t.statut === 'approbation' && peut('approuver') && t.lancePar !== nom && (
              <>
                <button className="bouton primaire" onClick={() => void agir(`/taches/travaux/${t.id}/decision`, { decision: 'approuve' })}>
                  Approuver et lancer
                </button>
                <button className="bouton danger" onClick={() => void agir(`/taches/travaux/${t.id}/decision`, { decision: 'refuse' })}>
                  Refuser
                </button>
              </>
            )}
            {t.statut === 'approbation' && (t.lancePar === nom || !peut('approuver')) && <span className="discret">En attente d’un approbateur (autre que le demandeur).</span>}
            {!estTermine(t.statut) && peut('agir') && (
              <button className="bouton" onClick={() => void agir(`/taches/travaux/${t.id}/annuler`)}>
                <Square size={13} /> Annuler
              </button>
            )}
          </div>
          {erreur && <div className="erreur">{erreur}</div>}
          <pre ref={sortie} className="sortie-terminal">
            {t.sortie || (t.statut === 'approbation' ? 'La tâche partira après approbation.' : 'En attente…')}
          </pre>
        </Carte>
      )}
    </div>
  );
}
