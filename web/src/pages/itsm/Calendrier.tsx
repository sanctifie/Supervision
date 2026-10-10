import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDonnees } from '../../lib/useDonnees';
import { Carte, Erreur, Squelette } from '../../components/ui';
import { libelleStatut, type TicketResume } from '../../../../shared/itsm';

const JOUR = 86_400_000;

function lundi(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const decalage = (d.getDay() + 6) % 7;
  return d.getTime() - decalage * JOUR;
}

const heure = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Calendrier des changements : deux semaines, une colonne par jour. */
export default function Calendrier() {
  const [debut, setDebut] = useState(() => lundi(Date.now()));
  const fin = debut + 14 * JOUR;
  const etat = useDonnees<TicketResume[]>(`/itsm/calendrier?de=${debut}&a=${fin}`, 60_000);
  const jours = Array.from({ length: 14 }, (_, i) => debut + i * JOUR);
  const aujourdHui = new Date().setHours(0, 0, 0, 0);

  return (
    <Carte
      titre="Calendrier des changements"
      sousTitre="Fenêtres planifiées ; les chevauchements sur un même élément sont signalés dans chaque changement"
      droite={
        <div className="ligne-flex">
          <button className="bouton petit" onClick={() => setDebut(debut - 7 * JOUR)} aria-label="Semaine précédente">
            <ChevronLeft size={14} />
          </button>
          <button className="bouton petit" onClick={() => setDebut(lundi(Date.now()))}>
            Aujourd’hui
          </button>
          <button className="bouton petit" onClick={() => setDebut(debut + 7 * JOUR)} aria-label="Semaine suivante">
            <ChevronRight size={14} />
          </button>
        </div>
      }
    >
      {etat.erreur ? (
        <Erreur message={etat.erreur} />
      ) : !etat.donnees ? (
        <Squelette hauteur={320} />
      ) : (
        <div className="calendrier">
          {jours.map((j) => {
            const duJour = etat.donnees!.filter((c) => (c.debutPrevu as number) < j + JOUR && (c.finPrevue as number) > j);
            return (
              <div key={j} className={`calendrier-jour ${j === aujourdHui ? 'aujourdhui' : ''} ${[5, 6].includes((new Date(j).getDay() + 6) % 7) ? 'weekend' : ''}`}>
                <div className="calendrier-date">{new Date(j).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                {duJour.map((c) => (
                  <Link
                    key={c.numero}
                    to={`/tickets/${c.numero}`}
                    className={`calendrier-chg risque-${c.risque ?? 'moyen'} ${c.statut === 'clos' ? 'termine' : ''}`}
                    title={`${c.numero} — ${c.titre} (${libelleStatut('changement', c.statut)})`}
                  >
                    <span className="mono">{heure(c.debutPrevu as number)}</span> {c.titre}
                    <small>
                      {c.numero} · {libelleStatut('changement', c.statut)}
                      {c.ci ? ` · ${c.ci}` : ''}
                    </small>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <div className="legende" style={{ marginTop: 12 }}>
        <span>
          <i style={{ background: '#16a34a' }} />
          Risque faible
        </span>
        <span>
          <i style={{ background: '#e5860a' }} />
          Moyen
        </span>
        <span>
          <i style={{ background: '#dc2626' }} />
          Élevé
        </span>
      </div>
    </Carte>
  );
}
