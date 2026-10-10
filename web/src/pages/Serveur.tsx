import { useDonnees } from '../lib/useDonnees';
import { BarreProgres, Carte, Charge, GrilleMesures, Jauge, Pastille } from '../components/ui';
import { Courbe } from '../components/graphiques';
import { SEUILS, evaluer } from '../../../shared/seuils';
import { nombre, octets, pourcent } from '../../../shared/format';
import type { VueServeur } from '../../../shared/types';

const seuilsPct = (w: number, c: number) => [
  { valeur: w, couleur: '#e5860a', libelle: `Warning ${w} %` },
  { valeur: c, couleur: '#dc2626', libelle: `Critique ${c} %` },
];

export default function Serveur() {
  const etat = useDonnees<VueServeur>('/serveur');
  return (
    <Charge etat={etat}>
      {(s) => {
        const cpu = s.groupes[0].mesures.find((m) => m.cle === 'cpu');
        const ram = s.groupes[0].mesures.find((m) => m.cle === 'memoire');
        const racine = s.partitions.find((p) => p.point === '/') ?? s.partitions[0];
        return (
          <div className="empile">
            <div className="grille g-principal">
              <Carte
                titre={s.hote}
                sousTitre={`${s.coeurs ?? '—'} cœurs · ${octets(s.memoireTotaleOctets)} de mémoire`}
                droite={<Pastille statut={s.statut} />}
              >
                <div className="ligne-flex" style={{ justifyContent: 'space-around', gap: 24, padding: '6px 0' }}>
                  <Jauge valeur={cpu?.valeur ?? null} statut={cpu?.statut ?? 'inconnu'} libelle="Processeur" />
                  <Jauge valeur={ram?.valeur ?? null} statut={ram?.statut ?? 'inconnu'} libelle="Mémoire" />
                  <Jauge valeur={racine?.utilisePct ?? null} statut={racine?.statut ?? 'inconnu'} libelle={`Disque ${racine?.point ?? '/'}`} />
                </div>
              </Carte>
              <Carte titre="Disques" sousTitre="Espace, inodes (souvent oubliés), et prédiction de remplissage">
                <div className="empile" style={{ gap: 14 }}>
                  {s.partitions.map((p) => (
                    <div key={p.point}>
                      <div className="ligne-flex" style={{ marginBottom: 6 }}>
                        <strong className="mono">{p.point}</strong>
                        <span className="discret">{octets(p.tailleOctets)}</span>
                        <span className="espace" />
                        <Pastille statut={p.statut}>{pourcent(p.utilisePct, 0)}</Pastille>
                      </div>
                      <BarreProgres valeur={p.utilisePct} statut={evaluer(p.utilisePct, SEUILS.disque)} />
                      <div className="discret" style={{ marginTop: 5, fontSize: '0.74rem' }}>
                        Inodes {pourcent(p.inodesPct, 0)} · {p.joursAvantPlein === null ? 'ne se remplit pas' : `plein dans ~${nombre(p.joursAvantPlein, p.joursAvantPlein < 3 ? 1 : 0)} jours au rythme actuel`}
                      </div>
                    </div>
                  ))}
                </div>
              </Carte>
            </div>

            <div className="grille g2">
              <Carte titre="Processeur" sousTitre="6 dernières heures">
                <Courbe series={[{ nom: 'CPU', points: s.series.cpu }]} format={(v) => `${Math.round(v)} %`} domaine={[0, 100]} seuils={seuilsPct(80, 95)} hauteur={220} />
              </Carte>
              <Carte titre="Mémoire" sousTitre="6 dernières heures, hors cache">
                <Courbe series={[{ nom: 'RAM', points: s.series.memoire, couleur: '#7c5cff' }]} format={(v) => `${Math.round(v)} %`} domaine={[0, 100]} seuils={seuilsPct(85, 95)} hauteur={220} />
              </Carte>
              <Carte titre="Remplissage du disque /" sousTitre="24 dernières heures">
                <Courbe series={[{ nom: 'Disque', points: s.series.disque, couleur: '#e5860a' }]} format={(v) => `${Math.round(v)} %`} domaine={[0, 100]} seuils={seuilsPct(80, 90)} hauteur={220} />
              </Carte>
              <Carte titre="Réseau" sousTitre="Trafic entrant et sortant, 6 dernières heures">
                <Courbe
                  series={[
                    { nom: 'Entrant', points: s.series.reseauEntree },
                    { nom: 'Sortant', points: s.series.reseauSortie, couleur: '#16a34a' },
                  ]}
                  format={(v) => `${octets(v)}/s`}
                  hauteur={220}
                />
              </Carte>
            </div>

            {s.groupes.map((g) => (
              <Carte key={g.titre} titre={g.titre}>
                <GrilleMesures mesures={g.mesures} />
              </Carte>
            ))}
          </div>
        );
      }}
    </Charge>
  );
}
