import { useEffect, useState } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { useDonnees } from '../../lib/useDonnees';
import { appeler } from '../../lib/api';
import { useSupervision } from '../../components/Coquille';
import { Carte, Charge } from '../../components/ui';
import { FERIES_GABON, JOURS, type CalendrierService } from '../../../../shared/calendrier';
import type { PrioriteTicket, ReglesSla } from '../../../../shared/itsm';

interface Contexte {
  calendrier: CalendrierService;
  regles: ReglesSla;
}

const PRIORITES: PrioriteTicket[] = ['P1', 'P2', 'P3', 'P4'];
const MIN = 60_000;

/** Une durée saisie en heures (décimales permises), stockée en millisecondes. */
function ChampDuree({ valeur, changer, lecture }: { valeur: number; changer: (ms: number) => void; lecture: boolean }) {
  const [texte, setTexte] = useState(String(Math.round((valeur / 3_600_000) * 100) / 100));
  useEffect(() => setTexte(String(Math.round((valeur / 3_600_000) * 100) / 100)), [valeur]);
  return (
    <div className="ligne-flex" style={{ gap: 6, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
      <input
        className="champ"
        style={{ width: 84, textAlign: 'right' }}
        inputMode="decimal"
        value={texte}
        readOnly={lecture}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={() => {
          const h = Number(texte.replace(',', '.'));
          if (h > 0) changer(Math.round(h * 60) * MIN);
          else setTexte(String(valeur / 3_600_000));
        }}
      />
      <span className="discret">h</span>
    </div>
  );
}

/** Paramètres du service desk : calendrier de service et délais SLA. */
export default function Parametres() {
  const etat = useDonnees<Contexte>('/parametres', 0);
  const { peut } = useSupervision();
  const admin = peut('administrer');
  const [local, setLocal] = useState<Contexte | null>(null);
  const [ferie, setFerie] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  useEffect(() => {
    if (etat.donnees) setLocal(structuredClone(etat.donnees));
  }, [etat.donnees]);

  const cal = (m: Partial<CalendrierService>) => local && setLocal({ ...local, calendrier: { ...local.calendrier, ...m } });

  return (
    <Charge etat={{ donnees: local, erreur: etat.erreur }}>
      {(c) => (
        <form
          className="empile"
          onSubmit={async (e) => {
            e.preventDefault();
            setMessage(null);
            try {
              etat.remplacer(await appeler<Contexte>('/parametres', { methode: 'PUT', corps: { calendrier: c.calendrier, sla: c.regles } }));
              setMessage({ ok: true, texte: 'Enregistré. Les nouveaux délais s’appliquent aux tickets ouverts à partir de maintenant.' });
            } catch (x) {
              setMessage({ ok: false, texte: (x as Error).message });
            }
          }}
        >
          <div className="grille g2" style={{ alignItems: 'start' }}>
            <Carte titre="Calendrier de service" sousTitre="Les délais ne courent que pendant ces heures (sauf priorités 24 h/24)">
              <div className="champ-groupe">
                <label className="etiquette">Jours travaillés</label>
                <div className="chips">
                  {JOURS.map((j, i) => (
                    <label key={j} className={`pastille ${c.calendrier.jours.includes(i) ? 'bleu' : 'inconnu'}`} style={{ cursor: admin ? 'pointer' : 'default' }}>
                      <input
                        type="checkbox"
                        style={{ display: 'none' }}
                        disabled={!admin}
                        checked={c.calendrier.jours.includes(i)}
                        onChange={(e) => cal({ jours: e.target.checked ? [...c.calendrier.jours, i].sort() : c.calendrier.jours.filter((x) => x !== i) })}
                      />
                      {j}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grille g3" style={{ gap: 12 }}>
                <div className="champ-groupe">
                  <label className="etiquette">Ouverture</label>
                  <input className="champ" type="time" value={c.calendrier.debut} readOnly={!admin} onChange={(e) => cal({ debut: e.target.value })} />
                </div>
                <div className="champ-groupe">
                  <label className="etiquette">Fermeture</label>
                  <input className="champ" type="time" value={c.calendrier.fin} readOnly={!admin} onChange={(e) => cal({ fin: e.target.value })} />
                </div>
                <div className="champ-groupe">
                  <label className="etiquette">Fuseau</label>
                  <input className="champ" value={c.calendrier.fuseau} readOnly={!admin} onChange={(e) => cal({ fuseau: e.target.value })} />
                </div>
              </div>
              <div className="champ-groupe">
                <label className="etiquette">Priorités traitées 24 h/24</label>
                <div className="chips">
                  {PRIORITES.map((p) => (
                    <label key={p} className={`pastille ${c.calendrier.prioritesContinues.includes(p) ? 'rouge' : 'inconnu'}`} style={{ cursor: admin ? 'pointer' : 'default' }}>
                      <input
                        type="checkbox"
                        style={{ display: 'none' }}
                        disabled={!admin}
                        checked={c.calendrier.prioritesContinues.includes(p)}
                        onChange={(e) =>
                          cal({ prioritesContinues: e.target.checked ? [...c.calendrier.prioritesContinues, p] : c.calendrier.prioritesContinues.filter((x) => x !== p) })
                        }
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
            </Carte>

            <Carte titre={`Jours fériés (${c.calendrier.feries.length})`} sousTitre="« MM-JJ » chaque année, « AAAA-MM-JJ » pour une fête mobile (Pâques, Ascension, Aïd…)">
              <div className="chips" style={{ marginBottom: 12 }}>
                {c.calendrier.feries.map((f) => (
                  <span key={f} className="pastille bleu mono">
                    {f}
                    {admin && (
                      <button type="button" className="puce-retirer" onClick={() => cal({ feries: c.calendrier.feries.filter((x) => x !== f) })} aria-label={`Retirer ${f}`}>
                        <X size={12} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {admin && (
                <div className="ligne-flex">
                  <input className="champ mono" style={{ flex: 1 }} placeholder="2027-03-29 ou 12-25" value={ferie} onChange={(e) => setFerie(e.target.value.trim())} />
                  <button
                    type="button"
                    className="bouton"
                    onClick={() => {
                      if (/^(\d{4}-)?\d{2}-\d{2}$/.test(ferie) && !c.calendrier.feries.includes(ferie)) cal({ feries: [...c.calendrier.feries, ferie].sort() });
                      setFerie('');
                    }}
                  >
                    <Plus size={14} /> Ajouter
                  </button>
                  <button type="button" className="bouton petit" onClick={() => cal({ feries: [...new Set([...c.calendrier.feries, ...FERIES_GABON])].sort() })}>
                    Fériés fixes du Gabon
                  </button>
                </div>
              )}
            </Carte>
          </div>

          <Carte serree titre="Délais (SLA)" sousTitre="En heures ouvrées, sauf priorités 24 h/24 ; « En attente » met le délai en pause">
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Priorité</th>
                    <th className="num">Incident · prise en charge</th>
                    <th className="num">Incident · résolution</th>
                    <th className="num">Demande · prise en charge</th>
                    <th className="num">Demande · résolution</th>
                  </tr>
                </thead>
                <tbody>
                  {PRIORITES.map((p) => (
                    <tr key={p}>
                      <td>
                        <strong>{p}</strong> {c.calendrier.prioritesContinues.includes(p) && <span className="discret">· 24 h/24</span>}
                      </td>
                      {(['incident', 'demande'] as const).flatMap((type) =>
                        (['reponse', 'resolution'] as const).map((phase) => (
                          <td key={`${type}-${phase}`} className="num">
                            <ChampDuree
                              lecture={!admin}
                              valeur={c.regles[type][p][phase]}
                              changer={(ms) => setLocal({ ...c, regles: { ...c.regles, [type]: { ...c.regles[type], [p]: { ...c.regles[type][p], [phase]: ms } } } })}
                            />
                          </td>
                        )),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Carte>

          {message && <div className={message.ok ? 'encadre' : 'erreur'}>{message.texte}</div>}
          {admin && (
            <div className="ligne-flex">
              <span className="espace" />
              <button className="bouton primaire" type="submit">
                <Save size={14} /> Enregistrer les paramètres
              </button>
            </div>
          )}
        </form>
      )}
    </Charge>
  );
}
