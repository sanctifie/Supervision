import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { useSupervision } from '../components/Coquille';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { BandeStats, Carte, Charge, Pastille, Point, VoirPlus } from '../components/ui';
import { dateHeure, depuis } from '../../../shared/format';
import { LIBELLE_CATEGORIE, type Signal, type VueOutils } from '../../../shared/outils';

/** Tous les autres outils reliés, une carte compacte chacun, rendus de la même façon. */
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
        // Les outils qui ont quelque chose à dire d'abord, les non configurés à la fin.
        const ordre = (s: Signal) => (!s.configure && !s.demo ? 3 : !s.joignable ? 0 : s.statut === 'rouge' ? 0 : s.statut === 'orange' ? 1 : 2);
        const signaux = [...v.signaux].sort((a, b) => ordre(a) - ordre(b));
        return (
          <div className="empile">
            {message && <div className={message.ok ? 'encadre' : 'erreur'}>{message.texte}</div>}
            <div className="grille g3">
              {signaux.map((s) => {
                const actif = s.configure || s.demo;
                return (
                  <Carte
                    key={s.cle}
                    titre={
                      <>
                        <div className="etiquette-cat">{LIBELLE_CATEGORIE[s.categorie]}</div>
                        {s.nom}
                      </>
                    }
                    sousTitre={actif ? s.resume : `Variables : ${s.variables}`}
                    droite={
                      <Pastille statut={!actif ? 'inconnu' : !s.joignable ? 'rouge' : s.statut}>{!actif ? 'Non configuré' : !s.joignable ? 'Injoignable' : undefined}</Pastille>
                    }
                  >
                    {s.erreur && <div className="erreur">{s.erreur}</div>}
                    {s.mesures.length > 0 && <BandeStats mesures={s.mesures} />}
                    {s.lignes.length > 0 && (
                      <VoirPlus
                        elements={s.lignes}
                        n={3}
                        rendu={(lignes) => (
                          <ul className="activite" style={{ fontSize: '0.82rem' }}>
                            {lignes.map((l, i) => (
                              <li key={i}>
                                <span className={`tuile ${l.statut}`} style={{ width: 26, height: 26, borderRadius: 8 }}>
                                  <Point statut={l.statut} />
                                </span>
                                <div style={{ minWidth: 0 }}>
                                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
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
                      />
                    )}
                    {actif && !s.mesures.length && !s.lignes.length && s.joignable && <p className="discret">Rien à signaler.</p>}
                    {(s.lien ?? s.url) && (
                      <a className="lien-fleche" href={s.lien ?? (s.url as string)} target="_blank" rel="noreferrer" style={{ marginTop: 6, fontSize: '0.8rem' }}>
                        Ouvrir {s.nom} <ExternalLink size={12} />
                      </a>
                    )}
                  </Carte>
                );
              })}
            </div>
          </div>
        );
      }}
    </Charge>
  );
}
