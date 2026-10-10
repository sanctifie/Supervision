import { Link } from 'react-router-dom';
import { AlertOctagon, ArrowRight, CalendarClock, ClipboardList, GitPullRequest, Plus, ShieldCheck, Siren, Timer, Wrench } from 'lucide-react';
import { useDonnees } from '../../lib/useDonnees';
import { Carte, Charge, Vide } from '../../components/ui';
import { BadgeSla, LienTicket, PastillePriorite, PastilleStatut } from '../../components/itsm';
import { dateHeure, duree, pourcent } from '../../../../shared/format';
import type { TicketResume } from '../../../../shared/itsm';

interface Tableau {
  compteurs: {
    incidents: number;
    majeurs: number;
    problemes: number;
    erreursConnues: number;
    changements: number;
    aApprouver: number;
    demandes: number;
    slaDepasses: number;
    slaARisque: number;
    nonAssignes: number;
    incidentsCeMois: number;
    postMortemsEnRetard: number;
  };
  indicateurs: { mttaMinutes: number | null; mttrMinutes: number | null; respectSla: number | null };
  mesTickets: TicketResume[];
  nonAssignes: TicketResume[];
  majeurs: TicketResume[];
  prochainsChangements: TicketResume[];
  aApprouver: TicketResume[];
}

