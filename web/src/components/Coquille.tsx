import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ExternalLink, LogOut, Menu, Search, Sparkles } from 'lucide-react';
import { PAGES } from '../pages/liste';
import { useDonnees } from '../lib/useDonnees';
import { Point } from './ui';
import type { VueEtat, Statut } from '../../../shared/types';

interface Contexte {
  etat: VueEtat | null;
  erreurEtat: string | null;
  rechargerEtat: () => Promise<void>;
  nom: string;
  produit: string;
}

const ContexteSupervision = createContext<Contexte | null>(null);

export function useSupervision(): Contexte {
  const c = useContext(ContexteSupervision);
  if (!c) throw new Error('useSupervision hors de la coquille');
  return c;
}

function initiales(nom: string) {
  return (
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((m) => m[0]?.toUpperCase())
      .join('') || 'S'
  );
}

export function Coquille({ nom, produit, seDeconnecter, children }: { nom: string; produit: string; seDeconnecter: () => void; children: ReactNode }) {
  const { donnees: etat, erreur, recharger } = useDonnees<VueEtat>('/etat', 15_000);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [focus, setFocus] = useState(0);
  const lieu = useLocation();
  const naviguer = useNavigate();

  const page = PAGES.find((p) => (p.chemin === '/' ? lieu.pathname === '/' : lieu.pathname.startsWith(p.chemin))) ?? PAGES[0];
  const statutDomaine = (cle?: string): Statut | null => (cle && etat ? (etat.domaines.find((d) => d.cle === cle)?.statut ?? null) : null);
  const alertesActives = etat?.kpis.find((k) => k.cle === 'alertes')?.valeur ?? '0';

  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return [];
    return PAGES.filter((p) => `${p.titre} ${p.description} ${p.motsCles ?? ''}`.toLowerCase().includes(q)).slice(0, 6);
  }, [recherche]);

  const contexte = useMemo<Contexte>(() => ({ etat, erreurEtat: erreur, rechargerEtat: recharger, nom, produit }), [etat, erreur, recharger, nom, produit]);
  const groupes = [...new Set(PAGES.map((p) => p.groupe))];
  const bonjour = new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir';

  return (
    <ContexteSupervision.Provider value={contexte}>
      <div className="coquille">
        <aside className={`barre ${menuOuvert ? 'ouverte' : ''}`}>
          <div className="marque">
            <img src="/logo.svg" alt="" />
            <div>
              Supervision
              <small>{produit}</small>
            </div>
          </div>
          {groupes.map((g) => (
            <div key={g}>
              <div className="nav-titre">{g}</div>
              {PAGES.filter((p) => p.groupe === g).map((p) => {
                const s = statutDomaine(p.domaine);
                const Icone = p.icone;
                return (
                  <NavLink key={p.chemin} to={p.chemin} end={p.chemin === '/'} className={({ isActive }) => `nav-lien ${isActive ? 'actif' : ''}`} onClick={() => setMenuOuvert(false)}>
                    <Icone size={18} />
                    {p.titre}
                    {s && s !== 'vert' && s !== 'inconnu' && <Point statut={s} />}
                  </NavLink>
                );
              })}
            </div>
          ))}
          <div className="carte-grafana">
            <strong>
              <Sparkles size={14} style={{ verticalAlign: -2, marginRight: 6, color: '#2f5bea' }} />
              Aller plus loin
            </strong>
            <p>{etat?.sources.grafanaUrl ? 'Les tableaux Grafana détaillés, les journaux bruts et l’historique long.' : 'Renseignez GRAFANA_URL pour relier les tableaux Grafana détaillés.'}</p>
            {etat?.sources.grafanaUrl ? (
              <a className="bouton primaire petit" href={etat.sources.grafanaUrl} target="_blank" rel="noreferrer">
                Ouvrir Grafana <ExternalLink size={13} />
              </a>
            ) : (
              <a className="bouton petit" href="/statut" target="_blank" rel="noreferrer">
                Page de statut publique <ExternalLink size={13} />
              </a>
            )}
          </div>
        </aside>

        <main className="contenu">
          <header className="entete">
            <button className="icone-bouton menu-mobile" onClick={() => setMenuOuvert(!menuOuvert)} aria-label="Menu">
              <Menu size={18} />
            </button>
            <div className="entete-titre">
              {page.chemin === '/' ? (
                <>
                  <h1>
                    {bonjour}, {nom.split(' ')[0]} 👋
                  </h1>
                  <p>Voici l’état de {produit} en ce moment.</p>
                </>
              ) : (
                <>
                  <h1>{page.titre}</h1>
                  <p>{page.description}</p>
                </>
              )}
            </div>
            <div className="entete-actions">
              <div className="recherche">
                <Search size={16} />
                <input
                  placeholder="Rechercher une vue…"
                  value={recherche}
                  onChange={(e) => {
                    setRecherche(e.target.value);
                    setFocus(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') setFocus((f) => Math.min(f + 1, resultats.length - 1));
                    if (e.key === 'ArrowUp') setFocus((f) => Math.max(f - 1, 0));
                    if (e.key === 'Enter' && resultats[focus]) {
                      naviguer(resultats[focus].chemin);
                      setRecherche('');
                    }
                    if (e.key === 'Escape') setRecherche('');
                  }}
                  aria-label="Rechercher une vue"
                />
                {resultats.length > 0 && (
                  <div className="recherche-resultats">
                    {resultats.map((r, i) => (
                      <a
                        key={r.chemin}
                        href={r.chemin}
                        className={i === focus ? 'focus' : ''}
                        onClick={(e) => {
                          e.preventDefault();
                          naviguer(r.chemin);
                          setRecherche('');
                        }}
                      >
                        {r.titre}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <button className="icone-bouton" onClick={() => naviguer('/alertes')} aria-label={`${alertesActives} alertes actives`} title="Alertes actives">
                <Bell size={18} />
                {alertesActives !== '0' && <span className="badge-compteur">{alertesActives}</span>}
              </button>
              <button className="icone-bouton" onClick={seDeconnecter} title="Se déconnecter" aria-label="Se déconnecter">
                <LogOut size={17} />
              </button>
              <div className="avatar" title={nom}>
                {initiales(nom)}
              </div>
            </div>
          </header>

          {etat?.sources.mode === 'demo' && (
            <div className="bandeau-mode">
              <Sparkles size={16} />
              <span>
                <strong>Données de démonstration.</strong> Prometheus n’est pas joignable : la supervision montre une officine fictive. Renseignez <code>PROMETHEUS_URL</code> (voir le README) pour voir vos vrais serveurs.
              </span>
            </div>
          )}
          {children}
        </main>
      </div>
    </ContexteSupervision.Provider>
  );
}
