import { useState } from 'react';
import { useDonnees } from '../../lib/useDonnees';
import { appeler } from '../../lib/api';
import { Carte, Erreur, Pages, Squelette } from '../../components/ui';
import { BadgeSla, LienTicket, PastillePriorite } from '../../components/itsm';
import { useSupervision } from '../../components/Coquille';
import { LIBELLE_TYPE, STATUTS, TRANSITIONS, libelleStatut, type TicketResume, type TypeTicket } from '../../../../shared/itsm';

const TYPES: TypeTicket[] = ['incident', 'probleme', 'changement', 'demande'];
/** Une colonne terminée ne garde que ce qui a bougé depuis deux semaines. */
const RECENT_MS = 14 * 86_400_000;

/** Le tableau kanban : une colonne par étape, on glisse un ticket pour le faire avancer. */
export default function Tableau() {
  const [type, setType] = useState<TypeTicket>('incident');
  const [moi, setMoi] = useState(false);
  const etat = useDonnees<TicketResume[]>(`/tickets?type=${type}&etat=tous${moi ? '&assigne=moi' : ''}`, 20_000);
  const { peut } = useSupervision();
  const agent = peut('agir');
  const [erreur, setErreur] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);

  // Le serveur applique les règles (transitions permises, champs obligatoires) : son refus s'affiche tel quel.
  const deplacer = async (numero: string, statut: string) => {
    try {
      await appeler(`/tickets/${numero}/statut`, { methode: 'POST', corps: { statut } });
      setErreur(null);
    } catch (e) {
      setErreur(`${numero} : ${(e as Error).message}`);
    }
    await etat.recharger();
  };

  return (
    <div className="empile">
      <div className="filtres">
        <div className="onglets">
          {TYPES.map((t) => (
            <button key={t} className={type === t ? 'actif' : ''} onClick={() => setType(t)}>
              {LIBELLE_TYPE[t].des}
            </button>
          ))}
        </div>
        <label className="ligne-flex" style={{ gap: 6, fontSize: '0.86rem' }}>
          <input type="checkbox" checked={moi} onChange={(e) => setMoi(e.target.checked)} /> Assignés à moi
        </label>
      </div>
      {erreur && (
        <div className="erreur" role="alert">
          {erreur}
        </div>
      )}
      {etat.erreur ? (
        <Erreur message={etat.erreur} />
      ) : !etat.donnees ? (
        <Squelette hauteur={320} />
      ) : (
        <div className="kanban">
          {STATUTS[type]
            .filter((s) => !s.horsParcours)
            .map((s) => {
              const tickets = etat.donnees!.filter((t) => t.statut === s.cle && (!s.final || Date.now() - t.majLe < RECENT_MS));
              return (
                <section
                  key={s.cle}
                  className={`colonne ${survol === s.cle ? 'survol' : ''}`}
                  aria-label={s.libelle}
                  onDragOver={(e) => {
                    if (!agent) return;
                    e.preventDefault();
                    setSurvol(s.cle);
                  }}
                  onDragLeave={() => setSurvol(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setSurvol(null);
                    const numero = e.dataTransfer.getData('text/plain');
                    const t = etat.donnees!.find((x) => x.numero === numero);
                    if (t && t.statut !== s.cle) void deplacer(numero, s.cle);
                  }}
                >
                  <h4>
                    {s.libelle} <span className="discret">{tickets.length}</span>
                  </h4>
                  <Pages key={`${type}-${moi}`} liste={tickets} parPage={5}>
                    {(visibles) => (
                      <>
                        {visibles.map((t) => (
                          <Carte key={t.id} className="fiche">
                            <div draggable={agent} onDragStart={(e) => e.dataTransfer.setData('text/plain', t.numero)}>
                              <div className="ligne-flex" style={{ gap: 6 }}>
                                <LienTicket t={t} />
                                <span className="espace" />
                                <PastillePriorite p={t.priorite} />
                              </div>
                              <p>{t.titre}</p>
                              <div className="ligne-flex" style={{ gap: 6, flexWrap: 'wrap' }}>
                                <span className="discret">{t.assigneA ?? t.groupe ?? 'Non assigné'}</span>
                                <span className="espace" />
                                <BadgeSla etat={t.sla} echeance={t.echeance} />
                              </div>
                              {/* Au clavier ou au doigt : le même déplacement, sans glisser. */}
                              {agent && TRANSITIONS[type][t.statut]?.length > 0 && (
                                <select className="champ" value="" onChange={(e) => e.target.value && void deplacer(t.numero, e.target.value)} aria-label={`Déplacer ${t.numero}`}>
                                  <option value="">Déplacer vers…</option>
                                  {TRANSITIONS[type][t.statut].map((c) => (
                                    <option key={c} value={c}>
                                      {libelleStatut(type, c)}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </Carte>
                        ))}
                      </>
                    )}
                  </Pages>
                  {!tickets.length && <div className="discret">Rien ici.</div>}
                </section>
              );
            })}
        </div>
      )}
    </div>
  );
}
