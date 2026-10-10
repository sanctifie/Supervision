import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, List, Plus, Search } from 'lucide-react';
import { useDonnees } from '../../lib/useDonnees';
import { Carte, Erreur, Squelette, Vide } from '../../components/ui';
import { BadgeSla, IconeType, LienTicket, PastillePriorite, PastilleStatut } from '../../components/itsm';
import { depuis, dateHeure } from '../../../../shared/format';
import { LIBELLE_TYPE, type TicketResume, type TypeTicket } from '../../../../shared/itsm';
import Calendrier from './Calendrier';

const VUES: { cle: string; libelle: string; parametres: Record<string, string> }[] = [
  { cle: 'ouverts', libelle: 'Ouverts', parametres: { etat: 'ouverts' } },
  { cle: 'moi', libelle: 'Assignés à moi', parametres: { etat: 'ouverts', assigne: 'moi' } },
  { cle: 'non-assignes', libelle: 'Non assignés', parametres: { etat: 'ouverts', nonAssignes: '1' } },
  { cle: 'clos', libelle: 'Terminés', parametres: { etat: 'clos' } },
  { cle: 'tous', libelle: 'Tous', parametres: { etat: 'tous' } },
];

const LIBELLE_TYPE_CHG = { standard: 'Standard', normal: 'Normal', urgent: 'Urgent' };
const LIBELLE_RISQUE = { faible: 'Faible', moyen: 'Moyen', eleve: 'Élevé' };

export default function ListeTickets({ type }: { type: TypeTicket }) {
  const [vue, setVue] = useState('ouverts');
  const [priorite, setPriorite] = useState('');
  const [recherche, setRecherche] = useState('');
  const [q, setQ] = useState('');
  const [affichage, setAffichage] = useState<'liste' | 'calendrier'>('liste');
  const naviguer = useNavigate();

  const parametres = new URLSearchParams({ type, ...(VUES.find((v) => v.cle === vue)?.parametres ?? {}) });
  if (priorite) parametres.set('priorite', priorite);
  if (q) parametres.set('q', q);
  const etat = useDonnees<TicketResume[]>(`/tickets?${parametres}`, 20_000);
  const changement = type === 'changement';

  return (
    <div className="empile">
      <div className="ligne-flex">
        {changement && (
          <div className="onglets">
            <button className={affichage === 'liste' ? 'actif' : ''} onClick={() => setAffichage('liste')}>
              <List size={13} style={{ verticalAlign: -2 }} /> Liste
            </button>
            <button className={affichage === 'calendrier' ? 'actif' : ''} onClick={() => setAffichage('calendrier')}>
              <CalendarDays size={13} style={{ verticalAlign: -2 }} /> Calendrier
            </button>
          </div>
        )}
        <span className="espace" />
        <Link className="bouton primaire" to={`/tickets/nouveau?type=${type}`}>
          <Plus size={15} /> {LIBELLE_TYPE[type].nouveau}
        </Link>
      </div>

      {affichage === 'calendrier' && changement ? (
        <Calendrier />
      ) : (
        <Carte serree>
          <div className="filtres" style={{ padding: '16px 20px' }}>
            <div className="onglets">
              {VUES.map((v) => (
                <button key={v.cle} className={vue === v.cle ? 'actif' : ''} onClick={() => setVue(v.cle)}>
                  {v.libelle}
                </button>
              ))}
            </div>
            <select className="champ" value={priorite} onChange={(e) => setPriorite(e.target.value)} aria-label="Priorité">
              <option value="">Toutes priorités</option>
              {['P1', 'P2', 'P3', 'P4'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <form
              className="recherche"
              style={{ display: 'block', flex: 1, minWidth: 200 }}
              onSubmit={(e) => {
                e.preventDefault();
                setQ(recherche);
              }}
            >
              <Search size={16} />
              <input style={{ width: '100%' }} placeholder="Numéro, titre, CI, personne… (Entrée)" value={recherche} onChange={(e) => setRecherche(e.target.value)} onBlur={() => setQ(recherche)} />
            </form>
          </div>
          {etat.erreur ? (
            <div style={{ padding: 20 }}>
              <Erreur message={etat.erreur} />
            </div>
          ) : !etat.donnees ? (
            <div style={{ padding: 20 }}>
              <Squelette hauteur={240} />
            </div>
          ) : etat.donnees.length ? (
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Numéro</th>
                    <th>Titre</th>
                    <th>Priorité</th>
                    <th>État</th>
                    {changement ? (
                      <>
                        <th>Type</th>
                        <th>Risque</th>
                        <th>Fenêtre</th>
                      </>
                    ) : (
                      <th>SLA</th>
                    )}
                    <th>CI</th>
                    <th>Assigné à</th>
                    <th>Mis à jour</th>
                  </tr>
                </thead>
                <tbody>
                  {etat.donnees.map((t) => (
                    <tr key={t.id} className="ligne-cliquable" onClick={(e) => (e.target as HTMLElement).closest('a') || naviguer(`/tickets/${t.numero}`)}>
                      <td>
                        <LienTicket t={t} />
                      </td>
                      <td style={{ maxWidth: 380 }}>
                        <strong style={{ color: 'var(--encre)', fontWeight: 600 }}>{t.titre}</strong>
                        {t.automatique && <span className="discret"> · alerte</span>}
                      </td>
                      <td>
                        <PastillePriorite p={t.priorite} />
                      </td>
                      <td>
                        <PastilleStatut type={t.type} statut={t.statut} />
                      </td>
                      {changement ? (
                        <>
                          <td>{t.typeChangement ? LIBELLE_TYPE_CHG[t.typeChangement] : '—'}</td>
                          <td>{t.risque ? LIBELLE_RISQUE[t.risque] : '—'}</td>
                          <td className="discret" style={{ whiteSpace: 'nowrap' }}>
                            {t.debutPrevu ? `${dateHeure(t.debutPrevu)} → ${t.finPrevue ? new Date(t.finPrevue).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}` : 'à planifier'}
                          </td>
                        </>
                      ) : (
                        <td>
                          <BadgeSla etat={t.sla} echeance={t.echeance} />
                        </td>
                      )}
                      <td className="mono">{t.ci ?? '—'}</td>
                      <td>{t.assigneA ?? <span className="discret">{t.groupe ?? 'personne'}</span>}</td>
                      <td className="discret" style={{ whiteSpace: 'nowrap' }}>
                        {depuis(t.majLe)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Vide icone={<IconeType type={type} taille={28} />}>Aucun ticket dans cette vue.</Vide>
          )}
        </Carte>
      )}
    </div>
  );
}
