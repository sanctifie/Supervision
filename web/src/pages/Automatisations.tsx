import { Copy } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { Carte, Charge, Pastille } from '../components/ui';
import { CaseConfirmation } from '../components/Confirmation';
import type { VueAutomatisations } from '../../../shared/types';

export default function Automatisations() {
  const etat = useDonnees<VueAutomatisations>('/automatisations', 30_000);
  return (
    <Charge etat={etat}>
      {(v) => {
        const pipelineFait = v.pipeline.filter((p) => p.statut === 'vert').length;
        return (
          <div className="empile">
            <div className="encadre">
              <strong>Principe :</strong> tout ce qu’on fait deux fois à la main devient un script, et tout script critique devient un job supervisé. Un serveur doit pouvoir être
              détruit et recréé à l’identique depuis Git en quelques minutes.
            </div>
            <Carte serree titre="Automatisations côté serveur" sousTitre="Guide, chapitre 4. Celles que la supervision peut mesurer se vérifient seules.">
              <div className="tableau-conteneur">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }} />
                      <th>Domaine</th>
                      <th>Ce qu’on automatise</th>
                      <th>Outil</th>
                      <th>État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.serveur.map((a) => (
                      <tr key={a.cle}>
                        <td>
                          <CaseConfirmation cle={`automatisation:${a.cle}`} faite={a.statut === 'vert'} auto={a.auto} apres={etat.recharger} titre={a.domaine} />
                        </td>
                        <td>
                          <strong>{a.domaine}</strong>
                        </td>
                        <td>
                          {a.libelle}
                          <div className="discret" style={{ fontSize: '0.74rem' }}>
                            {a.detail}
                          </div>
                        </td>
                        <td className="discret">
                          {a.outil}
                          {a.commande && (
                            <button
                              className="bouton petit"
                              style={{ marginLeft: 8 }}
                              title={`Copier : ${a.commande}`}
                              onClick={() => navigator.clipboard?.writeText(a.commande ?? '')}
                            >
                              <Copy size={12} /> Commande
                            </button>
                          )}
                        </td>
                        <td>
                          <Pastille statut={a.statut}>{a.statut === 'inconnu' ? 'À faire' : undefined}</Pastille>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Carte>

            <Carte
              titre={`Pipeline CI/CD — ${pipelineFait}/${v.pipeline.length} étapes en place`}
              sousTitre="Guide, chapitre 5.1 : de la qualité du code au rollback automatique. Qualité, tests et build se vérifient seuls avec SonarQube et GitLab (page Orchestration)."
            >
              <div className="grille g3">
                {v.pipeline.map((p) => (
                  <div key={p.cle} className={`mesure ${p.statut}`}>
                    <div className="ligne-flex" style={{ alignItems: 'flex-start' }}>
                      <CaseConfirmation cle={`pipeline:${p.cle}`} faite={p.statut === 'vert'} auto={p.auto} apres={etat.recharger} titre={p.etape} />
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: '0.88rem', color: 'var(--encre)' }}>{p.etape}</strong>
                        <div className="mesure-detail" style={{ marginTop: 4 }}>
                          {p.contenu}
                        </div>
                        <div className="mesure-seuils">
                          <span>Bloquant : {p.bloquant}</span>
                          {p.auto && <span>{p.detail}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Carte>
          </div>
        );
      }}
    </Charge>
  );
}
