import { useDonnees } from '../lib/useDonnees';
import { BarreProgres, Carte, Charge, Jauge, Pastille } from '../components/ui';
import { CaseConfirmation } from '../components/Confirmation';
import { dateHeure } from '../../../shared/format';
import type { VueFeuilleDeRoute } from '../../../shared/types';

export default function FeuilleDeRoute() {
  const etat = useDonnees<VueFeuilleDeRoute>('/feuille-de-route', 30_000);
  return (
    <Charge etat={etat}>
      {(v) => {
        const fait = (e: VueFeuilleDeRoute['checklist'][number]) => e.coche || e.auto === 'vert';
        const parPhase = (n: number) => {
          const elements = v.checklist.filter((e) => e.phase === n);
          return elements.length ? elements.filter(fait).length / elements.length : null;
        };
        return (
          <div className="empile">
            <div className="grille g-principal">
              <Carte titre="Les 5 phases" sousTitre="Feuille de route du guide, chapitre 10">
                {v.phases.map((p) => {
                  const avancement = parPhase(p.numero);
                  return (
                    <div className="etape" key={p.numero}>
                      <div className={`etape-numero ${avancement === 1 ? 'fait' : ''}`}>{p.numero}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ligne-flex">
                          <strong style={{ color: 'var(--encre)' }}>{p.titre}</strong>
                          <span className="pastille bleu">{p.periode}</span>
                          <span className="discret">{p.objectif}</span>
                        </div>
                        <div className="chips" style={{ margin: '8px 0' }}>
                          {p.livrables.map((l) => (
                            <span key={l} className="pastille inconnu">
                              {l}
                            </span>
                          ))}
                        </div>
                        {avancement !== null && <BarreProgres valeur={avancement * 100} statut={avancement === 1 ? 'vert' : undefined} />}
                      </div>
                    </div>
                  );
                })}
              </Carte>
              <Carte titre="Prêt pour la production ?" sousTitre="Checklist minimale avant une mise en production">
                <div style={{ display: 'grid', placeItems: 'center', padding: '10px 0 16px' }}>
                  <Jauge valeur={v.avancement * 100} statut={v.avancement === 1 ? 'vert' : v.avancement >= 0.6 ? 'orange' : 'rouge'} libelle="de la checklist" taille={170} />
                </div>
                <p className="discret" style={{ textAlign: 'center' }}>
                  {v.checklist.filter(fait).length} éléments sur {v.checklist.length}. Une case verte est vérifiée par la supervision elle-même ; une case bleue a été confirmée à la main.
                </p>
              </Carte>
            </div>

            <Carte serree titre="Checklist minimale avant une mise en production">
              {v.checklist.map((e) => (
                <div className="case" key={e.id}>
                  <CaseConfirmation cle={`checklist:${e.id}`} faite={e.coche} auto={!e.coche && e.auto === 'vert'} apres={etat.recharger} titre={e.libelle} />
                  <div className="case-texte">
                    <strong>{e.libelle}</strong>
                    {e.autoDetail && <span>{e.autoDetail}</span>}
                    {e.coche && e.cocheLe && <span>Confirmé le {dateHeure(e.cocheLe)}</span>}
                  </div>
                  <span className="pastille bleu">Phase {e.phase}</span>
                  {e.auto && e.auto !== 'vert' && !e.coche && <Pastille statut={e.auto}>{e.auto === 'orange' ? 'À compléter' : 'Manquant'}</Pastille>}
                </div>
              ))}
            </Carte>
          </div>
        );
      }}
    </Charge>
  );
}
