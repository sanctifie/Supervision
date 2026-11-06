import { useState } from 'react';
import { ExternalLink, Play, Sparkles } from 'lucide-react';
import { useSupervision } from '../components/Coquille';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, GrilleMesures, Pastille, Point } from '../components/ui';
import { dateHeure, depuis } from '../../../shared/format';
import { LIBELLE_CATEGORIE, type CategorieSignal, type Signal, type VueOutils } from '../../../shared/outils';

/** Tous les autres outils reliés, par catégorie, rendus de la même façon. */
export default function Outils() {
  const etat = useDonnees<VueOutils>('/outils', 20_000);
  const agent = useSupervision().peut('agir');
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function agir(s: Signal, action: string, cible: string) {
    setEnCours(true);
    setMessage(null);
    try {
      const r = await appeler<{ message: string }>(`/outils/signaux/${s.cle}/actions/${action}`, { methode: 'POST', corps: { cible } });
      setMessage({ ok: true, texte: r.message });
      void etat.recharger();
    } catch (e) {
      setMessage({ ok: false, texte: (e as Error).message });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Charge etat={etat}>
      {(v) => {
        const demo = v.signaux.filter((s) => s.demo);
        const categories = [...new Set(v.signaux.map((s) => s.categorie))] as CategorieSignal[];
        return (
          <div className="empile">
            {demo.length > 0 && (
              <div className="bandeau-mode">
                <Sparkles size={16} />
                <span>
                  <strong>Démonstration</strong> pour {demo.map((s) => s.nom).join(', ')} : chaque outil se relie par ses variables dans <code>.env</code> (indiquées sur sa carte).
                </span>
              </div>
            )}
            {message && <div className={message.ok ? 'encadre' : 'erreur'}>{message.texte}</div>}
            {categories.map((cat) => (
              <div key={cat} className="empile">
                <h3 style={{ fontSize: '1.05rem', margin: '6px 0 0' }}>{LIBELLE_CATEGORIE[cat]}</h3>
                <div className="grille g2">
                  {v.signaux
                    .filter((s) => s.categorie === cat)
                    .map((s) => {
                      const actif = s.configure || s.demo;
                      return (
                        <Carte
                          key={s.cle}
                          titre={s.nom}
                          sousTitre={actif ? s.resume : `Variables : ${s.variables}`}
                          droite={
                            <Pastille statut={!actif ? 'inconnu' : !s.joignable ? 'rouge' : s.statut}>
                              {!actif ? 'Non configuré' : !s.joignable ? 'Injoignable' : undefined}
                            </Pastille>
                          }
                        >
                          {s.erreur && <div className="erreur">{s.erreur}</div>}
                          {s.mesures.length > 0 && <GrilleMesures mesures={s.mesures} />}
                          {s.lignes.length > 0 && (
                            <ul className="activite" style={{ marginTop: s.mesures.length ? 12 : 0 }}>
                              {s.lignes.map((l, i) => (
                                <li key={i}>
                                  <span className={`tuile ${l.statut}`}>
                                    <Point statut={l.statut} />
                                  </span>
                                  <div style={{ minWidth: 0 }}>
                                    <strong>
                                      {l.lien ? (
                                        <a href={l.lien} target="_blank" rel="noreferrer">
                                          {l.libelle}
                                        </a>
                                      ) : (
                                        l.libelle
                                      )}
                                    </strong>
                                    <span>{l.detail}</span>
                                    {agent && s.configure && l.actions?.length ? (
                                      <span style={{ marginTop: 4, display: 'inline-flex', gap: 6 }}>
                                        {l.actions.map((a) => (
                                          <button key={a.id} className="bouton petit" disabled={enCours} onClick={() => agir(s, a.id, l.libelle)}>
                                            <Play size={12} /> {a.libelle}
                                          </button>
                                        ))}
                                      </span>
                                    ) : null}
                                  </div>
                                  {l.t && <time title={dateHeure(l.t)}>{depuis(l.t)}</time>}
                                </li>
                              ))}
                            </ul>
                          )}
                          {actif && !s.mesures.length && !s.lignes.length && s.joignable && <p className="discret">Rien à signaler.</p>}
                          {(s.lien ?? s.url) && (
                            <a className="lien-fleche" href={s.lien ?? (s.url as string)} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>
                              Ouvrir {s.nom} <ExternalLink size={13} />
                            </a>
                          )}
                        </Carte>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        );
      }}
    </Charge>
  );
}
