import { Fragment, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, PackageCheck, RotateCcw, Search } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { useSupervision } from '../components/Coquille';
import { Carte, Charge, Erreur, Pastille, Vide } from '../components/ui';
import { dateHeure, depuis } from '../../../shared/format';
import { LIBELLE_SYNCHRO, type EtatSynchro, type VueDeploiement } from '../../../shared/deploiements';

const COULEUR: Record<EtatSynchro, 'vert' | 'bleu' | 'orange' | 'inconnu'> = { synchronise: 'vert', 'a-deployer': 'bleu', ecart: 'orange', 'non-suivi': 'inconnu' };
const AIDE: Record<EtatSynchro, string> = {
  synchronise: 'La version en production est celle que le dernier changement annonçait.',
  'a-deployer': 'Un changement approuvé ou en cours annonce une autre version.',
  ecart: 'La version en production n’est pas celle du dernier changement réussi : quelqu’un a déployé en dehors d’un changement.',
  'non-suivi': 'Aucun changement n’indique de version cible pour ce service.',
};
const ETATS: EtatSynchro[] = ['synchronise', 'a-deployer', 'ecart', 'non-suivi'];

export default function Deploiements() {
  const etat = useDonnees<VueDeploiement[]>('/deploiements', 20_000);
  const [filtre, setFiltre] = useState<EtatSynchro | ''>('');
  const [q, setQ] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { peut } = useSupervision();
  const naviguer = useNavigate();

  const retourArriere = async (ci: string, version: string) => {
    setErreur(null);
    try {
      const t = await appeler<{ numero: string }>(`/deploiements/${encodeURIComponent(ci)}/retour-arriere`, { methode: 'POST', corps: { version } });
      naviguer(`/tickets/${t.numero}`);
    } catch (e) {
      setErreur((e as Error).message);
    }
  };

  return (
    <Charge etat={etat}>
      {(lignes) => {
        if (!lignes.length)
          return (
            <Carte>
              <Vide icone={<PackageCheck size={28} />}>Aucune image mesurée : cAdvisor expose-t-il les conteneurs Docker (étiquette « image ») ?</Vide>
            </Carte>
          );
        const compte = (s: EtatSynchro) => lignes.filter((l) => l.synchro === s).length;
        const visibles = lignes.filter((l) => (!filtre || l.synchro === filtre) && (!q.trim() || l.ci.includes(q.trim().toLowerCase())));
        return (
          <div className="empile">
            <div className="grille g4">
              {ETATS.map((s) => (
                <button
                  key={s}
                  className={`carte kpi ${filtre === s ? 'actif' : ''}`}
                  style={{ textAlign: 'left', cursor: 'pointer' }}
                  title={AIDE[s]}
                  onClick={() => setFiltre(filtre === s ? '' : s)}
                >
                  <div className="kpi-libelle">{LIBELLE_SYNCHRO[s]}</div>
                  <div className="kpi-valeur">{compte(s)}</div>
                  <div className={`kpi-sous ${s === 'ecart' && compte(s) ? 'orange' : 'inconnu'}`}>{compte(s) ? `service${compte(s) > 1 ? 's' : ''}` : '—'}</div>
                </button>
              ))}
            </div>
            {erreur && <Erreur message={erreur} />}
            <Carte serree titre="Versions en production" sousTitre="L’image qui tourne, comparée à la version annoncée par les changements (champ « Version cible »)">
              <div className="filtres" style={{ padding: '0 20px 16px' }}>
                <form className="recherche" style={{ display: 'block', flex: 1, minWidth: 200 }} onSubmit={(e) => e.preventDefault()}>
                  <Search size={16} />
                  <input style={{ width: '100%' }} placeholder="Service…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un service" />
                </form>
                {filtre && (
                  <button className="bouton petit" onClick={() => setFiltre('')}>
                    Tout afficher
                  </button>
                )}
              </div>
              <div className="tableau-conteneur">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th />
                      <th>Service</th>
                      <th>En production</th>
                      <th>Prévue</th>
                      <th>Synchronisation</th>
                      <th>État</th>
                      <th>Dernier déploiement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((l) => {
                      const dernier = l.historique[0];
                      const deplie = ouvert === l.ci;
                      return (
                        <Fragment key={l.ci}>
                          <tr className="ligne-cliquable" onClick={() => setOuvert(deplie ? null : l.ci)}>
                            <td style={{ width: 28 }}>{deplie ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                            <td className="mono">{l.ci}</td>
                            <td className="mono" title={l.image ?? undefined}>
                              {l.version ?? '—'}
                            </td>
                            <td className="mono">
                              {l.prevue ? (
                                <>
                                  {l.prevue}{' '}
                                  <Link to={`/tickets/${l.changementPrevu}`} onClick={(e) => e.stopPropagation()}>
                                    {l.changementPrevu}
                                  </Link>
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td title={AIDE[l.synchro]}>
                              <Pastille statut={COULEUR[l.synchro]}>{LIBELLE_SYNCHRO[l.synchro]}</Pastille>
                            </td>
                            <td>{l.enMarche === null ? '—' : l.enMarche ? <Pastille statut="vert">En marche</Pastille> : <Pastille statut="rouge">Arrêté</Pastille>}</td>
                            <td className="discret">{dernier && !dernier.initial ? <Origine d={dernier} /> : 'pas de changement observé'}</td>
                          </tr>
                          {deplie && (
                            <tr>
                              <td />
                              <td colSpan={6}>
                                <Historique l={l} agent={peut('agir')} retour={retourArriere} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {!visibles.length && (
                      <tr>
                        <td colSpan={7} className="discret" style={{ textAlign: 'center', padding: 24 }}>
                          Aucun service dans cette vue.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Carte>
          </div>
        );
      }}
    </Charge>
  );
}

function Origine({ d }: { d: VueDeploiement['historique'][number] }) {
  return (
    <span title={dateHeure(d.le)}>
      {depuis(d.le)} ·{' '}
      {d.changement ? (
        <Link to={`/tickets/${d.changement}`} onClick={(e) => e.stopPropagation()}>
          {d.changement}
        </Link>
      ) : (
        <Pastille statut="orange">hors changement</Pastille>
      )}
    </span>
  );
}

function Historique({ l, agent, retour }: { l: VueDeploiement; agent: boolean; retour: (ci: string, version: string) => void }) {
  if (!l.historique.length) return <span className="discret">Pas encore d’historique : il se construit à chaque changement de version observé.</span>;
  const actuelle = l.historique[0].version;
  return (
    <div className="empile" style={{ gap: 6, padding: '8px 0' }}>
      {l.historique.map((d, i) => (
        <div key={`${d.le}-${d.version}`} className="ligne-flex" style={{ gap: 12 }}>
          <span className="mono" style={{ minWidth: 90 }}>
            {d.version}
          </span>
          <span className="discret" style={{ minWidth: 150 }}>
            {dateHeure(d.le)}
          </span>
          {d.initial ? <span className="discret">première observation</span> : <Origine d={d} />}
          {i === 0 && <Pastille statut="vert">en production</Pastille>}
          <span className="espace" />
          {agent && d.version !== actuelle && (
            <button className="bouton petit" title="Ouvre un changement urgent (brouillon) pour revenir à cette version" onClick={() => retour(l.ci, d.version)}>
              <RotateCcw size={12} /> Revenir à cette version
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
