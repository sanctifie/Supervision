import { useDonnees } from '../lib/useDonnees';
import { Carte, Charge, GrilleMesures, Pastille } from '../components/ui';
import { CaseConfirmation } from '../components/Confirmation';
import type { VueSecurite } from '../../../shared/types';

const MESURES_AUTO = new Set(['pin', 'https', 'rate-limit']);

export default function Securite() {
  const etat = useDonnees<VueSecurite>('/securite', 30_000);
  return (
    <Charge etat={etat}>
      {(v) => {
        const couches = [...new Set(v.controles.map((c) => c.couche))];
        const enPlace = v.controles.filter((c) => c.statut === 'vert').length;
        return (
          <div className="empile">
            <Carte titre="Signaux mesurés" sousTitre="Ce que la supervision voit elle-même" droite={<Pastille statut={v.statut} />}>
              <GrilleMesures mesures={v.mesures} />
            </Carte>
            <Carte serree titre={`Contrôles de sécurité — ${enPlace}/${v.controles.length} en place`} sousTitre="Guide, chapitres 2.6 et 6. Cochez ce qui est en place ; les signaux mesurés se cochent seuls.">
              {couches.map((couche) => (
                <div key={couche}>
                  <div className="nav-titre" style={{ padding: '14px 18px 4px' }}>
                    {couche}
                  </div>
                  {v.controles
                    .filter((c) => c.couche === couche)
                    .map((c) => (
                      <div className="case" key={c.cle}>
                        <CaseConfirmation cle={`securite:${c.cle}`} faite={c.statut === 'vert'} auto={MESURES_AUTO.has(c.cle) && c.statut !== 'inconnu'} apres={etat.recharger} titre={c.libelle} />
                        <div className="case-texte">
                          <strong>{c.libelle}</strong>
                          <span>
                            {c.detail} · <em>{c.outil}</em>
                          </span>
                        </div>
                        <Pastille statut={c.statut}>{c.statut === 'inconnu' ? 'À faire' : undefined}</Pastille>
                      </div>
                    ))}
                </div>
              ))}
            </Carte>
          </div>
        );
      }}
    </Charge>
  );
}
