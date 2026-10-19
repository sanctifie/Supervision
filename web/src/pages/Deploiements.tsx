import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Cell, Pie, PieChart } from 'recharts';
import { Box, ChartPie, EllipsisVertical, History, LayoutGrid, List, Plus, RefreshCw, Search, Star } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { Erreur, Squelette } from '../components/ui';
import { dateHeure } from '../../../shared/format';
import type { VueDeploiement } from '../../../shared/deploiements';
import {
  COULEUR_SANTE,
  CoquilleArgo,
  IconeSante,
  IconeSynchro,
  LIBELLE_SANTE,
  LIBELLE_SYNCHRO3,
  SANTES,
  bordSante,
  depotDe,
  lienPlanifier,
  synchro3,
  type Synchro3,
} from './deploiements/argo';

const VUES = ['tiles', 'list', 'summary'] as const;
type Vue = (typeof VUES)[number];
const TITRE_VUE: Record<Vue, string> = { tiles: 'Applications — tuiles', list: 'Applications — liste', summary: 'Applications — résumé' };
const SYNCHROS: Synchro3[] = ['synchronise', 'desynchronise', 'inconnu'];
const TAILLES = [12, 24, 48];
const CLE_FAVORIS = 'deploiements.favoris';

// Les favoris restent dans ce navigateur ; sans stockage, la page fonctionne quand même.
function lireFavoris(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CLE_FAVORIS) ?? '[]');
  } catch {
    return [];
  }
}

