import { useState } from 'react';
import { ExternalLink, Plug, RefreshCw, Settings } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, Modale, Pages, Pastille, Vide } from '../components/ui';
import { useSupervision } from '../components/Coquille';
import { depuis } from '../../../shared/format';
import type { LectureConnecteur, Outil, VueConnecteur } from '../../../shared/integrations';

type Connecteur = VueConnecteur & { lecture: LectureConnecteur | null };

const aTraiter = (c: Connecteur) => c.lecture?.elements.filter((e) => e.statut === 'rouge' || e.statut === 'orange').length ?? 0;

function Etat({ c }: { c: Connecteur }) {
  if (!c.configure) return <Pastille statut="inconnu">Non relié</Pastille>;
  if (!c.actif) return <Pastille statut="inconnu">En pause</Pastille>;
  if (c.lecture?.erreur) return <Pastille statut="rouge">Erreur</Pastille>;
  const n = aTraiter(c);
  return n ? <Pastille statut="orange">{n} à traiter</Pastille> : <Pastille statut="vert">{c.lecture?.elements.length ?? 0} élément(s)</Pastille>;
}

function Reglage({ c, fermer, fait }: { c: Connecteur; fermer: () => void; fait: () => void }) {
  const [url, setUrl] = useState(c.url);
  const [identifiant, setIdentifiant] = useState(c.identifiant);
  const [jeton, setJeton] = useState('');
  const [actif, setActif] = useState(c.configure ? c.actif : true);
  const [erreur, setErreur] = useState<string | null>(null);
  const envoyer = async (f: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await f();
      fait();
    } catch (x) {
      setErreur((x as Error).message);
    }
  };
  return (
    <Modale titre={`Relier ${c.nom}`} fermer={fermer}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer(() => appeler(`/integrations/${c.cle}`, { methode: 'PUT', corps: { url, identifiant, jeton, actif } }));
        }}
      >
        <div className="champ-groupe">
          <label htmlFor="int-url">Adresse de {c.nom}</label>
          <input id="int-url" className="champ" type="url" required placeholder={c.exempleUrl} value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        {c.utilisateur && (
          <div className="champ-groupe">
            <label htmlFor="int-id">{c.utilisateur}</label>
            <input id="int-id" className="champ" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoComplete="off" />
          </div>
        )}
        <div className="champ-groupe">
          <label htmlFor="int-jeton">Jeton d’accès (lecture seule)</label>
          <input
            id="int-jeton"
            className="champ"
            type="password"
            autoComplete="new-password"
            required={!c.configure}
            placeholder={c.configure ? 'Laisser vide pour garder le jeton enregistré' : ''}
            value={jeton}
            onChange={(e) => setJeton(e.target.value)}
          />
          <div className="discret" style={{ marginTop: 6 }}>
            {c.aideJeton} Le jeton reste sur le serveur : il n’est plus jamais affiché.
          </div>
        </div>
        <label className="ligne-flex" style={{ marginTop: 12, gap: 8, fontSize: '0.86rem' }}>
          <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} /> Connecteur actif
        </label>
        {erreur && (
          <div className="erreur" style={{ marginTop: 12 }}>
            {erreur}
          </div>
        )}
        <div className="ligne-flex" style={{ marginTop: 16 }}>
          {c.configure && (
            <button
              type="button"
              className="bouton danger"
              onClick={() => confirm(`Supprimer le connecteur ${c.nom} et son jeton ?`) && void envoyer(() => appeler(`/integrations/${c.cle}`, { methode: 'DELETE' }))}
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

function Detail({ c, admin, regler, actualiser }: { c: Connecteur; admin: boolean; regler: () => void; actualiser: () => void }) {
  const [filtre, setFiltre] = useState<'tous' | 'a-traiter'>('tous');
  const elements = (c.lecture?.elements ?? []).filter((e) => filtre === 'tous' || e.statut === 'rouge' || e.statut === 'orange');
  return (
    <Carte
      serree
      titre={c.nom}
      sousTitre={c.configure ? `${c.contenu} · ${c.url}${c.lecture ? ` · lu ${depuis(c.lecture.luLe)}` : ''}` : c.contenu}
      droite={
        <div className="ligne-flex">
          {c.configure && (
            <button className="bouton petit" onClick={actualiser}>
              <RefreshCw size={13} /> Actualiser
            </button>
          )}
          {admin && (
            <button className="bouton petit" onClick={regler}>
              <Settings size={13} /> {c.configure ? 'Régler' : 'Relier'}
            </button>
          )}
        </div>
      }
    >
      {!c.configure ? (
        <Vide icone={<Plug size={28} />}>
          {c.nom} n’est pas encore relié. {admin ? 'Cliquez sur « Relier » : il faut son adresse et un jeton en lecture seule.' : 'Demandez à un administrateur de le relier.'}
        </Vide>
      ) : (
        <>
          {c.lecture?.erreur && (
            <div style={{ padding: '0 20px 16px' }}>
              <div className="erreur">{c.lecture.erreur}</div>
            </div>
          )}
          {!c.lecture?.erreur && (
            <div className="filtres" style={{ padding: '0 20px 16px' }}>
              <div className="onglets">
                <button className={filtre === 'tous' ? 'actif' : ''} onClick={() => setFiltre('tous')}>
                  Tous ({c.lecture?.elements.length ?? 0})
                </button>
                <button className={filtre === 'a-traiter' ? 'actif' : ''} onClick={() => setFiltre('a-traiter')}>
                  À traiter ({aTraiter(c)})
                </button>
              </div>
            </div>
          )}
          {elements.length ? (
            <Pages key={filtre} liste={elements} parPage={10}>
              {(visibles) => (
                <div className="tableau-conteneur">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Élément</th>
                        <th>État</th>
                        <th>Détail</th>
                        <th>Mis à jour</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((e) => (
                        <tr key={e.id}>
                          <td style={{ maxWidth: 420 }}>
                            {e.lien ? (
                              <a href={e.lien} target="_blank" rel="noreferrer">
                                {e.titre} <ExternalLink size={12} style={{ verticalAlign: -1 }} />
                              </a>
                            ) : (
                              e.titre
                            )}
                          </td>
                          <td>
                            <Pastille statut={e.statut}>{e.etat}</Pastille>
                          </td>
                          <td className="discret">{e.detail || '—'}</td>
                          <td className="discret" style={{ whiteSpace: 'nowrap' }}>
                            {e.le ? depuis(e.le) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Pages>
          ) : (
            !c.lecture?.erreur && <Vide>{filtre === 'tous' ? 'Rien à afficher pour l’instant.' : 'Rien à traiter. Tout est calme.'}</Vide>
          )}
        </>
      )}
    </Carte>
  );
}

export default function Integrations() {
  const etat = useDonnees<Connecteur[]>('/integrations', 60_000);
  const { peut } = useSupervision();
  const [choisi, setChoisi] = useState<Outil | null>(null);
  const [reglage, setReglage] = useState<Outil | null>(null);
  const actualiser = async () => etat.remplacer(await appeler<Connecteur[]>('/integrations?forcer'));

  return (
    <Charge etat={etat}>
      {(liste) => {
        const courant = liste.find((c) => c.cle === choisi) ?? liste.find((c) => c.configure) ?? liste[0];
        const aRegler = liste.find((c) => c.cle === reglage);
        return (
          <div className="empile">
            <div className="grille g4">
              {liste.map((c) => (
                <button key={c.cle} className={`carte outil ${c.cle === courant.cle ? 'choisi' : ''}`} onClick={() => setChoisi(c.cle)} aria-pressed={c.cle === courant.cle}>
                  <strong>{c.nom}</strong>
                  <span className="discret">{c.contenu}</span>
                  <span>
                    <Etat c={c} />
                  </span>
                </button>
              ))}
            </div>
            <Detail key={courant.cle} c={courant} admin={peut('administrer')} regler={() => setReglage(courant.cle)} actualiser={() => void actualiser()} />
            {aRegler && (
              <Reglage
                c={aRegler}
                fermer={() => setReglage(null)}
                fait={() => {
                  setReglage(null);
                  void actualiser();
                }}
              />
            )}
          </div>
        );
      }}
    </Charge>
  );
}
