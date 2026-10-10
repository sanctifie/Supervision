import { useDonnees } from '../lib/useDonnees';
import { Carte, Charge, GrilleMesures, Pastille, Vide } from '../components/ui';
import { Courbe } from '../components/graphiques';
import { millisecondes, nombre, pourcent } from '../../../shared/format';
import type { VueApplication } from '../../../shared/types';

export default function Application() {
  const etat = useDonnees<VueApplication>('/application');
  return (
    <Charge etat={etat}>
      {(v) => (
        <div className="empile">
          <Carte titre="Les signaux d’or" sousTitre="Débit, erreurs, latence — on alerte sur les symptômes ressentis par l’utilisateur" droite={<Pastille statut={v.statut} />}>
            <GrilleMesures mesures={v.resume} />
          </Carte>

          <div className="grille g2">
            <Carte titre="Débit" sousTitre="Requêtes/s sur 24 h, et la même journée il y a 7 jours">
              <Courbe
                hauteur={220}
                format={(x) => nombre(x, 1)}
                series={[
                  { nom: 'Aujourd’hui', points: v.series.debit },
                  { nom: 'J-7', points: v.series.debitJ7, couleur: '#94a3b8', pointilles: true },
                ]}
              />
            </Carte>
            <Carte titre="Latence p95" sousTitre="95 % des requêtes répondent en moins de…">
              <Courbe
                hauteur={220}
                format={(x) => millisecondes(x)}
                series={[{ nom: 'p95', points: v.series.p95, couleur: '#7c5cff' }]}
                seuils={[
                  { valeur: 800, couleur: '#e5860a', libelle: '800 ms' },
                  { valeur: 2000, couleur: '#dc2626', libelle: '2 s' },
                ]}
              />
            </Carte>
            <Carte titre="Erreurs serveur (5xx)" sousTitre="Part des réponses en erreur, 24 h">
              <Courbe
                hauteur={220}
                format={(x) => pourcent(x, 2)}
                series={[{ nom: '5xx', points: v.series.erreurs, couleur: '#dc2626' }]}
                seuils={[{ valeur: 1, couleur: '#e5860a', libelle: '1 %' }]}
              />
            </Carte>
            <Carte titre="Runtime Node.js (gateway)" sousTitre="Event loop lag : le signal n°1 de saturation">
              <GrilleMesures mesures={v.runtime} />
            </Carte>
          </div>

          <Carte serree titre="Par service (RED)" sousTitre="Rate, Errors, Duration — mesurés au gateway, sans toucher aux services">
            {v.routes.length ? (
              <div className="tableau-conteneur">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>État</th>
                      <th className="num">Débit</th>
                      <th className="num">Erreurs 5xx</th>
                      <th className="num">Refus 401/403/429</th>
                      <th className="num">p50</th>
                      <th className="num">p95</th>
                      <th className="num">p99</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.routes.map((r) => (
                      <tr key={r.service}>
                        <td className="nom-cellule mono">{r.service}</td>
                        <td>
                          <Pastille statut={r.statut} />
                        </td>
                        <td className="num">{nombre(r.debitRps, 2)} req/s</td>
                        <td className="num">{pourcent(r.erreurs5xx === null ? null : r.erreurs5xx * 100, 2)}</td>
                        <td className="num">{pourcent(r.refus4xx === null ? null : r.refus4xx * 100, 1)}</td>
                        <td className="num">{millisecondes(r.p50)}</td>
                        <td className="num">
                          <strong>{millisecondes(r.p95)}</strong>
                        </td>
                        <td className="num">{millisecondes(r.p99)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Vide>Aucune mesure d’API : le gateway expose-t-il /metrics à Prometheus ?</Vide>
            )}
          </Carte>
        </div>
      )}
    </Charge>
  );
}
