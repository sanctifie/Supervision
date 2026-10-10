import { useDonnees } from '../lib/useDonnees';
import { Carte, IconeStatut, Pastille, Squelette, Vide } from '../components/ui';
import { dateHeure, heure, pourcent } from '../../../shared/format';
import type { Statut } from '../../../shared/types';

interface StatutPublicDonnees {
  majLe: number;
  statut: Statut;
  nom: string;
  services: { nom: string; statut: Statut }[];
  disponibilite: number | null;
  incidents: { titre: string; statut: string; detecteLe: number; resoluLe: number | null }[];
}

const PHRASE: Record<Statut, string> = {
  vert: 'Tous les services fonctionnent normalement',
  orange: 'Certains services sont ralentis',
  rouge: 'Un incident est en cours',
  inconnu: 'État en cours de vérification',
};

const LIBELLE_PUBLIC: Record<Statut, string> = { vert: 'Opérationnel', orange: 'Perturbé', rouge: 'Panne', inconnu: 'Inconnu' };

/** Page de statut publique (guide, 3.7) : pour informer pendant un incident. */
export default function StatutPublic() {
  const { donnees: d } = useDonnees<StatutPublicDonnees>('/statut-public', 30_000);
  return (
    <div className="statut-public">
      <div className="ligne-flex" style={{ marginBottom: 26 }}>
        <img src="/logo.svg" alt="" width={34} height={34} />
        <h2>{d?.nom ?? 'Officina'} · État des services</h2>
      </div>
      {!d ? (
        <Squelette hauteur={300} />
      ) : (
        <div className="empile">
          <div className={`banniere ${d.statut}`}>
            <div className="banniere-icone">
              <IconeStatut statut={d.statut} taille={28} />
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <h2>{PHRASE[d.statut]}</h2>
              <p>Mis à jour à {heure(d.majLe)}</p>
            </div>
          </div>
          <Carte serree>
            {d.services.map((s) => (
              <div className="case" key={s.nom}>
                <div className="case-texte">
                  <strong>{s.nom}</strong>
                </div>
                <Pastille statut={s.statut}>{LIBELLE_PUBLIC[s.statut]}</Pastille>
              </div>
            ))}
          </Carte>
          <Carte titre="Incidents récents" sousTitre={d.disponibilite !== null ? `Disponibilité sur 30 jours : ${pourcent(d.disponibilite * 100, 2)}` : undefined}>
            {d.incidents.length ? (
              d.incidents.map((i, k) => (
                <div className="case" key={k} style={{ padding: '10px 0' }}>
                  <div className="case-texte">
                    <strong>{i.titre}</strong>
                    <span>
                      {dateHeure(i.detecteLe)} {i.resoluLe ? `→ résolu ${dateHeure(i.resoluLe)}` : '— en cours'}
                    </span>
                  </div>
                  <Pastille statut={i.statut === 'resolu' ? 'vert' : 'orange'}>{i.statut === 'resolu' ? 'Résolu' : 'En cours'}</Pastille>
                </div>
              ))
            ) : (
              <Vide>Aucun incident récent.</Vide>
            )}
          </Carte>
        </div>
      )}
    </div>
  );
}
