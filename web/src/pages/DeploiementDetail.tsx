import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, CircleCheck, Clock, Container, EllipsisVertical, FileDiff, History, Hourglass, Info, List, Network, Package, RefreshCw, Search, Undo2 } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { useSupervision } from '../components/Coquille';
import { Erreur, Squelette } from '../components/ui';
import { dateHeure, depuis } from '../../../shared/format';
import type { VueDeploiement } from '../../../shared/deploiements';
import { COULEUR_SANTE, CoquilleArgo, IconeSante, IconeSynchro, LIBELLE_SANTE, LIBELLE_SYNCHRO3, Panneau, depotDe, duree, lienPlanifier, synchro3 } from './deploiements/argo';

type NomPanneau = 'details' | 'diff' | 'synchro' | 'historique';
const AIDE_SYNCHRO = {
  synchronise: 'La version en production est celle que le dernier changement annonçait.',
  'a-deployer': 'Un changement approuvé ou en cours annonce une autre version : le déploiement est à faire.',
  ecart: 'La version en production n’est pas celle du dernier changement réussi : quelqu’un a déployé en dehors d’un changement.',
  'non-suivi': 'Aucun changement n’indique de version cible pour ce service.',
} as const;

export default function DeploiementDetail() {
  const { ci = '' } = useParams();
  const etat = useDonnees<VueDeploiement[]>('/deploiements', 15_000);
  const [p, setP] = useSearchParams();
  const naviguer = useNavigate();
  const l = etat.donnees?.find((x) => x.ci === ci);
  const panneau = (['details', 'diff', 'synchro', 'historique'] as const).find((n) => n === p.get('panneau')) ?? null;
  const vue = p.get('vue') === 'list' ? 'list' : 'tree';
  const ouvrir = (n: NomPanneau | null) =>
    setP((a) => (n ? { ...Object.fromEntries(a), panneau: n } : Object.fromEntries([...a].filter(([k]) => k !== 'panneau'))), { replace: true });

  return (
    <CoquilleArgo
      titre={vue === 'tree' ? 'Application — arbre' : 'Application — liste'}
      fil={
        <>
          <Link to="/deploiements">Applications</Link> / <Search size={13} /> <b>{ci}</b>
        </>
      }
    >
      {etat.erreur ? (
        <Erreur message={etat.erreur} />
      ) : !etat.donnees ? (
        <Squelette hauteur={300} />
      ) : !l ? (
        <div style={{ padding: 40 }}>
          Application « {ci} » introuvable. <Link to="/deploiements">Retour aux applications</Link>
        </div>
      ) : (
        <Vue
          l={l}
          vue={vue}
          ouvrir={ouvrir}
          panneau={panneau}
          actualiser={() => void etat.recharger()}
          naviguer={naviguer}
          changerVue={(v) => setP((a) => ({ ...Object.fromEntries(a), vue: v }), { replace: true })}
        />
      )}
    </CoquilleArgo>
  );
}

