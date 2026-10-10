import { useState } from 'react';
import { BellOff, BellRing, BookOpen, ChevronDown, ChevronUp, Copy, Send, Siren, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, Modale, Pastille, Vide } from '../components/ui';
import { dateHeure, depuis } from '../../../shared/format';
import { RUNBOOKS, runbookDe } from '../../../shared/runbooks';
import type { Alerte, Priorite, Statut, VueAlertes } from '../../../shared/types';

export const STATUT_PRIORITE: Record<Priorite, Statut | 'bleu'> = { P1: 'rouge', P2: 'orange', P3: 'orange', Info: 'bleu' };

const NIVEAUX = [
  { p: 'P1 — Critique', def: 'Service indisponible, paiements bloqués, fuite de données', canal: 'Appel / SMS + Telegram', delai: '< 15 min, 24h/24' },
  { p: 'P2 — Majeur', def: 'Dégradation forte, fonctionnalité clé cassée', canal: 'Telegram + push', delai: '< 1 h en journée' },
  { p: 'P3 — Mineur', def: 'Anomalie sans impact client direct', canal: 'Telegram / e-mail', delai: 'Jour ouvré suivant' },
  { p: 'Info', def: 'Tendance à surveiller (disque qui monte)', canal: 'Tableau de bord, rapport hebdo', delai: 'Planification' },
];

