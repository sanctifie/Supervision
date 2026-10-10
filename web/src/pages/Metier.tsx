import { OctagonAlert } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { Carte, Charge, GrilleMesures } from '../components/ui';
import { Courbe } from '../components/graphiques';
import { nombre } from '../../../shared/format';
import type { VueMetier } from '../../../shared/types';

export default function Metier() {
  const etat = useDonnees<VueMetier>('/metier');
  return (
    <Charge etat={etat}>
      {(v) => (
        <div className="empile">
          {v.anomalie && (
            <div className="encadre rouge ligne-flex">
              <OctagonAlert size={18} color="#dc2626" />
              <span>
                <strong>Anomalie métier :</strong> {v.anomalie} Même si tous les serveurs sont verts, c’est un incident.
              </span>
            </div>
          )}
          <Carte titre="Indicateurs métier" sousTitre="Souvent les plus parlants : zéro vente en heure d’ouverture = incident">
            <GrilleMesures mesures={v.mesures} />
          </Carte>
          <Carte
            titre="Ventes par heure"
            sousTitre="24 dernières heures, comparées à la même journée il y a 7 jours"
            droite={
              <div className="legende">
                <span>
                  <i style={{ background: '#7c5cff' }} />
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
              hauteur={300}
              format={(x) => nombre(x)}
              series={[
                { nom: 'Ventes', points: v.serieVentes, couleur: '#7c5cff' },
                { nom: 'J-7', points: v.serieVentesJ7, couleur: '#94a3b8', pointilles: true },
              ]}
            />
          </Carte>
          <div className="encadre">
            <strong>À ajouter côté Officina pour aller plus loin (guide, 3.6) :</strong>
            <ul className="liste-points">
              <li>Taux de succès des paiements par opérateur (Airtel Money, Moov Money), callbacks non reçus, transactions bloquées en « pending ».</li>
              <li>SMS / OTP envoyés vs reçus (un fournisseur SMS en panne bloque les inscriptions).</li>
              <li>Commandes grossiste créées vs réceptionnées, délais de traitement.</li>
            </ul>
            <p className="discret" style={{ marginBottom: 0 }}>
              Il suffit d’exposer un compteur Prometheus dans le gateway (comme <code>officine_ventes_total</code>) : il apparaîtra ici.
            </p>
          </div>
        </div>
      )}
    </Charge>
  );
}
