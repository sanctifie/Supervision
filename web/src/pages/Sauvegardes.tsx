import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { Carte, Charge, GrilleMesures, Jauge, Pastille } from '../components/ui';
import { dateHeure, depuis } from '../../../shared/format';
import type { VueSauvegardes } from '../../../shared/types';

export default function Sauvegardes() {
  const etat = useDonnees<VueSauvegardes>('/sauvegardes');
  return (
    <Charge etat={etat}>
      {(v) => {
        const age = v.mesures[0].valeur;
        return (
          <div className="empile">
            <div className="grille g-principal">
              <Carte titre="Dernière sauvegarde réussie" sousTitre="Mesure déposée par deploy/backup.sh (dossier supervision/mesures)" droite={<Pastille statut={v.statut} />}>
                <div className="ligne-flex" style={{ gap: 28 }}>
                  <Jauge valeur={age === null ? null : Math.min(100, (age / 48) * 100)} statut={v.statut} libelle="sur 48 h" texte={age === null ? '—' : `${Math.round(age)} h`} />
                  <div style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>
                    <div>
                      <strong>Le</strong> {dateHeure(v.derniereReussite)}
                    </div>
                    <div className="discret">{depuis(v.derniereReussite)}</div>
                    <p className="discret" style={{ maxWidth: 360 }}>
                      Orange au-delà de 26 h (une nuit manquée), rouge au-delà de 48 h.
                    </p>
                  </div>
                </div>
              </Carte>
              <Carte titre="Règle 3-2-1">
                <ul className="liste-points" style={{ marginTop: 0 }}>
                  <li>
                    <strong>3</strong> copies des données,
                  </li>
                  <li>
                    sur <strong>2</strong> supports différents,
                  </li>
                  <li>
                    dont <strong>1</strong> hors site, chiffrée (restic, Borg).
                  </li>
                </ul>
                <p className="discret">Une sauvegarde n’existe que si sa restauration a été testée : automatisez-la chaque semaine dans un environnement jetable.</p>
                <Link to="/feuille-de-route" className="lien-fleche">
                  Cocher dans la checklist <ArrowRight size={13} />
                </Link>
              </Carte>
            </div>
            <Carte titre="Mesures">
              <GrilleMesures mesures={v.mesures} />
            </Carte>
          </div>
        );
      }}
    </Charge>
  );
}
