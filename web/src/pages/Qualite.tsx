import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bug, FileUp, Search } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, Erreur, Modale, Pastille, Squelette, Vide } from '../components/ui';
import { Barres, Courbe } from '../components/graphiques';
import { useSupervision } from '../components/Coquille';
import { dateHeure, depuis } from '../../../shared/format';
import {
  LIBELLE_ACTION,
  LIBELLE_CLASSIFICATION,
  LIBELLE_ETAT_DEFAUT,
  LIBELLE_GRAVITE,
  LIBELLE_IMPACT,
  type DefautVue,
  type EtatDefaut,
  type Impact,
  type VueQualite,
} from '../../../shared/qualite';

const COULEUR_IMPACT: Record<Impact, 'rouge' | 'orange' | 'inconnu'> = { eleve: 'rouge', moyen: 'orange', faible: 'inconnu' };
const COULEUR_ETAT: Record<EtatDefaut, 'rouge' | 'orange' | 'vert' | 'inconnu'> = { nouveau: 'rouge', 'en-cours': 'orange', corrige: 'vert', ecarte: 'inconnu' };

export default function Qualite() {
  const [projet, setProjet] = useState('');
  const synthese = useDonnees<VueQualite>(`/qualite${projet ? `?projet=${encodeURIComponent(projet)}` : ''}`, 60_000);
  const [etat, setEtat] = useState('nouveau,en-cours');
  const [impact, setImpact] = useState('');
  const [recherche, setRecherche] = useState('');
  const [q, setQ] = useState('');
  const [ouvert, setOuvert] = useState<number | null>(null);
  const p = projet || synthese.donnees?.projets[0] || '';
  const params = new URLSearchParams({ etat, ...(p ? { projet: p } : {}), ...(impact ? { impact } : {}), ...(q ? { q } : {}) });
  const defauts = useDonnees<DefautVue[]>(`/qualite/defauts?${params}`, 60_000);
  const { peut } = useSupervision();

  const recharger = () => {
    void synthese.recharger();
    void defauts.recharger();
  };

  return (
    <div className="empile">
      <div className="encadre">
        <strong>Comment ça marche :</strong> à chaque construction, le CI lance un analyseur (Semgrep, CodeQL, ESLint…) et envoie son rapport <strong>SARIF</strong> ici. Chaque
        défaut reçoit un numéro stable (<strong>CID</strong>) : on voit ce qui est <strong>nouveau</strong>, ce qui <strong>reste à traiter</strong> et ce qui a été{' '}
        <strong>corrigé</strong>. L’équipe trie (bug, faux positif, intentionnel), désigne un propriétaire et ouvre un problème en un clic. <strong>Politique</strong> : aucun
        nouveau défaut d’impact élevé — sinon l’envoi répond 422 et le CI peut bloquer la mise en production.
      </div>

      <Charge etat={synthese}>
        {(v) =>
          !v.analyses.length ? (
            <Carte titre="Aucune analyse reçue">
              <AideCi />
              {peut('agir') && <Importer projet={p} fait={recharger} />}
            </Carte>
          ) : (
            <>
              <div className="ligne-flex">
                {v.projets.length > 1 && (
                  <select className="champ" value={p} onChange={(e) => setProjet(e.target.value)} aria-label="Projet">
                    {v.projets.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                )}
                <span className="discret">
                  Dernière analyse #{v.analyses[0].id} · {v.analyses[0].branche}
                  {v.analyses[0].commit && ` @ ${v.analyses[0].commit.slice(0, 8)}`} · {depuis(v.analyses[0].le)} · {v.analyses[0].outils.join(', ')}
                </span>
                <span className="espace" />
                <Pastille statut={v.analyses[0].politique.respectee ? 'vert' : 'rouge'}>Politique {v.analyses[0].politique.respectee ? 'respectée' : 'non respectée'}</Pastille>
                {peut('agir') && <Importer projet={p} fait={recharger} />}
              </div>
              {!v.analyses[0].politique.respectee && <div className="encadre rouge">{v.analyses[0].politique.raison}</div>}

              <div className="grille g4">
                {(['eleve', 'moyen', 'faible'] as Impact[]).map((i) => (
                  <button
                    key={i}
                    className={`mesure ${v.aTraiter[i] ? COULEUR_IMPACT[i] : 'vert'}`}
                    style={{ textAlign: 'left', cursor: 'pointer' }}
                    onClick={() => {
                      setEtat('nouveau,en-cours');
                      setImpact(i);
                    }}
                  >
                    <div className="mesure-tete">À traiter · impact {LIBELLE_IMPACT[i].toLowerCase()}</div>
                    <div className="mesure-valeur">{v.aTraiter[i]}</div>
                  </button>
                ))}
                <div className="mesure vert">
                  <div className="mesure-tete">Corrigés (30 j)</div>
                  <div className="mesure-valeur">{v.corriges30j}</div>
                  <div className="mesure-detail">{v.nonClasses} défaut(s) encore non classé(s)</div>
                </div>
              </div>

              <div className="grille g2">
                <Carte titre="Tendance" sousTitre="Défauts présents et nouveaux, analyse par analyse">
                  <Courbe
                    hauteur={220}
                    series={[
                      { nom: 'Présents', points: [...v.analyses].reverse().map((a) => ({ t: a.le, v: a.total })) },
                      { nom: 'Nouveaux', points: [...v.analyses].reverse().map((a) => ({ t: a.le, v: a.nouveaux })), couleur: '#dc2626' },
                      { nom: 'Corrigés', points: [...v.analyses].reverse().map((a) => ({ t: a.le, v: a.corriges })), couleur: '#16a34a', pointilles: true },
                    ]}
                  />
                </Carte>
                <Carte titre="Où sont les défauts à traiter">
                  <div className="grille g2">
                    <div>
                      <div className="discret" style={{ marginBottom: 6 }}>
                        Par catégorie
                      </div>
                      <Barres donnees={v.parCategorie} format={String} hauteur={180} />
                    </div>
                    <div>
                      <div className="discret" style={{ marginBottom: 6 }}>
                        Par CWE (faiblesse)
                      </div>
                      {v.parCwe.length ? <Barres donnees={v.parCwe} format={String} hauteur={180} /> : <Vide>Aucun défaut de sécurité</Vide>}
                    </div>
                  </div>
                  {!!v.parFichier.length && (
                    <div style={{ marginTop: 10 }}>
                      <div className="discret">Fichiers les plus touchés</div>
                      {v.parFichier.slice(0, 5).map((f) => (
                        <div key={f.nom} className="ligne-flex" style={{ fontSize: '0.82rem' }}>
                          <code>{f.nom}</code>
                          <span className="espace" />
                          <strong>{f.valeur}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </Carte>
              </div>
            </>
          )
        }
      </Charge>

      <Carte serree titre="Défauts">
        <div className="filtres" style={{ padding: '0 20px 14px' }}>
          <div className="onglets">
            {[
              ['nouveau,en-cours', 'À traiter'],
              ['nouveau', 'Nouveaux'],
              ['ecarte', 'Écartés'],
              ['corrige', 'Corrigés'],
              ['tous', 'Tous'],
            ].map(([k, l]) => (
              <button key={k} className={etat === k ? 'actif' : ''} onClick={() => setEtat(k)}>
                {l}
              </button>
            ))}
          </div>
          <select className="champ" value={impact} onChange={(e) => setImpact(e.target.value)} aria-label="Impact">
            <option value="">Tout impact</option>
            {(['eleve', 'moyen', 'faible'] as Impact[]).map((i) => (
              <option key={i} value={i}>
                Impact {LIBELLE_IMPACT[i].toLowerCase()}
              </option>
            ))}
          </select>
          <form
            className="recherche"
            style={{ display: 'block', flex: 1, minWidth: 200 }}
            onSubmit={(e) => {
              e.preventDefault();
              setQ(recherche);
            }}
          >
            <Search size={16} />
            <input style={{ width: '100%' }} placeholder="CID, règle, fichier, CWE… (Entrée)" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </form>
        </div>
        {defauts.erreur ? (
          <div style={{ padding: 20 }}>
            <Erreur message={defauts.erreur} />
          </div>
        ) : !defauts.donnees ? (
          <div style={{ padding: 20 }}>
            <Squelette hauteur={200} />
          </div>
        ) : defauts.donnees.length ? (
          <div className="tableau-conteneur">
            <table className="tableau">
              <thead>
                <tr>
                  <th>CID</th>
                  <th>Impact</th>
                  <th>Défaut</th>
                  <th>Fichier</th>
                  <th>État</th>
                  <th>Classement</th>
                  <th>Propriétaire</th>
                  <th>Détecté</th>
                </tr>
              </thead>
              <tbody>
                {defauts.donnees.map((d) => (
                  <tr key={d.cid} className="ligne-cliquable" onClick={() => setOuvert(d.cid)}>
                    <td>
                      <strong>{d.cid}</strong>
                    </td>
                    <td>
                      <Pastille statut={COULEUR_IMPACT[d.impact]}>{LIBELLE_IMPACT[d.impact]}</Pastille>
                    </td>
                    <td style={{ maxWidth: 380 }}>
                      <strong style={{ color: 'var(--encre)', fontWeight: 600 }}>{d.titreRegle}</strong>
                      <div className="discret" style={{ fontSize: '0.76rem' }}>
                        {d.categorie}
                        {d.cwe && ` · ${d.cwe}`} · {d.outil}
                      </div>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.76rem' }}>
                        {d.fichier}
                        {d.ligne ? `:${d.ligne}` : ''}
                      </code>
                    </td>
                    <td>
                      <Pastille statut={COULEUR_ETAT[d.etat]}>{LIBELLE_ETAT_DEFAUT[d.etat]}</Pastille>
                    </td>
                    <td className="discret">{LIBELLE_CLASSIFICATION[d.classification]}</td>
                    <td>{d.proprietaire ?? <span className="discret">—</span>}</td>
                    <td className="discret">{depuis(d.detecteLe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vide icone={<Bug size={28} />}>Aucun défaut ne correspond.</Vide>
        )}
      </Carte>

      {ouvert !== null && <FicheDefaut cid={ouvert} fermer={() => setOuvert(null)} change={recharger} />}
    </div>
  );
}

function AideCi() {
  return (
    <div className="empile" style={{ gap: 10 }}>
      <p>
        Ajoutez une étape au CI de Pharmatech après l’analyseur (ici Semgrep), avec le jeton <code>SUPERVISION_JETON_CI</code> du fichier <code>.env</code> :
      </p>
      <pre className="bloc-code">{`semgrep scan --config auto --sarif -o rapport.sarif
curl -fsS -X POST \\
  -H "Authorization: Bearer $SUPERVISION_JETON_CI" \\
  -H "Content-Type: application/json" \\
  --data-binary @rapport.sarif \\
  "https://supervision.mon-officine.ga/api/qualite/analyses?projet=officina&branche=$BRANCHE&commit=$COMMIT"`}</pre>
      <p className="discret">
        Réponse 201 : politique respectée. Réponse 422 : nouveau défaut d’impact élevé (le CI échoue). Ajoutez <code>&politique=ignorer</code> pour seulement enregistrer. Vous
        pouvez aussi importer un fichier SARIF à la main.
      </p>
    </div>
  );
}

function Importer({ projet, fait }: { projet: string; fait: () => void }) {
  const entree = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="ligne-flex" style={{ gap: 8 }}>
      <input
        ref={entree}
        type="file"
        accept=".sarif,.json,application/json"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setMessage('Envoi…');
          try {
            const a = await appeler<{ id: number; nouveaux: number; corriges: number }>(`/qualite/analyses?politique=ignorer&projet=${encodeURIComponent(projet || 'officina')}`, {
              methode: 'POST',
              corps: JSON.parse(await f.text()),
            });
            setMessage(`Analyse #${a.id} : ${a.nouveaux} nouveau(x), ${a.corriges} corrigé(s)`);
            fait();
          } catch (x) {
            setMessage(x instanceof SyntaxError ? 'Ce fichier n’est pas du JSON' : (x as Error).message);
          }
        }}
      />
      <button className="bouton" onClick={() => entree.current?.click()}>
        <FileUp size={14} /> Importer un SARIF
      </button>
      {message && <span className="discret">{message}</span>}
    </span>
  );
}

function FicheDefaut({ cid, fermer, change }: { cid: number; fermer: () => void; change: () => void }) {
  const etat = useDonnees<DefautVue>(`/qualite/defauts/${cid}`, 0);
  const { peut } = useSupervision();
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const agir = async (f: () => Promise<DefautVue>) => {
    setErreur(null);
    try {
      etat.remplacer(await f());
      setChamps({});
      change();
    } catch (x) {
      setErreur((x as Error).message);
    }
  };
  const d = etat.donnees;
  const valeur = (k: 'classification' | 'action' | 'gravite' | 'proprietaire') => champs[k] ?? (d?.[k] as string | null) ?? '';
  return (
    <Modale titre={`CID ${cid}${d ? ` — ${d.titreRegle}` : ''}`} fermer={fermer} large>
      {!d ? (
        etat.erreur ? (
          <Erreur message={etat.erreur} />
        ) : (
          <Squelette />
        )
      ) : (
        <div className="empile" style={{ gap: 12 }}>
          <div className="chips">
            <Pastille statut={COULEUR_IMPACT[d.impact]}>Impact {LIBELLE_IMPACT[d.impact].toLowerCase()}</Pastille>
            <Pastille statut={COULEUR_ETAT[d.etat]}>{LIBELLE_ETAT_DEFAUT[d.etat]}</Pastille>
            <Pastille statut="bleu">{d.categorie}</Pastille>
            {d.cwe && (
              <a className="pastille violet" href={`https://cwe.mitre.org/data/definitions/${d.cwe.slice(4)}.html`} target="_blank" rel="noreferrer">
                {d.cwe}
              </a>
            )}
          </div>
          <div>{d.message}</div>
          <div className="discret">
            <code>
              {d.fichier}
              {d.ligne ? `:${d.ligne}` : ''}
            </code>{' '}
            · règle <code>{d.regle}</code> ({d.outil}) · détecté {dateHeure(d.detecteLe)} (analyse #{d.premiereAnalyse}) · vu en dernier à l’analyse #{d.derniereAnalyse}
          </div>
          {d.ticket && (
            <div>
              Relié à <Link to={`/tickets/${d.ticket}`}>{d.ticket}</Link>
            </div>
          )}
          {peut('agir') && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void agir(() => appeler(`/qualite/defauts/${cid}`, { methode: 'PATCH', corps: champs }));
              }}
            >
              <div className="grille g2" style={{ gap: 12 }}>
                <div className="champ-groupe">
                  <label className="etiquette">Classement</label>
                  <select className="champ" value={valeur('classification')} onChange={(e) => setChamps({ ...champs, classification: e.target.value })}>
                    {Object.entries(LIBELLE_CLASSIFICATION).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="champ-groupe">
                  <label className="etiquette">Action</label>
                  <select className="champ" value={valeur('action')} onChange={(e) => setChamps({ ...champs, action: e.target.value })}>
                    {Object.entries(LIBELLE_ACTION).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="champ-groupe">
                  <label className="etiquette">Gravité (selon l’équipe)</label>
                  <select className="champ" value={valeur('gravite')} onChange={(e) => setChamps({ ...champs, gravite: e.target.value })}>
                    {Object.entries(LIBELLE_GRAVITE).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="champ-groupe">
                  <label className="etiquette">Propriétaire</label>
                  <input className="champ" value={valeur('proprietaire')} onChange={(e) => setChamps({ ...champs, proprietaire: e.target.value })} placeholder="Qui corrige ?" />
                </div>
              </div>
              <div className="champ-groupe">
                <label className="etiquette">Commentaire (obligatoire pour écarter un défaut)</label>
                <textarea className="champ" rows={2} value={champs.commentaire ?? ''} onChange={(e) => setChamps({ ...champs, commentaire: e.target.value })} />
              </div>
              {erreur && (
                <div className="erreur" style={{ marginTop: 10 }}>
                  {erreur}
                </div>
              )}
              <div className="ligne-flex" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                {!d.ticket && (
                  <button type="button" className="bouton" onClick={() => void agir(() => appeler(`/qualite/defauts/${cid}/ticket`, { methode: 'POST', corps: {} }))}>
                    Ouvrir un problème
                  </button>
                )}
                <button className="bouton primaire" type="submit" disabled={!Object.keys(champs).length}>
                  Enregistrer le tri
                </button>
              </div>
            </form>
          )}
          <div>
            <div className="etiquette">Historique</div>
            {[...d.historique].reverse().map((h, i) => (
              <div key={i} style={{ fontSize: '0.82rem', padding: '4px 0', borderBottom: '1px solid var(--bord)' }}>
                <span className="discret">
                  {dateHeure(h.t)} · {h.par}
                </span>{' '}
                — {h.texte}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modale>
  );
}
