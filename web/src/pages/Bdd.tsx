import { useDonnees } from '../lib/useDonnees';
import { Carte, Charge, GrilleMesures, Pastille, Vide } from '../components/ui';
import { Barres, Courbe } from '../components/graphiques';
import { nombre, octets } from '../../../shared/format';
import type { VueBdd } from '../../../shared/types';

export default function Bdd() {
  const etat = useDonnees<VueBdd>('/bdd');
  return (
    <Charge etat={etat}>
      {(v) => (
        <div className="empile">
          <Carte titre="PostgreSQL" sousTitre="Connexions actives vs max, cache, verrous et deadlocks" droite={<Pastille statut={v.statut} />}>
            <GrilleMesures mesures={v.mesures} />
          </Carte>
          <div className="grille g2">
            <Carte titre="Connexions" sousTitre="24 dernières heures">
              <Courbe hauteur={240} format={(x) => nombre(x)} series={[{ nom: 'Connexions', points: v.serieConnexions }]} />
            </Carte>
            <Carte titre="Taille des bases" sousTitre="Une base par service d’Officina">
              {v.bases.length ? <Barres donnees={v.bases.map((b) => ({ nom: b.nom, valeur: b.tailleOctets }))} format={octets} /> : <Vide>postgres-exporter ne remonte pas les tailles.</Vide>}
            </Carte>
          </div>
        </div>
      )}
    </Charge>
  );
}
