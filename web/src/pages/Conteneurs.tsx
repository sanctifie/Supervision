import { useState } from 'react';
import { Boxes, List, ListTree } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { BarreProgres, Carte, Charge, Pages, Pastille, Vide } from '../components/ui';
import { Barres } from '../components/graphiques';
import { useSupervision } from '../components/Coquille';
import { nombre, octets, pourcent } from '../../../shared/format';
import { pire } from '../../../shared/seuils';
import type { Statut, VueConteneurs } from '../../../shared/types';

type Conteneur = VueConteneurs['conteneurs'][number];

/** Les conteneurs connus rangés par rôle ; tout le reste est un service de l'application. */
const ROLES: [string, string[]][] = [
  ['Entrée', ['caddy', 'gateway', 'traefik', 'nginx']],
  ['Données et messagerie', ['postgres', 'redis', 'nats', 'syncd']],
  ['Supervision', ['prometheus', 'alertmanager', 'grafana', 'loki', 'alloy', 'cadvisor', 'node-exporter', 'blackbox', 'supervision']],
];

function Noeud({ nom, statut, detail }: { nom: string; statut: Statut; detail?: string }) {
  return (
    <div className={`noeud ${statut}`}>
      <strong>{nom}</strong>
      {detail && <span className="discret">{detail}</span>}
    </div>
  );
}

