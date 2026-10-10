import { Globe, Lock } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { Carte, Charge, Pastille, Point, Vide } from '../components/ui';
import { BandeDisponibilite } from '../components/graphiques';
import { millisecondes, nombre, pourcent } from '../../../shared/format';
import { SLO_DISPONIBILITE } from '../../../shared/seuils';
import type { VueServices } from '../../../shared/types';

export default function Services() {
  const etat = useDonnees<VueServices>('/services');
  return (
    <Charge etat={etat}>
      {(v) => (
        <div className="empile">
          <Carte titre="Sondes externes (HTTPS)" sousTitre="Le site vu comme le voit un poste de l’officine : code 200, temps de réponse, certificat">
            {v.publiques.length ? (
              <div className="grille g3">
                {v.publiques.map((p) => (
                  <div key={p.url} className={`mesure ${p.statut}`}>
                    <div className="mesure-tete">
                      <span className="ligne-flex" style={{ gap: 6 }}>
                        <Globe size={14} /> {p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                      </span>
                      <Pastille statut={p.statut}>{p.ok ? `HTTP ${p.code ?? 200}` : p.ok === false ? 'En échec' : '—'}</Pastille>
                    </div>
                    <div className="mesure-valeur">{millisecondes(p.dureeMs)}</div>
                    <div className="mesure-detail mono" style={{ wordBreak: 'break-all' }}>
                      {p.url}
                    </div>
                    <div className="mesure-seuils">
                      <span className="ligne-flex" style={{ gap: 5 }}>
                        <Lock size={11} /> Certificat : {p.joursCertificat === null ? 'non vérifié' : `${nombre(p.joursCertificat)} jours`} <Point statut={p.statutCertificat} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Vide>Aucune sonde publique : le job « site-public » de Prometheus est-il configuré ?</Vide>
            )}
          </Carte>

          <Carte
            titre="Disponibilité du site sur 7 jours"
            sousTitre="Un carré par heure"
            droite={
              <Pastille statut={v.disponibilite30j === null ? 'inconnu' : v.disponibilite30j >= SLO_DISPONIBILITE ? 'vert' : 'rouge'}>
                30 jours : {v.disponibilite30j === null ? '—' : pourcent(v.disponibilite30j * 100, 2)}
              </Pastille>
            }
          >
            {v.serieDisponibilite.length ? <BandeDisponibilite points={v.serieDisponibilite} /> : <Vide>Pas encore d’historique.</Vide>}
          </Carte>

          <Carte serree titre="Services internes" sousTitre="La sonde /health de chacun des services d’Officina, de l’intérieur (blackbox)">
            {v.internes.length ? (
              <div className="tableau-conteneur">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>État</th>
                      <th className="num">Temps de réponse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.internes.map((s) => (
                      <tr key={s.service}>
                        <td className="nom-cellule mono">{s.service}</td>
                        <td>
                          <Pastille statut={s.statut}>{s.ok ? 'Répond' : s.ok === false ? 'Injoignable' : 'Non sondé'}</Pastille>
                        </td>
                        <td className="num">{millisecondes(s.dureeMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Vide>Aucune sonde interne : le job « sondes-internes » de Prometheus est-il configuré ?</Vide>
            )}
          </Carte>
        </div>
      )}
    </Charge>
  );
}
