import { Boxes } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { BarreProgres, Carte, Charge, Pastille, Vide } from '../components/ui';
import { Barres } from '../components/graphiques';
import { nombre, octets, pourcent } from '../../../shared/format';
import type { VueConteneurs } from '../../../shared/types';

export default function Conteneurs() {
  const etat = useDonnees<VueConteneurs>('/conteneurs');
  return (
    <Charge etat={etat}>
      {(v) => {
        if (!v.conteneurs.length) return <Carte><Vide icone={<Boxes size={28} />}>Aucun conteneur mesuré : cAdvisor est-il installé ?</Vide></Carte>;
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
                <div className={`kpi-sous ${enMarche === v.conteneurs.length ? 'vert' : 'rouge'}`}>{enMarche === v.conteneurs.length ? 'Tous les conteneurs tournent' : 'Des conteneurs sont arrêtés'}</div>
              </div>
              <div className="carte kpi">
                <div className="kpi-libelle">Mémoire totale des conteneurs</div>
                <div className="kpi-valeur">{octets(v.conteneurs.reduce((s, c) => s + (c.memoireOctets ?? 0), 0))}</div>
                <div className="kpi-sous inconnu">working set (cAdvisor)</div>
              </div>
              <div className="carte kpi">
                <div className="kpi-libelle">Redémarrages (1 h)</div>
                <div className="kpi-valeur">{nombre(v.conteneurs.reduce((s, c) => s + (c.redemarrages1h ?? 0), 0))}</div>
                <div className={`kpi-sous ${v.conteneurs.some((c) => (c.redemarrages1h ?? 0) > 0) ? 'orange' : 'vert'}`}>{v.conteneurs.some((c) => (c.redemarrages1h ?? 0) > 2) ? 'Redémarrage en boucle détecté' : 'Pas de redémarrage en boucle'}</div>
              </div>
            </div>
            <div className="grille g-principal">
              <Carte serree titre="Tous les conteneurs" sousTitre="CPU/RAM par conteneur vs limites, redémarrages">
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
                      {v.conteneurs.map((c) => (
                        <tr key={c.nom}>
                          <td className="nom-cellule mono">{c.nom}</td>
                          <td>
                            <Pastille statut={c.statut}>{c.enMarche ? (c.statut === 'vert' ? 'En marche' : c.statut === 'rouge' ? 'Instable' : 'À surveiller') : 'Arrêté'}</Pastille>
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
              </Carte>
              <Carte titre="Qui consomme la mémoire ?" sousTitre="Les plus gros en premier">
                <Barres donnees={memoire.slice(0, 12).map((c) => ({ nom: c.nom, valeur: c.memoireOctets ?? 0, couleur: c.statut === 'vert' ? '#2f5bea' : c.statut === 'orange' ? '#e5860a' : '#dc2626' }))} format={octets} />
              </Carte>
            </div>
          </div>
        );
      }}
    </Charge>
  );
}