/** La hiérarchie produit → rôle → conteneur, lue de gauche à droite. */
function Arbre({ v, produit }: { v: VueConteneurs; produit: string }) {
  const range = new Set(ROLES.flatMap(([, noms]) => noms));
  const groupes: [string, Conteneur[]][] = [
    ['Services applicatifs', v.conteneurs.filter((c) => !range.has(c.nom))],
    ...ROLES.map(([titre, noms]): [string, Conteneur[]] => [titre, v.conteneurs.filter((c) => noms.includes(c.nom))]),
  ];
  return (
    <div className="arbre">
      <Noeud nom={produit} statut={v.statut} detail={`${v.conteneurs.length} conteneurs`} />
      <div className="arbre-branches">
        {groupes
          .filter(([, liste]) => liste.length)
          .map(([titre, liste]) => (
            <div className="arbre-branche" key={titre}>
              <Noeud nom={titre} statut={pire('vert', ...liste.map((c) => c.statut))} detail={`${liste.filter((c) => c.enMarche).length} / ${liste.length} en marche`} />
              <div className="arbre-feuilles">
                {liste.map((c) => (
                  <Noeud
                    key={c.nom}
                    nom={c.nom}
                    statut={c.statut}
                    detail={c.enMarche ? `${c.cpuPct === null ? '—' : pourcent(c.cpuPct, 1)} · ${c.memoireOctets === null ? '—' : octets(c.memoireOctets)}` : 'Arrêté'}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function Conteneurs() {
  const etat = useDonnees<VueConteneurs>('/conteneurs');
  const { produit } = useSupervision();
  const [vue, setVue] = useState<'arbre' | 'liste'>('arbre');
  return (
    <Charge etat={etat}>
      {(v) => {
        if (!v.conteneurs.length)
          return (
            <Carte>
              <Vide icone={<Boxes size={28} />}>Aucun conteneur mesuré : cAdvisor est-il installé ?</Vide>
            </Carte>
          );
        const enMarche = v.conteneurs.filter((c) => c.enMarche).length;
        const memoire = [...v.conteneurs].filter((c) => c.memoireOctets).sort((a, b) => (b.memoireOctets ?? 0) - (a.memoireOctets ?? 0));
        return (
          <div className="empile">
            <div className="grille g3">
              <div className="carte kpi">
                <div className="kpi-libelle">En marche</div>
                <div className="kpi-valeur">
                  {enMarche} / {v.conteneurs.length}
                </div>
                <div className={`kpi-sous ${enMarche === v.conteneurs.length ? 'vert' : 'rouge'}`}>
                  {enMarche === v.conteneurs.length ? 'Tous les conteneurs tournent' : 'Des conteneurs sont arrêtés'}
                </div>
              </div>
              <div className="carte kpi">
                <div className="kpi-libelle">Mémoire totale des conteneurs</div>
                <div className="kpi-valeur">{octets(v.conteneurs.reduce((s, c) => s + (c.memoireOctets ?? 0), 0))}</div>
                <div className="kpi-sous inconnu">working set (cAdvisor)</div>
              </div>
              <div className="carte kpi">
                <div className="kpi-libelle">Redémarrages (1 h)</div>
                <div className="kpi-valeur">{nombre(v.conteneurs.reduce((s, c) => s + (c.redemarrages1h ?? 0), 0))}</div>
                <div className={`kpi-sous ${v.conteneurs.some((c) => (c.redemarrages1h ?? 0) > 0) ? 'orange' : 'vert'}`}>
                  {v.conteneurs.some((c) => (c.redemarrages1h ?? 0) > 2) ? 'Redémarrage en boucle détecté' : 'Pas de redémarrage en boucle'}
                </div>
              </div>
            </div>
            <div className="onglets" style={{ alignSelf: 'flex-start' }}>
              <button className={vue === 'arbre' ? 'actif' : ''} onClick={() => setVue('arbre')}>
                <ListTree size={13} style={{ verticalAlign: -2 }} /> Arbre
              </button>
              <button className={vue === 'liste' ? 'actif' : ''} onClick={() => setVue('liste')}>
                <List size={13} style={{ verticalAlign: -2 }} /> Liste
              </button>
            </div>
            {vue === 'arbre' && (
              <Carte titre="Hiérarchie" sousTitre="Le produit, ses rôles, ses conteneurs : la couleur d’un nœud est celle de son pire enfant">
                <Arbre v={v} produit={produit} />
              </Carte>
            )}
            <div className="grille g-principal" style={vue === 'liste' ? undefined : { display: 'none' }}>
              <Carte serree titre="Tous les conteneurs" sousTitre="CPU/RAM par conteneur vs limites, redémarrages">
                <Pages liste={v.conteneurs}>
                  {(visibles) => (
                    <div className="tableau-conteneur">
                      <table className="tableau">
                        <thead>
                          <tr>
                            <th>Conteneur</th>
                            <th>État</th>
                            <th className="num">CPU</th>
                            <th className="num">Mémoire</th>
                            <th>Limite</th>
                            <th className="num">Redém. 1 h</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibles.map((c) => (
                            <tr key={c.nom}>
                              <td className="nom-cellule mono">{c.nom}</td>
                              <td>
                                <Pastille statut={c.statut}>
                                  {c.enMarche ? (c.statut === 'vert' ? 'En marche' : c.statut === 'rouge' ? 'Instable' : 'À surveiller') : 'Arrêté'}
                                </Pastille>
                              </td>
                              <td className="num">{pourcent(c.cpuPct, 1)}</td>
                              <td className="num">{octets(c.memoireOctets)}</td>
                              <td style={{ minWidth: 140 }}>
                                {c.limiteOctets ? (
                                  <>
                                    <BarreProgres valeur={c.memoirePctLimite} statut={c.statut} />
                                    <span className="discret" style={{ fontSize: '0.72rem' }}>
                                      {pourcent(c.memoirePctLimite, 0)} de {octets(c.limiteOctets)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="discret">aucune</span>
                                )}
                              </td>
                              <td className="num">{nombre(c.redemarrages1h)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Pages>
              </Carte>
              <Carte titre="Qui consomme la mémoire ?" sousTitre="Les plus gros en premier">
                <Barres
                  donnees={memoire
                    .slice(0, 12)
                    .map((c) => ({ nom: c.nom, valeur: c.memoireOctets ?? 0, couleur: c.statut === 'vert' ? '#2f5bea' : c.statut === 'orange' ? '#e5860a' : '#dc2626' }))}
                  format={octets}
                />
              </Carte>
            </div>
          </div>
        );
      }}
    </Charge>
  );
}