function Liste({ tickets, vide, sla = true }: { tickets: TicketResume[]; vide: string; sla?: boolean }) {
  if (!tickets.length) return <Vide>{vide}</Vide>;
  return (
    <div className="tableau-conteneur">
      <table className="tableau">
        <tbody>
          {tickets.slice(0, 8).map((t) => (
            <tr key={t.id}>
              <td style={{ width: 120 }}>
                <LienTicket t={t} />
              </td>
              <td>
                <Link to={`/tickets/${t.numero}`} style={{ color: 'var(--encre)', fontWeight: 600 }}>
                  {t.titre}
                </Link>
              </td>
              {sla && (
                <td>
                  <PastillePriorite p={t.priorite} />
                </td>
              )}
              <td>
                <PastilleStatut type={t.type} statut={t.statut} />
              </td>
              <td>{sla ? <BadgeSla etat={t.sla} echeance={t.echeance} /> : <span className="discret">{t.debutPrevu ? dateHeure(t.debutPrevu) : '—'}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** L'accueil du service desk : ce qui m'attend, ce qui brûle, ce qui arrive. */
export default function AccueilItsm() {
  const etat = useDonnees<Tableau>('/itsm/tableau', 15_000);
  return (
    <Charge etat={etat}>
      {(d) => {
        const c = d.compteurs;
        const tuiles = [
          { libelle: 'Incidents ouverts', valeur: c.incidents, sous: c.majeurs ? `dont ${c.majeurs} majeur(s) P1/P2` : 'aucun majeur', statut: c.majeurs ? 'rouge' : 'vert', icone: Siren, lien: '/incidents' },
          { libelle: 'SLA dépassés', valeur: c.slaDepasses, sous: `${c.slaARisque} à risque`, statut: c.slaDepasses ? 'rouge' : c.slaARisque ? 'orange' : 'vert', icone: Timer, lien: '/incidents' },
          { libelle: 'Problèmes ouverts', valeur: c.problemes, sous: `${c.erreursConnues} erreur(s) connue(s)`, statut: 'inconnu', icone: Wrench, lien: '/problemes' },
          { libelle: 'Changements en cours', valeur: c.changements, sous: c.aApprouver ? `${c.aApprouver} à approuver` : 'rien à approuver', statut: c.aApprouver ? 'orange' : 'vert', icone: GitPullRequest, lien: '/changements' },
          { libelle: 'Demandes ouvertes', valeur: c.demandes, sous: `${c.nonAssignes} ticket(s) sans personne`, statut: c.nonAssignes ? 'orange' : 'vert', icone: ClipboardList, lien: '/demandes' },
        ];
        return (
          <div className="empile">
            <div className="ligne-flex">
              {(
                [
                  ['incident', 'Incident'],
                  ['demande', 'Demande'],
                  ['changement', 'Changement'],
                  ['probleme', 'Problème'],
                ] as const
              ).map(([type, libelle], i) => (
                <Link key={type} className={`bouton ${i === 0 ? 'primaire' : ''}`} to={`/tickets/nouveau?type=${type}`}>
                  <Plus size={14} /> {libelle}
                </Link>
              ))}
            </div>

            {d.majeurs.length > 0 && (
              <div className="banniere rouge">
                <div className="banniere-icone">
                  <AlertOctagon size={28} />
                </div>
                <div style={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
                  <h2>
                    {d.majeurs.length} incident{d.majeurs.length > 1 ? 's' : ''} majeur{d.majeurs.length > 1 ? 's' : ''} en cours
                  </h2>
                  <p>
                    {d.majeurs.slice(0, 3).map((t, i) => (
                      <span key={t.numero}>
                        {i > 0 && ' · '}
                        <Link to={`/tickets/${t.numero}`} style={{ color: '#fff', textDecoration: 'underline' }}>
                          {t.numero}
                        </Link>{' '}
                        {t.titre} ({t.assigneA ? `pris par ${t.assigneA}` : 'personne dessus'})
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            )}

            <div className="grille" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              {tuiles.map((x) => (
                <Link to={x.lien} className="carte kpi domaine" key={x.libelle} style={{ display: 'block' }}>
                  <div className="kpi-haut">
                    <span className={`tuile ${x.statut === 'rouge' || x.statut === 'orange' ? x.statut : ''}`}>
                      <x.icone size={18} />
                    </span>
                    <span className="kpi-libelle">{x.libelle}</span>
                  </div>
                  <div className="kpi-valeur">{x.valeur}</div>
                  <div className={`kpi-sous ${x.statut}`}>{x.sous}</div>
                </Link>
              ))}
            </div>

            <div className="grille g-principal" style={{ alignItems: 'start' }}>
              <div className="empile">
                <Carte serree titre={`Mes tickets (${d.mesTickets.length})`} sousTitre="Assignés à moi, les plus urgents d’abord">
                  <Liste tickets={d.mesTickets} vide="Rien ne vous est assigné." />
                </Carte>
                <Carte serree titre={`Non assignés (${d.nonAssignes.length})`} sousTitre="À prendre en charge" droite={<Link className="lien-fleche" to="/incidents">Tout voir <ArrowRight size={13} /></Link>}>
                  <Liste tickets={d.nonAssignes} vide="Tout est pris en charge." />
                </Carte>
              </div>
              <div className="empile">
                <Carte titre="Performance du support" sousTitre="Incidents des 30 derniers jours">
                  <div className="grille g3" style={{ gap: 10 }}>
                    <div>
                      <div className="kpi-libelle">MTTA</div>
                      <div className="kpi-valeur" style={{ fontSize: '1.3rem' }}>
                        {d.indicateurs.mttaMinutes === null ? '—' : duree(d.indicateurs.mttaMinutes * 60)}
                      </div>
                    </div>
                    <div>
                      <div className="kpi-libelle">MTTR</div>
                      <div className="kpi-valeur" style={{ fontSize: '1.3rem' }}>
                        {d.indicateurs.mttrMinutes === null ? '—' : duree(d.indicateurs.mttrMinutes * 60)}
                      </div>
                    </div>
                    <div>
                      <div className="kpi-libelle">SLA tenus</div>
                      <div className="kpi-valeur" style={{ fontSize: '1.3rem' }}>
                        {d.indicateurs.respectSla === null ? '—' : pourcent(d.indicateurs.respectSla * 100, 0)}
                      </div>
                    </div>
                  </div>
                  <p className="discret" style={{ marginBottom: 0 }}>
                    {c.incidentsCeMois} incident(s) ce mois-ci{c.postMortemsEnRetard ? ` · ${c.postMortemsEnRetard} post-mortem(s) en retard` : ''}.
                  </p>
                </Carte>
                <Carte serree titre="À approuver (CAB)" droite={<ShieldCheck size={16} color="#2f5bea" />}>
                  <Liste tickets={d.aApprouver} vide="Aucun changement en attente d’approbation." sla={false} />
                </Carte>
                <Carte serree titre="Prochains changements (14 j)" droite={<Link className="lien-fleche" to="/changements"><CalendarClock size={14} /> Calendrier</Link>}>
                  {d.prochainsChangements.length ? (
                    <ul className="activite" style={{ padding: '6px 20px 14px' }}>
                      {d.prochainsChangements.slice(0, 6).map((t) => (
                        <li key={t.numero}>
                          <span className="tuile">
                            <GitPullRequest size={14} />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <strong>
                              <Link to={`/tickets/${t.numero}`}>{t.numero}</Link> {t.titre}
                            </strong>
                            <span>
                              {t.ci ?? 'sans CI'} · <PastilleStatut type="changement" statut={t.statut} />
                            </span>
                          </div>
                          <time>{t.debutPrevu ? dateHeure(t.debutPrevu) : '—'}</time>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Vide>Aucun changement planifié.</Vide>
                  )}
                </Carte>
              </div>
            </div>
          </div>
        );
      }}
    </Charge>
  );
}
