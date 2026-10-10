import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Archive, Bell, Boxes, CheckCircle2, Cpu, Database, Info, Radar, Rocket, ShieldCheck, ShoppingBag, Siren, Gauge } from 'lucide-react';
import { useSupervision } from '../components/Coquille';
import { Carte, Charge, IconeStatut, Jauge, Pastille, Point, Vide } from '../components/ui';
import { Courbe, Etincelle } from '../components/graphiques';
import { depuis, heure, nombre, pourcent } from '../../../shared/format';
import { LIBELLE_STATUT } from '../../../shared/seuils';
import type { Evenement, Statut, VueEtat } from '../../../shared/types';

const ICONES_KPI = { disponibilite: Gauge, debit: Activity, alertes: Bell, ventes: ShoppingBag };
const ICONES_DOMAINE: Record<string, typeof Cpu> = {
  serveur: Cpu,
  conteneurs: Boxes,
  services: Radar,
  application: Activity,
  bdd: Database,
  metier: ShoppingBag,
  sauvegardes: Archive,
  securite: ShieldCheck,
};
const COULEUR: Record<Statut, string> = { vert: '#16a34a', orange: '#e5860a', rouge: '#dc2626', inconnu: '#94a3b8' };

const TITRE_BANNIERE: Record<Statut, string> = {
  vert: 'Tout fonctionne normalement',
  orange: 'Dégradé — à surveiller',
  rouge: 'Incident en cours',
  inconnu: 'État inconnu',
};

function IconeEvenement({ e }: { e: Evenement }) {
  const Icone = e.type === 'alerte' ? Bell : e.type === 'incident' ? Siren : e.type === 'resolution' ? CheckCircle2 : e.type === 'sauvegarde' ? Archive : e.type === 'deploiement' ? Rocket : Info;
  return (
    <span className={`tuile ${e.statut}`}>
      <Icone size={15} />
    </span>
  );
}

export default function TableauDeBord() {
  const { etat, erreurEtat } = useSupervision();
  return <Charge etat={{ donnees: etat, erreur: erreurEtat }}>{(e) => <Contenu e={e} />}</Charge>;
}

