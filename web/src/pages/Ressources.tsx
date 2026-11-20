import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellOff, CalendarOff, CheckCheck, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, Modale, Pastille, Vide } from '../components/ui';
import { useSupervision } from '../components/Coquille';
import { dateHeure, depuis, pourcent } from '../../../shared/format';
import { LIBELLE_ETAT_RESSOURCE, STATUT_DE_ETAT, TENTATIVES_MAX, type EtatRessource, type LigneRapport, type Transition, type VueRessources } from '../../../shared/ressources';

const ETATS: EtatRessource[] = ['critique', 'avertissement', 'inconnu', 'ok'];

function PastilleEtat({ e }: { e: EtatRessource }) {
  return <Pastille statut={STATUT_DE_ETAT[e]}>{LIBELLE_ETAT_RESSOURCE[e]}</Pastille>;
}

export default function Ressources() {
  const [onglet, setOnglet] = useState<'ressources' | 'journal' | 'rapport'>('ressources');
  return (
    <div className="empile">
      <div className="encadre">
        <strong>Comment ça marche :</strong> chaque <strong>hôte</strong> (serveur, docker, services, site public, API, PostgreSQL…) et chacun de ses <strong>contrôles</strong>,
        repris des mesures de la supervision toutes les 30 s : <strong>OK</strong>, <strong>Avertissement</strong>, <strong>Critique</strong> ou <strong>Inconnu</strong>. Un
        problème n’est <strong>confirmé</strong> qu’après {TENTATIVES_MAX} contrôles identiques (évite les fausses alertes) ; un retour à OK l’est tout de suite.{' '}
        <strong>Acquittez</strong> un problème pris en main (« je m’en occupe ») ; posez un <strong>arrêt planifié</strong> pendant une maintenance. Le <strong>journal</strong>{' '}
        garde chaque changement d’état 31 jours et sert aux <strong>rapports de disponibilité</strong>.
      </div>
      <div className="onglets" style={{ alignSelf: 'flex-start' }}>
        {(
          [
            ['ressources', 'Ressources'],
            ['journal', 'Journal des événements'],
            ['rapport', 'Disponibilité'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={onglet === k ? 'actif' : ''} onClick={() => setOnglet(k)}>
            {l}
          </button>
        ))}
      </div>
      {onglet === 'ressources' && <Liste />}
      {onglet === 'journal' && <Journal />}
      {onglet === 'rapport' && <Rapport />}
    </div>
  );
}

function Liste() {
  const etat = useDonnees<VueRessources>('/ressources', 15_000);
  const { peut } = useSupervision();
  const [vue, setVue] = useState<'a-traiter' | 'problemes' | 'tout'>('a-traiter');
  const [hote, setHote] = useState('');
  const [q, setQ] = useState('');
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<'acquitter' | 'arret' | null>(null);
  const [controle, setControle] = useState(false);

  const hotes = useMemo(() => [...new Set(etat.donnees?.ressources.map((r) => r.hote) ?? [])].sort(), [etat.donnees]);
  const liste = (etat.donnees?.ressources ?? []).filter(
    (r) =>
      (vue === 'tout' || (r.etat !== 'ok' && (vue === 'problemes' || (!r.acquittement && !r.enArret)))) &&
      (!hote || r.hote === hote) &&
      (!q || `${r.hote} ${r.nom} ${r.sortie}`.toLowerCase().includes(q.toLowerCase())),
  );
  const basculer = (cle: string) => {
    const s = new Set(choix);
    if (s.has(cle)) s.delete(cle);
    else s.add(cle);
    setChoix(s);
  };

  return (
    <Charge etat={etat}>
      {(v) => (
        <>
          <div className="grille g4">
            {ETATS.map((e) => {
              const n = v.ressources.filter((r) => r.etat === e).length;
              const nonTraites = v.ressources.filter((r) => r.etat === e && !r.acquittement && !r.enArret).length;
              return (
                <button
                  key={e}
                  className={`mesure ${n ? STATUT_DE_ETAT[e] : 'inconnu'}`}
                  style={{ textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => {
                    setVue(e === 'ok' ? 'tout' : 'problemes');
                    setQ('');
                  }}
                >
                  <div className="mesure-tete">{LIBELLE_ETAT_RESSOURCE[e]}</div>
                  <div className="mesure-valeur">{n}</div>
                  {e !== 'ok' && <div className="mesure-detail">{nonTraites} non traité(s)</div>}
                </button>
              );
            })}
          </div>

          <Carte serree>
            <div className="filtres" style={{ padding: '16px 20px' }}>
              <div className="onglets">
                {(
                  [
                    ['a-traiter', 'Problèmes à traiter'],
                    ['problemes', 'Tous les problèmes'],
                    ['tout', 'Tout'],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} className={vue === k ? 'actif' : ''} onClick={() => setVue(k)}>
                    {l}
                  </button>
                ))}
              </div>
              <select className="champ" value={hote} onChange={(e) => setHote(e.target.value)} aria-label="Hôte">
                <option value="">Tous les hôtes</option>
                {hotes.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
              <div className="recherche" style={{ display: 'block', flex: 1, minWidth: 180 }}>
                <Search size={16} />
                <input style={{ width: '100%' }} placeholder="Contrôle, sortie…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {peut('agir') && (
                <>
                  <button className="bouton" disabled={!choix.size} onClick={() => setAction('acquitter')}>
                    <CheckCheck size={14} /> Acquitter
                  </button>
                  <button className="bouton" disabled={!choix.size} onClick={() => setAction('arret')}>
                    <CalendarOff size={14} /> Arrêt planifié
                  </button>
                  <button
                    className="bouton"
                    disabled={controle}
                    title="Relire toutes les sources maintenant"
                    onClick={async () => {
                      setControle(true);
                      try {
                        etat.remplacer(await appeler<VueRessources>('/ressources/controler', { methode: 'POST', corps: {} }));
                      } finally {
                        setControle(false);
                      }
                    }}
                  >
                    <RefreshCw size={14} className={controle ? 'tourne' : ''} /> Contrôler maintenant
                  </button>
                </>
              )}
            </div>
            <div className="discret" style={{ padding: '0 20px 10px', fontSize: '0.76rem' }}>
              Dernier contrôle : {v.controleLe ? dateHeure(v.controleLe) : 'en cours (premier tour de la boucle)'} · {v.ressources.length} contrôles
            </div>
            {liste.length ? (
              <div className="tableau-conteneur">
                <table className="tableau">
                  <thead>
                    <tr>
                      {peut('agir') && (
                        <th style={{ width: 32 }}>
                          <input
                            type="checkbox"
                            aria-label="Tout sélectionner"
                            checked={liste.length > 0 && liste.every((r) => choix.has(r.cle))}
                            onChange={(e) => setChoix(e.target.checked ? new Set(liste.map((r) => r.cle)) : new Set())}
                          />
                        </th>
                      )}
                      <th>État</th>
                      <th>Hôte</th>
                      <th>Contrôle</th>
                      <th>Sortie</th>
                      <th>Depuis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((r) => (
                      <tr key={r.cle}>
                        {peut('agir') && (
                          <td>
                            <input type="checkbox" aria-label={`Choisir ${r.nom}`} checked={choix.has(r.cle)} onChange={() => basculer(r.cle)} />
                          </td>
                        )}
                        <td>
                          <PastilleEtat e={r.etat} />
                          {!r.confirme && (
                            <div className="discret" style={{ fontSize: '0.7rem' }} title="Pas encore confirmé">
                              à confirmer {r.tentatives}/{TENTATIVES_MAX}
                            </div>
                          )}
                        </td>
                        <td>{r.hote}</td>
                        <td>
                          <Link to={r.lien}>{r.nom}</Link>
                          <div className="chips" style={{ marginTop: 3 }}>
                            {r.acquittement && (
                              <span className="pastille violet" title={`${r.acquittement.commentaire} — ${dateHeure(r.acquittement.le)}`}>
                                Acquitté par {r.acquittement.par}
                                {peut('agir') && (
                                  <button
                                    className="puce-retirer"
                                    aria-label="Retirer l’acquittement"
                                    onClick={async () => etat.remplacer(await appeler<VueRessources>(`/ressources/acquitter/${encodeURIComponent(r.cle)}`, { methode: 'DELETE' }))}
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            )}
                            {r.enArret && (
                              <span className="pastille bleu">
                                <BellOff size={11} /> Arrêt planifié
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ maxWidth: 420, fontSize: '0.82rem' }}>{r.sortie}</td>
                        <td className="discret" title={dateHeure(r.depuis)}>
                          {depuis(r.depuis)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Vide icone={<CheckCheck size={28} />}>{vue === 'tout' ? 'Aucun contrôle ne correspond.' : 'Aucun problème à traiter. 🎉'}</Vide>
            )}
          </Carte>

          {!!v.arrets.length && (
            <Carte titre="Arrêts planifiés" sousTitre="Pendant un arrêt, un problème ne compte pas comme « à traiter » et ne s’affiche pas dans le fil d’activité">
              {v.arrets.map((a) => (
                <div key={a.id} className="ligne-flex" style={{ fontSize: '0.84rem', padding: '6px 0', borderBottom: '1px solid var(--bord)' }}>
                  <strong>{a.cible.startsWith('hote:') ? `Hôte ${a.cible.slice(5)}` : a.cible}</strong>
                  <span className="discret">
                    {dateHeure(a.debut)} → {dateHeure(a.fin)} · {a.par} · {a.commentaire}
                  </span>
                  <span className="espace" />
                  {peut('agir') && (
                    <button
                      className="icone-bouton"
                      title="Supprimer l’arrêt"
                      onClick={async () => etat.remplacer(await appeler<VueRessources>(`/ressources/arrets/${a.id}`, { methode: 'DELETE' }))}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </Carte>
          )}

          {action && (
            <ActionGroupee
              action={action}
              cles={[...choix]}
              hotes={[...new Set(v.ressources.filter((r) => choix.has(r.cle)).map((r) => r.hote))]}
              fermer={() => setAction(null)}
              fait={(nv) => {
                etat.remplacer(nv);
                setChoix(new Set());
                setAction(null);
              }}
            />
          )}
        </>
      )}
    </Charge>
  );
}

function ActionGroupee({
  action,
  cles,
  hotes,
  fermer,
  fait,
}: {
  action: 'acquitter' | 'arret';
  cles: string[];
  hotes: string[];
  fermer: () => void;
  fait: (v: VueRessources) => void;
}) {
  const [commentaire, setCommentaire] = useState('');
  const [heures, setHeures] = useState(2);
  const [toutLHote, setToutLHote] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <Modale titre={action === 'acquitter' ? `Acquitter ${cles.length} problème(s)` : `Arrêt planifié (${cles.length} contrôle(s))`} fermer={fermer}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErreur(null);
          try {
            if (action === 'acquitter') {
              fait(await appeler<VueRessources>('/ressources/acquitter', { methode: 'POST', corps: { cles, commentaire } }));
            } else {
              const debut = Date.now();
              let v: VueRessources | null = null;
              for (const cible of toutLHote ? hotes.map((h) => `hote:${h}`) : cles)
                v = await appeler<VueRessources>('/ressources/arrets', { methode: 'POST', corps: { cible, debut, fin: debut + heures * 3_600_000, commentaire } });
              if (v) fait(v);
            }
          } catch (x) {
            setErreur((x as Error).message);
          }
        }}
      >
        {action === 'arret' && (
          <>
            <div className="champ-groupe">
              <label className="etiquette">Durée (heures, à partir de maintenant)</label>
              <input className="champ" type="number" min={0.25} max={168} step={0.25} value={heures} onChange={(e) => setHeures(Number(e.target.value))} />
            </div>
            <label className="ligne-flex" style={{ marginTop: 10, gap: 8, fontSize: '0.86rem' }}>
              <input type="checkbox" checked={toutLHote} onChange={(e) => setToutLHote(e.target.checked)} /> Tout l’hôte ({hotes.join(', ')}), pas seulement ces contrôles
            </label>
          </>
        )}
        <div className="champ-groupe">
          <label className="etiquette">{action === 'acquitter' ? 'Ce que vous faites' : 'Raison (maintenance, mise à jour…)'}</label>
          <textarea className="champ" rows={2} required value={commentaire} onChange={(e) => setCommentaire(e.target.value)} autoFocus />
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
            {action === 'acquitter' ? 'Acquitter' : 'Planifier l’arrêt'}
          </button>
        </div>
      </form>
    </Modale>
  );
}

function Journal() {
  const etat = useDonnees<Transition[]>('/ressources/journal', 30_000);
  return (
    <Carte serree titre="Journal des événements" sousTitre="Chaque changement d’état confirmé, le plus récent d’abord (300 derniers)">
      <Charge etat={etat}>
        {(liste) =>
          liste.length ? (
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Quand</th>
                    <th>État</th>
                    <th>Hôte</th>
                    <th>Contrôle</th>
                    <th>Sortie</th>
                  </tr>
                </thead>
                <tbody>
                  {liste.map((t, i) => (
                    <tr key={`${t.t}-${t.cle}-${i}`}>
                      <td className="discret">{dateHeure(t.t)}</td>
                      <td>
                        <PastilleEtat e={t.etat} />
                      </td>
                      <td>{t.hote}</td>
                      <td>{t.nom}</td>
                      <td style={{ fontSize: '0.82rem' }}>{t.sortie}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Vide>Pas encore d’événement.</Vide>
          )
        }
      </Charge>
    </Carte>
  );
}

function Rapport() {
  const [jours, setJours] = useState(7);
  const etat = useDonnees<{ debut: number; fin: number; lignes: LigneRapport[] }>(`/ressources/rapport?jours=${jours}`, 0);
  const [hote, setHote] = useState('');
  return (
    <Carte
      serree
      titre="Disponibilité"
      sousTitre="Part du temps passé dans chaque état, d’après le journal. « Non mesuré » : avant le premier contrôle."
      droite={
        <div className="onglets">
          {[1, 7, 30].map((j) => (
            <button key={j} className={jours === j ? 'actif' : ''} onClick={() => setJours(j)}>
              {j === 1 ? '24 h' : `${j} jours`}
            </button>
          ))}
        </div>
      }
    >
      <Charge etat={etat}>
        {(r) => {
          const hotes = [...new Set(r.lignes.map((l) => l.hote))].sort();
          const lignes = r.lignes.filter((l) => !hote || l.hote === hote).sort((a, b) => a.ok - b.ok);
          return (
            <>
              <div className="filtres" style={{ padding: '0 20px 12px' }}>
                <select className="champ" value={hote} onChange={(e) => setHote(e.target.value)} aria-label="Hôte">
                  <option value="">Tous les hôtes</option>
                  {hotes.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
                <span className="discret">
                  Du {dateHeure(r.debut)} au {dateHeure(r.fin)} · les moins disponibles d’abord
                </span>
              </div>
              {lignes.length ? (
                <div className="tableau-conteneur">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Hôte</th>
                        <th>Contrôle</th>
                        <th style={{ width: '32%' }}>Répartition</th>
                        <th>OK</th>
                        <th>Avert.</th>
                        <th>Critique</th>
                        <th>Pannes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((l) => (
                        <tr key={l.cle}>
                          <td>{l.hote}</td>
                          <td>{l.nom}</td>
                          <td>
                            <div className="barre-repartition" title={`Non mesuré ${pourcent(l.nonMesure * 100, 1)} · Inconnu ${pourcent(l.inconnu * 100, 1)}`}>
                              <span className="vert" style={{ width: `${l.ok * 100}%` }} />
                              <span className="orange" style={{ width: `${l.avertissement * 100}%` }} />
                              <span className="rouge" style={{ width: `${l.critique * 100}%` }} />
                              <span className="inconnu" style={{ width: `${(l.inconnu + l.nonMesure) * 100}%` }} />
                            </div>
                          </td>
                          <td>
                            <strong>{pourcent(l.ok * 100, 2)}</strong>
                          </td>
                          <td className="discret">{pourcent(l.avertissement * 100, 2)}</td>
                          <td className={l.critique ? 'texte-rouge' : 'discret'}>{pourcent(l.critique * 100, 2)}</td>
                          <td>{l.pannes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Vide>Pas encore de contrôle.</Vide>
              )}
            </>
          );
        }}
      </Charge>
    </Carte>
  );
}