function CarteAlerte({ a, silence, declarer }: { a: Alerte; silence: (a: Alerte) => void; declarer: (a: Alerte) => void }) {
  const [ouvert, setOuvert] = useState(a.priorite === 'P1');
  const rb = runbookDe(a.nom);
  const etiquettes = Object.entries(a.labels).filter(([k]) => !['alertname', 'gravite', 'priorite'].includes(k));
  return (
    <div className={`carte`} style={{ borderLeft: `4px solid ${a.priorite === 'P1' ? '#dc2626' : a.priorite === 'Info' ? '#2f5bea' : '#e5860a'}` }}>
      <div className="ligne-flex">
        <Pastille statut={STATUT_PRIORITE[a.priorite]}>{a.priorite}</Pastille>
        <strong style={{ color: 'var(--encre)' }}>{a.nom}</strong>
        {a.silencieuse && (
          <Pastille statut="violet">
            <BellOff size={11} /> silencieuse
          </Pastille>
        )}
        <span className="espace" />
        <span className="discret" title={dateHeure(a.debut)}>
          depuis {depuis(a.debut).replace('il y a ', '')}
        </span>
      </div>
      <p style={{ margin: '10px 0 8px', fontSize: '0.95rem' }}>{a.resume}</p>
      {etiquettes.length > 0 && (
        <div className="chips" style={{ marginBottom: 10 }}>
          {etiquettes.map(([k, v]) => (
            <span key={k} className="pastille inconnu mono">
              {k}={v}
            </span>
          ))}
        </div>
      )}
      {a.action && (
        <div className="encadre ligne-flex" style={{ padding: '8px 12px' }}>
          <code style={{ flex: 1, wordBreak: 'break-word' }}>{a.action}</code>
          <button className="bouton petit" onClick={() => navigator.clipboard?.writeText(a.action)} title="Copier">
            <Copy size={13} />
          </button>
        </div>
      )}
      <div className="ligne-flex" style={{ marginTop: 12 }}>
        {rb && (
          <button className="bouton petit" onClick={() => setOuvert(!ouvert)}>
            <BookOpen size={13} /> Runbook {ouvert ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
        <span className="espace" />
        {!a.silencieuse && (
          <button className="bouton petit" onClick={() => silence(a)}>
            <BellOff size={13} /> Mettre en silence
          </button>
        )}
        <button className="bouton petit" onClick={() => declarer(a)}>
          <Siren size={13} /> Déclarer un incident
        </button>
      </div>
      {ouvert && rb && (
        <div className="grille g2" style={{ marginTop: 14 }}>
          <div>
            <strong style={{ fontSize: '0.82rem' }}>Quoi vérifier</strong>
            <ol className="liste-points">
              {rb.verifier.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          </div>
          <div>
            <strong style={{ fontSize: '0.82rem' }}>Quoi faire</strong>
            <ol className="liste-points">
              {rb.agir.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Alertes() {
  const etat = useDonnees<VueAlertes>('/alertes', 10_000);
  const naviguer = useNavigate();
  const [cible, setCible] = useState<Alerte | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [commentaire, setCommentaire] = useState('Maintenance planifiée');
  const [message, setMessage] = useState<string | null>(null);
  const [runbooksOuverts, setRunbooksOuverts] = useState(false);

  async function poserSilence() {
    if (!cible) return;
    const correspondances = [{ nom: 'alertname', valeur: cible.nom }, ...['service', 'instance'].filter((k) => cible.labels[k]).map((k) => ({ nom: k, valeur: cible.labels[k] }))];
    try {
      await appeler('/silences', { methode: 'POST', corps: { correspondances, minutes, commentaire } });
      setCible(null);
      void etat.recharger();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function declarer(a: Alerte) {
    const niveaux = { P1: [1, 1], P2: [1, 2], P3: [2, 2], Info: [3, 3] }[a.priorite];
    const t = await appeler<{ numero: string }>('/tickets', {
      methode: 'POST',
      corps: {
        type: 'incident',
        titre: a.resume || a.nom,
        description: `Depuis l’alerte ${a.nom}${a.action ? `\nPremière action : ${a.action}` : ''}`,
        impact: niveaux[0],
        urgence: niveaux[1],
        ci: a.labels.service ?? null,
        groupe: 'Exploitation',
      },
    });
    naviguer(`/tickets/${t.numero}`);
  }

  async function test() {
    try {
      await appeler('/alertes/test', { methode: 'POST', corps: {} });
      setMessage('Alerte de test envoyée. Vérifiez sa réception sur Telegram / e-mail, puis cochez « Canal d’alerte testé » dans la feuille de route.');
      void etat.recharger();
    } catch (e) {
      setMessage(`Envoi impossible : ${(e as Error).message}`);
    }
  }

  return (
    <div className="empile">
      <div className="ligne-flex">
        <span className="discret">Chaque alerte doit être actionnable et pointer vers un runbook. Les alertes P1 et P2 ouvrent un ticket d’incident automatiquement.</span>
        <span className="espace" />
        <button className="bouton primaire" onClick={test}>
          <Send size={15} /> Envoyer une alerte de test
        </button>
      </div>
      {message && <div className="encadre">{message}</div>}

      <Charge etat={etat}>
        {(v) => (
          <>
            {v.alertes.length ? (
              <div className="empile">
                {v.alertes.map((a) => (
                  <CarteAlerte key={a.id} a={a} silence={setCible} declarer={declarer} />
                ))}
              </div>
            ) : (
              <Carte>
                <Vide icone={<BellRing size={28} />}>Aucune alerte active. Tout est calme.</Vide>
              </Carte>
            )}

            <Carte serree titre="Silences" sousTitre="Pendant une maintenance planifiée, pour ne pas réveiller l’astreinte">
              {v.silences.length ? (
                <table className="tableau">
                  <thead>
                    <tr>
                      <th>Cible</th>
                      <th>Motif</th>
                      <th>Par</th>
                      <th>Jusqu’à</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {v.silences.map((s) => (
                      <tr key={s.id}>
                        <td className="mono">{s.correspondances.map((c) => `${c.nom}=${c.valeur}`).join(', ')}</td>
                        <td>{s.commentaire}</td>
                        <td>{s.auteur}</td>
                        <td>{dateHeure(s.fin)}</td>
                        <td className="num">
                          <button
                            className="bouton petit danger"
                            onClick={async () => {
                              await appeler(`/silences/${encodeURIComponent(s.id)}`, { methode: 'DELETE' });
                              void etat.recharger();
                            }}
                          >
                            <Trash2 size={13} /> Lever
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Vide>Aucun silence en cours.</Vide>
              )}
            </Carte>
          </>
        )}
      </Charge>

      <Carte serree titre="Niveaux de sévérité" sousTitre="Gravité Officina « critique » = P1 ; « attention » = P2 ou P3 selon l’alerte">
        <table className="tableau">
          <thead>
            <tr>
              <th>Niveau</th>
              <th>Définition</th>
              <th>Canal</th>
              <th>Délai de réaction</th>
            </tr>
          </thead>
          <tbody>
            {NIVEAUX.map((n, i) => (
              <tr key={n.p}>
                <td>
                  <Pastille statut={(['rouge', 'orange', 'orange', 'bleu'] as const)[i]}>{n.p}</Pastille>
                </td>
                <td>{n.def}</td>
                <td>{n.canal}</td>
                <td>{n.delai}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Carte>

      <Carte
        titre={`Runbooks (${RUNBOOKS.length})`}
        sousTitre="Un par alerte : quoi vérifier, quoi faire"
        droite={
          <button className="bouton petit" onClick={() => setRunbooksOuverts(!runbooksOuverts)}>
            {runbooksOuverts ? 'Replier' : 'Tout afficher'}
          </button>
        }
      >
        {runbooksOuverts ? (
          <div className="grille g2">
            {RUNBOOKS.map((r) => (
              <div key={r.alerte} className="mesure inconnu">
                <div className="ligne-flex">
                  <Pastille statut={STATUT_PRIORITE[r.priorite]}>{r.priorite}</Pastille>
                  <strong className="mono" style={{ fontSize: '0.8rem' }}>
                    {r.alerte}
                  </strong>
                </div>
                <div style={{ fontWeight: 600, margin: '8px 0 4px' }}>{r.titre}</div>
                <ul className="liste-points" style={{ fontSize: '0.78rem' }}>
                  {[...r.verifier, ...r.agir].map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="discret" style={{ margin: 0 }}>
            {RUNBOOKS.map((r) => r.alerte).join(' · ')}
          </p>
        )}
      </Carte>

      {cible && (
        <Modale titre={`Mettre « ${cible.nom} » en silence`} fermer={() => setCible(null)}>
          <label className="etiquette">Durée</label>
          <select className="champ" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            <option value={30}>30 minutes</option>
            <option value={60}>1 heure</option>
            <option value={240}>4 heures</option>
            <option value={720}>12 heures</option>
            <option value={1440}>24 heures</option>
          </select>
          <label className="etiquette" style={{ marginTop: 14 }}>
            Motif
          </label>
          <input className="champ" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
          <p className="discret">Le silence ne masque que cette alerte {cible.labels.service ? `pour le service ${cible.labels.service}` : ''}. Elle reste visible ici, marquée « silencieuse ».</p>
          <div className="ligne-flex" style={{ justifyContent: 'flex-end' }}>
            <button className="bouton" onClick={() => setCible(null)}>
              Annuler
            </button>
            <button className="bouton primaire" onClick={poserSilence}>
              <BellOff size={14} /> Poser le silence
            </button>
          </div>
        </Modale>
      )}
    </div>
  );
}