function Contenu({ e }: { e: VueEtat }) {
  const budget = e.slo.budgetConsomme;
  return (
    <div className="empile">
      <div className={`banniere ${e.statut}`}>
        <div className="banniere-icone">
          <IconeStatut statut={e.statut} taille={30} />
        </div>
        <div style={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
          <h2>{TITRE_BANNIERE[e.statut]}</h2>
          <p>{e.raison}</p>
        </div>
        <div className="banniere-droite">
          Mis à jour à {heure(e.majLe)}
          <strong>{e.slo.disponibilite === null ? '—' : pourcent(e.slo.disponibilite * 100, 2)}</strong>
          disponibilité sur 30 jours
        </div>
      </div>

      <div className="grille g4">
        {e.kpis.map((k) => {
          const Icone = ICONES_KPI[k.cle as keyof typeof ICONES_KPI] ?? Activity;
          return (
            <div className="carte kpi" key={k.cle}>
              <div className="kpi-haut">
                <span className={`tuile ${k.cle === 'alertes' ? k.statut : k.cle === 'ventes' ? 'violet' : ''}`}>
                  <Icone size={18} />
                </span>
                <span className="kpi-libelle">{k.libelle}</span>
              </div>
              <div className="kpi-valeur">{k.valeur}</div>
              <div className={`kpi-sous ${k.statut}`}>{k.sousTexte}</div>
              {k.tendance.length > 1 && (
                <div className="kpi-etincelle">
                  <Etincelle points={k.tendance} couleur={k.cle === 'ventes' ? '#7c5cff' : k.statut === 'rouge' ? '#dc2626' : '#2f5bea'} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grille g-principal">
        <Carte
          titre="Trafic de l’API"
          sousTitre="Requêtes par seconde sur 24 heures, comparées à la même journée il y a 7 jours"
          droite={
            <div className="legende">
              <span>
                <i style={{ background: '#2f5bea' }} />
                Aujourd’hui
              </span>
              <span>
                <i style={{ background: '#94a3b8' }} />
                J-7
              </span>
            </div>
          }
        >
          <Courbe
            hauteur={290}
            format={(v) => nombre(v, 1)}
            series={[
              { nom: 'Aujourd’hui', points: e.trafic.debit },
              { nom: 'J-7', points: e.trafic.debitJ7, couleur: '#94a3b8', pointilles: true },
            ]}
          />
        </Carte>

        <Carte titre="Activité récente" sousTitre="Alertes, incidents, sauvegardes" droite={<Link className="lien-fleche" to="/itsm">Service desk <ArrowRight size={14} /></Link>}>
          {e.activite.length ? (
            <ul className="activite">
              {e.activite.slice(0, 7).map((a, i) => (
                <li key={`${a.t}-${i}`}>
                  <IconeEvenement e={a} />
                  <div style={{ minWidth: 0 }}>
                    <strong>{a.titre}</strong>
                    <span>{a.detail}</span>
                  </div>
                  <time>{depuis(a.t)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <Vide>Rien à signaler pour l’instant. Les alertes et incidents apparaîtront ici.</Vide>
          )}
        </Carte>
      </div>

      <div className="grille g-principal">
        <Carte serree titre="Produits et services" sousTitre="Un voyant par service métier (vue direction)" droite={<Link className="lien-fleche" to="/services">Sondes <ArrowRight size={14} /></Link>}>
          <div className="tableau-conteneur">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>État</th>
                  <th>Détail</th>
                </tr>
              </thead>
              <tbody>
                {e.services.map((s) => (
                  <tr key={s.nom}>
                    <td>
                      <div className="nom-cellule">
                        <span className={`tuile ${s.statut}`} style={{ width: 30, height: 30, borderRadius: 9 }}>
                          <IconeStatut statut={s.statut} taille={15} />
                        </span>
                        {s.nom}
                      </div>
                    </td>
                    <td>
                      <Pastille statut={s.statut} />
                    </td>
                    <td className="discret">{s.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Carte>

        <Carte titre="Objectif de disponibilité (SLO)" sousTitre={`Objectif ${pourcent(e.slo.objectif * 100, 1)} sur 30 jours`}>
          <div className="ligne-flex" style={{ justifyContent: 'space-around', gap: 18 }}>
            <Jauge
              valeur={budget === null ? null : Math.min(100, budget * 100)}
              statut={budget === null ? 'inconnu' : budget > 1 ? 'rouge' : budget > 0.5 ? 'orange' : 'vert'}
              libelle="budget consommé"
              taille={150}
            />
            <div style={{ fontSize: '0.84rem', lineHeight: 1.6, maxWidth: 220 }}>
              <div>
                <strong>Disponibilité :</strong> {e.slo.disponibilite === null ? '—' : pourcent(e.slo.disponibilite * 100, 3)}
              </div>
              <div>
                <strong>Indisponibilité permise :</strong> {nombre((1 - e.slo.objectif) * 30 * 24 * 60, 0)} min / 30 j
              </div>
              <p className="discret" style={{ marginTop: 10 }}>
                Le budget d’erreur (100 % − SLO) décide quand on freine les déploiements pour stabiliser : au-delà de 50 %, l’état passe à l’orange.
              </p>
            </div>
          </div>
        </Carte>
      </div>

      <div>
        <div className="ligne-flex mb">
          <h3 style={{ fontSize: '1.05rem' }}>Tout ce qui est surveillé</h3>
          <span className="discret">Cliquez sur un voyant pour descendre jusqu’au détail.</span>
        </div>
        <div className="grille g4">
          {e.domaines.map((d) => {
            const Icone = ICONES_DOMAINE[d.cle] ?? Activity;
            return (
              <Link to={d.lien} className="carte domaine" key={d.cle}>
                <span className={`tuile grande ${d.statut === 'vert' ? '' : d.statut}`}>
                  <Icone size={22} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <h4>
                    {d.libelle} <Point statut={d.statut} />
                  </h4>
                  <p>{d.resume}</p>
                  <span className="lien-fleche" style={{ color: COULEUR[d.statut] === '#94a3b8' ? undefined : COULEUR[d.statut] }}>
                    {LIBELLE_STATUT[d.statut]} <ArrowRight size={13} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