export default function Deploiements() {
  const etat = useDonnees<VueDeploiement[]>('/deploiements', 15_000);
  const [p, setP] = useSearchParams();
  const [favoris, setFavoris] = useState<string[]>(lireFavoris);
  const naviguer = useNavigate();
  const lignes = etat.donnees ?? [];

  const vue: Vue = VUES.includes(p.get('vue') as Vue) ? (p.get('vue') as Vue) : 'tiles';
  const liste = (cle: string) => (p.get(cle) ?? '').split(',').filter(Boolean);
  const maj = (cle: string, valeur: string | null) =>
    setP(
      (avant) => {
        const n = new URLSearchParams(avant);
        if (valeur) n.set(cle, valeur);
        else n.delete(cle);
        if (cle !== 'page') n.delete('page');
        return n;
      },
      { replace: true },
    );
  const basculer = (cle: string, v: string) => {
    const l = liste(cle);
    maj(cle, (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]).join(',') || null);
  };
  const etoile = (ci: string) => {
    const suivant = favoris.includes(ci) ? favoris.filter((x) => x !== ci) : [...favoris, ci];
    setFavoris(suivant);
    try {
      localStorage.setItem(CLE_FAVORIS, JSON.stringify(suivant));
    } catch {
      /* pas de stockage : les favoris durent le temps de la page */
    }
  };

  const q = (p.get('q') ?? '').trim().toLowerCase();
  const tri = p.get('tri') ?? 'nom';
  const taille = TAILLES.includes(Number(p.get('taille'))) ? Number(p.get('taille')) : TAILLES[0];
  const sante = liste('sante');
  const synchro = liste('synchro');
  const projets = liste('projet');
  const filtrees = lignes
    .filter(
      (l) => (!sante.length || sante.includes(l.sante)) && (!synchro.length || synchro.includes(synchro3(l.synchro))) && (!projets.length || projets.includes(l.projet ?? '—')),
    )
    .filter((l) => !q || `${l.ci} ${l.projet ?? ''} ${l.image ?? ''}`.toLowerCase().includes(q))
    .filter((l) => p.get('favoris') !== '1' || favoris.includes(l.ci))
    .sort((a, b) =>
      tri === 'deploiement'
        ? (b.historique[0]?.le ?? 0) - (a.historique[0]?.le ?? 0)
        : tri === 'synchro'
          ? Number(synchro3(a.synchro) === 'synchronise') - Number(synchro3(b.synchro) === 'synchronise') || a.ci.localeCompare(b.ci)
          : a.ci.localeCompare(b.ci),
    );
  const pages = Math.max(1, Math.ceil(filtrees.length / taille));
  const page = Math.min(pages, Math.max(1, Number(p.get('page')) || 1));
  const visibles = filtrees.slice((page - 1) * taille, page * taille);
  const compte = (f: (l: VueDeploiement) => boolean) => lignes.filter(f).length;
  const nomsProjets = [...new Set(lignes.map((l) => l.projet ?? '—'))].sort();

  const filtres = (
    <>
      <div className="argo-filtres-titre">Filtres des applications</div>
      <label className="argo-case" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={p.get('favoris') === '1'} onChange={(e) => maj('favoris', e.target.checked ? '1' : null)} />
        <Star size={16} color="var(--a-jaune)" fill="var(--a-jaune)" /> Favoris seulement
      </label>
      <div className="argo-groupe-titre">Santé</div>
      {SANTES.map((s) => (
        <label key={s} className="argo-case">
          <input type="checkbox" checked={sante.includes(s)} onChange={() => basculer('sante', s)} />
          <IconeSante s={s} /> {LIBELLE_SANTE[s]} <span className="n">{compte((l) => l.sante === s)}</span>
        </label>
      ))}
      <div className="argo-groupe-titre">Synchronisation</div>
      {SYNCHROS.map((s) => (
        <label key={s} className="argo-case">
          <input type="checkbox" checked={synchro.includes(s)} onChange={() => basculer('synchro', s)} />
          <IconeSynchro s={s} /> {LIBELLE_SYNCHRO3[s]} <span className="n">{compte((l) => synchro3(l.synchro) === s)}</span>
        </label>
      ))}
      {nomsProjets.length > 0 && <div className="argo-groupe-titre">Projets</div>}
      {nomsProjets.map((n) => (
        <label key={n} className="argo-case">
          <input type="checkbox" checked={projets.includes(n)} onChange={() => basculer('projet', n)} />
          {n} <span className="n">{compte((l) => (l.projet ?? '—') === n)}</span>
        </label>
      ))}
    </>
  );

  return (
    <CoquilleArgo fil={<b>Applications</b>} titre={TITRE_VUE[vue]} filtres={filtres}>
      <div className="argo-outils">
        <Link className="argo-bouton" to="/tickets/nouveau?type=changement&titre=Déploiement">
          <Plus size={14} /> Nouveau déploiement
        </Link>
        <button className="argo-bouton" onClick={() => void etat.recharger()}>
          <RefreshCw size={14} /> Actualiser
        </button>
        <label className="argo-recherche">
          <Search size={15} />
          <input placeholder="Rechercher une application…" value={p.get('q') ?? ''} onChange={(e) => maj('q', e.target.value || null)} aria-label="Rechercher une application" />
        </label>
        <div className="argo-vues">
          {(
            [
              ['tiles', LayoutGrid, 'Tuiles'],
              ['list', List, 'Liste'],
              ['summary', ChartPie, 'Résumé'],
            ] as const
          ).map(([v, Icone, nom]) => (
            <button key={v} className={vue === v ? 'actif' : ''} title={nom} aria-label={nom} onClick={() => maj('vue', v === 'tiles' ? null : v)}>
              <Icone size={24} />
            </button>
          ))}
        </div>
      </div>

      {etat.erreur ? (
        <Erreur message={etat.erreur} />
      ) : !etat.donnees ? (
        <Squelette hauteur={300} />
      ) : !lignes.length ? (
        <div style={{ padding: 40, textAlign: 'center' }}>Aucune image mesurée : cAdvisor expose-t-il les conteneurs Docker (étiquette « image ») ?</div>
      ) : (
        <>
          <Navigation page={page} pages={pages} tri={tri} taille={taille} maj={maj} />
          <BarreSante lignes={filtrees} />
          {vue === 'summary' ? (
            <Resume lignes={filtrees} />
          ) : vue === 'list' ? (
            visibles.map((l) => <Ligne key={l.ci} l={l} favori={favoris.includes(l.ci)} etoile={() => etoile(l.ci)} ouvrir={() => naviguer(`/deploiements/${l.ci}`)} />)
          ) : (
            <div className="argo-tuiles">
              {visibles.map((l) => (
                <Tuile
                  key={l.ci}
                  l={l}
                  favori={favoris.includes(l.ci)}
                  etoile={() => etoile(l.ci)}
                  ouvrir={(chemin) => naviguer(chemin ?? `/deploiements/${l.ci}`)}
                  actualiser={() => void etat.recharger()}
                />
              ))}
            </div>
          )}
          {!filtrees.length && <div style={{ padding: 30, textAlign: 'center' }}>Aucune application ne correspond à ces filtres.</div>}
          <Navigation page={page} pages={pages} tri={tri} taille={taille} maj={maj} />
        </>
      )}
    </CoquilleArgo>
  );
}