function Vue({
  l,
  vue,
  ouvrir,
  panneau,
  actualiser,
  naviguer,
  changerVue,
}: {
  l: VueDeploiement;
  vue: 'tree' | 'list';
  ouvrir: (n: NomPanneau | null) => void;
  panneau: NomPanneau | null;
  actualiser: () => void;
  naviguer: (c: string) => void;
  changerVue: (v: string) => void;
}) {
  const s3 = synchro3(l.synchro);
  const dernier = l.historique[0];
  const diffPossible = s3 === 'desynchronise' && !!l.prevue;
  return (
    <>
      <div className="argo-tete">
        <div className="argo-outils">
          <button className="argo-bouton" onClick={() => ouvrir('details')}>
            <Info size={14} /> Détails
          </button>
          <button
            className="argo-bouton"
            disabled={!diffPossible}
            title={diffPossible ? undefined : 'Rien à comparer : la version en production est celle qui est visée'}
            onClick={() => ouvrir('diff')}
          >
            <FileDiff size={14} /> Diff
          </button>
          <button className="argo-bouton" title="Planifie un changement de déploiement pour ce service" onClick={() => naviguer(lienPlanifier(l))}>
            <RefreshCw size={14} /> Planifier
          </button>
          <button className="argo-bouton" onClick={() => ouvrir('synchro')}>
            <Info size={14} /> Statut de synchro
          </button>
          <button className="argo-bouton" onClick={() => ouvrir('historique')}>
            <History size={14} /> Historique et retour arrière
          </button>
          <button className="argo-bouton" onClick={actualiser}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <div className="argo-vues">
            {(
              [
                ['tree', Network, 'Arbre'],
                ['list', List, 'Liste'],
              ] as const
            ).map(([v, Icone, nom]) => (
              <button key={v} className={vue === v ? 'actif' : ''} title={nom} aria-label={nom} onClick={() => changerVue(v)}>
                <Icone size={24} />
              </button>
            ))}
          </div>
        </div>

        <div className="argo-resume">
          <div>
            <h5>Santé de l’application</h5>
            <div className="argo-gros" style={{ color: COULEUR_SANTE[l.sante] === 'var(--a-gris)' ? '#6d7f8b' : COULEUR_SANTE[l.sante] }}>
              <IconeSante s={l.sante} taille={26} /> {LIBELLE_SANTE[l.sante]}
            </div>
            <div className="argo-petit">{l.enMarche === null ? 'Conteneur non mesuré' : l.enMarche ? 'Le conteneur tourne' : 'Le conteneur ne répond plus à cAdvisor'}</div>
          </div>
          <div>
            <h5>Statut de synchronisation</h5>
            <div className="argo-gros" style={{ color: s3 === 'synchronise' ? 'var(--a-vert)' : s3 === 'desynchronise' ? '#c99a0a' : '#6d7f8b' }}>
              <IconeSynchro s={s3} taille={26} /> {LIBELLE_SYNCHRO3[s3]}
              {l.prevue && (
                <small>
                  vers <span style={{ color: 'var(--a-lien)' }}>{l.prevue}</span>
                </small>
              )}
            </div>
            <div className="argo-petit">{AIDE_SYNCHRO[l.synchro]}</div>
            {l.changementPrevu && (
              <div className="argo-petit">
                <b>Changement :</b>
                <Link to={`/tickets/${l.changementPrevu}`}>{l.changementPrevu}</Link> {l.titrePrevu}
              </div>
            )}
          </div>
          <div>
            <h5>Dernier déploiement</h5>
            {dernier && !dernier.initial ? (
              <>
                <div className="argo-gros" style={{ color: 'var(--a-vert)' }}>
                  <CircleCheck size={26} /> Déploiement observé
                  <small>
                    vers <span style={{ color: 'var(--a-lien)' }}>{dernier.version}</span>
                  </small>
                </div>
                <div className="argo-petit">
                  Observé {depuis(dernier.le)} ({dateHeure(dernier.le)})
                </div>
                <div className="argo-petit">
                  <b>Changement :</b>
                  {dernier.changement ? (
                    <>
                      <Link to={`/tickets/${dernier.changement}`}>{dernier.changement}</Link> {dernier.changementTitre}
                    </>
                  ) : (
                    <span style={{ color: '#c99a0a' }}>hors changement</span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="argo-gros" style={{ color: '#6d7f8b' }}>
                  <Clock size={26} /> Aucun déploiement vu
                </div>
                <div className="argo-petit">L’historique se construit à chaque changement de version observé en production.</div>
              </>
            )}
          </div>
        </div>
      </div>

      {vue === 'tree' ? <Arbre l={l} /> : <ListeRessources l={l} />}

      {panneau && (
        <Panneau fermer={() => ouvrir(null)}>
          {panneau === 'details' && <Details l={l} />}
          {panneau === 'diff' && <Diff l={l} />}
          {panneau === 'synchro' && <Synchro l={l} />}
          {panneau === 'historique' && <Historique l={l} naviguer={naviguer} />}
        </Panneau>
      )}
    </>
  );
}

interface Noeud {
  genre: string;
  icone: ReactNode;
  nom: string;
  sante?: VueDeploiement['sante'];
  synchro?: ReturnType<typeof synchro3>;
  age?: string;
  lien?: string;
  enfants?: Noeud[];
}

/** Les ressources du service, comme l'arbre d'Argo CD : application → image → conteneur, et le changement qui vise une version. */
function ressources(l: VueDeploiement): Noeud {
  const dernier = l.historique[0];
  const s3 = synchro3(l.synchro);
  const age = dernier && !dernier.initial ? duree(Date.now() - dernier.le) : undefined;
  const conteneur: Noeud = { genre: 'ctr', icone: <Container size={22} />, nom: l.ci, sante: l.sante, age };
  const image: Noeud = { genre: 'img', icone: <Package size={22} />, nom: l.image ? `${depotDe(l.image)}:${l.version}` : 'image inconnue', synchro: s3, age, enfants: [conteneur] };
  const enfants = [image];
  if (l.changementPrevu)
    enfants.push({ genre: 'chg', icone: <Hourglass size={22} />, nom: `${l.changementPrevu} · ${l.prevue}`, synchro: s3, lien: `/tickets/${l.changementPrevu}` });
  return { genre: 'app', icone: <Box size={22} />, nom: l.ci, sante: l.sante, synchro: s3, enfants };
}

function CarteNoeud({ n }: { n: Noeud }) {
  const corps = (
    <div className="argo-noeud" style={{ borderLeftColor: n.sante ? COULEUR_SANTE[n.sante] : 'var(--a-gris)' }}>
      <div className="genre">
        {n.icone}
        {n.genre}
      </div>
      <div>
        <div className="nom">{n.nom}</div>
        <div className="etats">
          {n.sante && <IconeSante s={n.sante} taille={15} />}
          {n.synchro && <IconeSynchro s={n.synchro} taille={15} />}
        </div>
      </div>
      {n.age && <span className="age">{n.age}</span>}
    </div>
  );
  return n.lien ? <Link to={n.lien}>{corps}</Link> : corps;
}

function Branche({ n }: { n: Noeud }) {
  return (
    <div className="argo-branche">
      <CarteNoeud n={n} />
      {n.enfants && (
        <div className="argo-enfants">
          {n.enfants.map((e) => (
            <Branche key={`${e.genre}-${e.nom}`} n={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function Arbre({ l }: { l: VueDeploiement }) {
  return (
    <div className="argo-canevas">
      <div className="argo-flottant" aria-hidden>
        <Network size={18} /> {l.ci}
      </div>
      <div className="argo-arbre">
        <Branche n={ressources(l)} />
      </div>
    </div>
  );
}

function ListeRessources({ l }: { l: VueDeploiement }) {
  const lignes: Noeud[] = [];
  const aplatir = (n: Noeud) => {
    lignes.push(n);
    n.enfants?.forEach(aplatir);
  };
  aplatir(ressources(l));
  return (
    <table className="argo-table">
      <thead>
        <tr>
          <th>Nom</th>
          <th>Genre</th>
          <th>Santé</th>
          <th>Synchronisation</th>
          <th>Âge</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((n) => (
          <tr key={`${n.genre}-${n.nom}`}>
            <td>{n.lien ? <Link to={n.lien}>{n.nom}</Link> : n.nom}</td>
            <td>{n.genre}</td>
            <td>
              {n.sante ? (
                <>
                  <IconeSante s={n.sante} /> {LIBELLE_SANTE[n.sante]}
                </>
              ) : (
                '—'
              )}
            </td>
            <td>
              {n.synchro ? (
                <>
                  <IconeSynchro s={n.synchro} /> {LIBELLE_SYNCHRO3[n.synchro]}
                </>
              ) : (
                '—'
              )}
            </td>
            <td>{n.age ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Details({ l }: { l: VueDeploiement }) {
  const premier = l.historique.at(-1);
  const lignes: [string, ReactNode][] = [
    ['Nom', l.ci],
    ['Projet', l.projet ?? '—'],
    ['Image', l.image ?? '—'],
    ['Version en production', l.version ?? '—'],
    ['Version visée', l.prevue ?? '—'],
    [
      'Changement visé',
      l.changementPrevu ? (
        <Link to={`/tickets/${l.changementPrevu}`}>
          {l.changementPrevu} {l.titrePrevu}
        </Link>
      ) : (
        '—'
      ),
    ],
    ['Santé', `${LIBELLE_SANTE[l.sante]}`],
    ['Première observation', premier ? dateHeure(premier.le) : '—'],
    ['Versions connues', String(l.historique.length)],
  ];
  return (
    <>
      <h2>Détails</h2>
      <table className="argo-table">
        <tbody>
          {lignes.map(([k, v]) => (
            <tr key={k}>
              <td style={{ width: 220, color: '#6d7f8b' }}>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Diff({ l }: { l: VueDeploiement }) {
  const depot = depotDe(l.image);
  return (
    <>
      <h2>Écart entre la production et la version visée</h2>
      <div className="argo-diff">
        <div>{`conteneur: ${l.ci}`}</div>
        <div className="moins">{`- image: ${depot}:${l.version}    # en production`}</div>
        <div className="plus">{`+ image: ${depot}:${l.prevue}    # visée par ${l.changementPrevu}`}</div>
      </div>
    </>
  );
}

function Synchro({ l }: { l: VueDeploiement }) {
  const s3 = synchro3(l.synchro);
  return (
    <>
      <h2>Statut de synchronisation</h2>
      <div className="argo-resume-vue" style={{ marginBottom: 20 }}>
        <div>
          <div className="argo-gros">
            <IconeSynchro s={s3} taille={28} /> {LIBELLE_SYNCHRO3[s3]}
          </div>
          <p>{AIDE_SYNCHRO[l.synchro]}</p>
        </div>
      </div>
      <table className="argo-table">
        <thead>
          <tr>
            <th>Genre</th>
            <th>Nom</th>
            <th>Synchronisation</th>
            <th>Santé</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>image</td>
            <td>{l.image ?? '—'}</td>
            <td>
              <IconeSynchro s={s3} /> {LIBELLE_SYNCHRO3[s3]}
            </td>
            <td>—</td>
          </tr>
          <tr>
            <td>conteneur</td>
            <td>{l.ci}</td>
            <td>—</td>
            <td>
              <IconeSante s={l.sante} /> {LIBELLE_SANTE[l.sante]}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

/** Une carte par version vue en production, de la plus récente à la plus ancienne ; « Revenir à cette version » ouvre un changement urgent. */
function Historique({ l, naviguer }: { l: VueDeploiement; naviguer: (c: string) => void }) {
  const { peut } = useSupervision();
  const [menu, setMenu] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const retour = async (version: string) => {
    setErreur(null);
    try {
      const t = await appeler<{ numero: string }>(`/deploiements/${encodeURIComponent(l.ci)}/retour-arriere`, { methode: 'POST', corps: { version } });
      naviguer(`/tickets/${t.numero}`);
    } catch (e) {
      setErreur((e as Error).message);
    }
  };
  return (
    <>
      <h2>Historique et retour arrière</h2>
      {erreur && <Erreur message={erreur} />}
      {!l.historique.length && <p>Pas encore d’historique : il se construit à chaque changement de version observé.</p>}
      {l.historique.map((d, i) => {
        const cle = `${d.le}-${d.version}`;
        const fin = i === 0 ? Date.now() : l.historique[i - 1].le;
        return (
          <div key={cle} className="argo-carte-histo">
            <div className="gauche">
              <div>
                <Clock size={13} /> <b>Déployé le :</b>
                <div>{dateHeure(d.le)}</div>
              </div>
              <div style={{ marginTop: 10 }}>
                <b>Initié par :</b>
                <div>
                  {d.initial ? (
                    'première observation'
                  ) : d.changement ? (
                    <Link to={`/tickets/${d.changement}`}>{d.changement}</Link>
                  ) : (
                    <span style={{ color: '#c99a0a' }}>hors changement</span>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <b>Actif pendant :</b>
                <div>{duree(fin - d.le)}</div>
              </div>
            </div>
            <div className="droite">
              <dl>
                <dt>Version :</dt>
                <dd>
                  <b style={{ color: 'var(--a-lien)' }}>{d.version}</b>{' '}
                  {i === 0 && (
                    <span className="argo-etat">
                      <CircleCheck size={14} color="var(--a-vert)" /> en production
                    </span>
                  )}
                </dd>
                <dt>Changement :</dt>
                <dd>{d.changement ? `${d.changement} — ${d.changementTitre ?? ''}` : '—'}</dd>
              </dl>
              <details style={{ marginTop: 12, background: '#fff', border: '1px solid #e6edf1', padding: '8px 14px' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--a-lien)', textAlign: 'center' }}>Paramètres source</summary>
                <div style={{ marginTop: 6, wordBreak: 'break-all' }}>Image : {d.image}</div>
              </details>
              {peut('agir') && (
                <div className="argo-menu-carte">
                  <button aria-label="Actions" onClick={() => setMenu(menu === cle ? null : cle)}>
                    <EllipsisVertical size={18} />
                  </button>
                  {menu === cle && (
                    <div className="liste">
                      <button disabled={i === 0} onClick={() => void retour(d.version)} style={i === 0 ? { opacity: 0.5, cursor: 'default' } : undefined}>
                        <Undo2 size={14} /> Revenir à cette version
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