function Navigation({ page, pages, tri, taille, maj }: { page: number; pages: number; tri: string; taille: number; maj: (c: string, v: string | null) => void }) {
  const aller = (n: number) => maj('page', n > 1 ? String(n) : null);
  return (
    <div className="argo-pagination">
      <a onClick={() => page > 1 && aller(page - 1)} style={{ cursor: 'pointer', opacity: page > 1 ? 1 : 0.5 }}>
        Précédent
      </a>
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) =>
        n === page ? (
          <span key={n} className="courante">
            {n}
          </span>
        ) : (
          <a key={n} onClick={() => aller(n)} style={{ cursor: 'pointer' }}>
            {n}
          </a>
        ),
      )}
      <a onClick={() => page < pages && aller(page + 1)} style={{ cursor: 'pointer', opacity: page < pages ? 1 : 0.5 }}>
        Suivant
      </a>
      <span className="espace" />
      <label>
        Trier :{' '}
        <select value={tri} onChange={(e) => maj('tri', e.target.value === 'nom' ? null : e.target.value)}>
          <option value="nom">nom</option>
          <option value="deploiement">dernier déploiement</option>
          <option value="synchro">synchronisation</option>
        </select>
      </label>
      <label>
        Éléments par page :{' '}
        <select value={taille} onChange={(e) => maj('taille', Number(e.target.value) === TAILLES[0] ? null : e.target.value)}>
          {TAILLES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** La barre segmentée sous la pagination : la santé de l'ensemble, d'un coup d'œil. */
function BarreSante({ lignes }: { lignes: VueDeploiement[] }) {
  const total = lignes.length || 1;
  const ordre = ['sain', 'degrade', 'absent', 'en-cours', 'inconnu'] as const;
  return (
    <div className="argo-segments" role="img" aria-label="Répartition de la santé">
      {ordre.map((s) => {
        const n = lignes.filter((l) => l.sante === s).length;
        return n ? <div key={s} title={`${LIBELLE_SANTE[s]} : ${n}`} style={{ width: `${(100 * n) / total}%`, background: COULEUR_SANTE[s] }} /> : null;
      })}
    </div>
  );
}

function Statut({ l }: { l: VueDeploiement }) {
  return (
    <span className="argo-etat">
      <IconeSante s={l.sante} /> {LIBELLE_SANTE[l.sante]}
      <IconeSynchro s={synchro3(l.synchro)} /> {LIBELLE_SYNCHRO3[synchro3(l.synchro)]}
    </span>
  );
}

function Etoile({ actif, basculer }: { actif: boolean; basculer: () => void }) {
  return (
    <button
      className={`argo-etoile ${actif ? 'actif' : ''}`}
      title={actif ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      aria-label={actif ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onClick={(e) => {
        e.stopPropagation();
        basculer();
      }}
    >
      <Star size={18} fill={actif ? 'currentColor' : 'none'} />
    </button>
  );
}

function Tuile({ l, favori, etoile, ouvrir, actualiser }: { l: VueDeploiement; favori: boolean; etoile: () => void; ouvrir: (chemin?: string) => void; actualiser: () => void }) {
  const dernier = l.historique[0];
  return (
    <div className="argo-tuile" style={bordSante(l.sante)} onClick={() => ouvrir()}>
      <h3>
        <Box size={18} color="#6d7f8b" />
        {l.projet ? `${l.projet}/` : ''}
        {l.ci}
        <Etoile actif={favori} basculer={etoile} />
      </h3>
      <div className="argo-champs">
        <span>Projet :</span>
        <span>{l.projet ?? '—'}</span>
        <span>Statut :</span>
        <span>
          <Statut l={l} />
        </span>
        <span>Image :</span>
        <span title={l.image ?? undefined}>{depotDe(l.image)}</span>
        <span>En production :</span>
        <span>{l.version ?? '—'}</span>
        <span>Version visée :</span>
        <span>{l.prevue ?? '—'}</span>
        <span>Changement :</span>
        <span>{l.changementPrevu ?? '—'}</span>
        <span>Dernier déploiement :</span>
        <span>{dernier && !dernier.initial ? dateHeure(dernier.le) : '—'}</span>
      </div>
      <div className="argo-tuile-actions" onClick={(e) => e.stopPropagation()}>
        <button className="argo-bouton" onClick={() => ouvrir(lienPlanifier(l))}>
          <RefreshCw size={13} /> Planifier
        </button>
        <button className="argo-bouton" onClick={actualiser}>
          <RefreshCw size={13} /> Actualiser
        </button>
        <button className="argo-bouton" onClick={() => ouvrir(`/deploiements/${l.ci}?panneau=historique`)}>
          <History size={13} /> Historique
        </button>
      </div>
    </div>
  );
}

function Ligne({ l, favori, etoile, ouvrir }: { l: VueDeploiement; favori: boolean; etoile: () => void; ouvrir: () => void }) {
  return (
    <div className="argo-ligne" style={bordSante(l.sante)} onClick={ouvrir}>
      <Etoile actif={favori} basculer={etoile} />
      <div>
        <div>
          <span className="e">Projet :</span>
          {l.projet ?? '—'}
        </div>
        <div>
          <span className="e">Nom :</span>
          {l.ci}
        </div>
      </div>
      <div>
        <div>
          <span className="e">Image :</span>
          {depotDe(l.image)} <span className="argo-tag">{l.version ?? '—'}</span>
        </div>
        <div>
          <span className="e">Visée :</span>
          {l.prevue ? (
            <>
              {l.prevue} <span className="argo-tag">{l.changementPrevu}</span>
            </>
          ) : (
            '—'
          )}
        </div>
      </div>
      <div>
        <div className="argo-etat">
          <IconeSante s={l.sante} /> {LIBELLE_SANTE[l.sante]}
        </div>
        <div className="argo-etat">
          <IconeSynchro s={synchro3(l.synchro)} /> {LIBELLE_SYNCHRO3[synchro3(l.synchro)]}
        </div>
      </div>
      <EllipsisVertical size={18} color="var(--a-lien)" />
    </div>
  );
}

function Donut({ donnees }: { donnees: { nom: string; n: number; couleur: string }[] }) {
  const utiles = donnees.filter((d) => d.n > 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <PieChart width={150} height={150}>
        <Pie data={utiles} dataKey="n" nameKey="nom" innerRadius={42} outerRadius={70} stroke="none" isAnimationActive={false}>
          {utiles.map((d) => (
            <Cell key={d.nom} fill={d.couleur} />
          ))}
        </Pie>
      </PieChart>
      <div>
        {utiles.map((d) => (
          <div key={d.nom} className="argo-etat" style={{ display: 'flex' }}>
            <span style={{ width: 10, height: 10, background: d.couleur, borderRadius: 2, display: 'inline-block' }} /> {d.nom} : <b>{d.n}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** La vue « résumé » : la même chose en camemberts. */
function Resume({ lignes }: { lignes: VueDeploiement[] }) {
  const couleurSynchro: Record<Synchro3, string> = { synchronise: 'var(--a-vert)', desynchronise: 'var(--a-jaune)', inconnu: 'var(--a-gris)' };
  const projets = [...new Set(lignes.map((l) => l.projet ?? '—'))].sort();
  return (
    <div className="argo-resume-vue">
      <div>
        <h4>Santé</h4>
        <Donut donnees={SANTES.map((s) => ({ nom: LIBELLE_SANTE[s], n: lignes.filter((l) => l.sante === s).length, couleur: COULEUR_SANTE[s] }))} />
      </div>
      <div>
        <h4>Synchronisation</h4>
        <Donut donnees={SYNCHROS.map((s) => ({ nom: LIBELLE_SYNCHRO3[s], n: lignes.filter((l) => synchro3(l.synchro) === s).length, couleur: couleurSynchro[s] }))} />
      </div>
      <div>
        <h4>Projets</h4>
        {projets.map((n) => (
          <div key={n}>
            {n} : <b>{lignes.filter((l) => (l.projet ?? '—') === n).length}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
