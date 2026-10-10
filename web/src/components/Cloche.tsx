import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { depuis } from '../../../shared/format';

interface Notification {
  id: string;
  t: number;
  titre: string;
  texte: string;
  lien: string;
  lu: boolean;
}
interface Reponse {
  notifications: Notification[];
  nonLues: number;
}

/** La cloche : mes notifications, relues toutes les 20 secondes. */
export function Cloche() {
  const { donnees, remplacer } = useDonnees<Reponse>('/notifications', 20_000);
  const [ouverte, setOuverte] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  const naviguer = useNavigate();

  useEffect(() => {
    if (!ouverte) return;
    const fermer = (e: MouseEvent) => !zone.current?.contains(e.target as Node) && setOuverte(false);
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && setOuverte(false);
    document.addEventListener('mousedown', fermer);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('mousedown', fermer);
      document.removeEventListener('keydown', echap);
    };
  }, [ouverte]);

  const lire = async (id?: string) => remplacer(await appeler<Reponse>('/notifications/lues', { methode: 'POST', corps: id ? { id } : {} }));
  const nonLues = donnees?.nonLues ?? 0;

  return (
    <div className="cloche" ref={zone}>
      <button className="icone-bouton" onClick={() => setOuverte(!ouverte)} aria-label={`${nonLues} notification(s) non lue(s)`} aria-expanded={ouverte} title="Notifications">
        <Bell size={18} />
        {nonLues > 0 && <span className="badge-compteur bleu">{nonLues > 99 ? '99+' : nonLues}</span>}
      </button>
      {ouverte && (
        <div className="cloche-panneau">
          <div className="ligne-flex cloche-tete">
            <strong>Notifications</strong>
            <span className="espace" />
            {nonLues > 0 && (
              <button className="lien-bouton" onClick={() => lire()}>
                <CheckCheck size={14} /> Tout marquer comme lu
              </button>
            )}
          </div>
          <div className="cloche-liste">
            {donnees?.notifications.length ? (
              donnees.notifications.map((n) => (
                <button
                  key={n.id}
                  className={`cloche-element ${n.lu ? '' : 'non-lue'}`}
                  onClick={() => {
                    void lire(n.id);
                    setOuverte(false);
                    naviguer(n.lien);
                  }}
                >
                  <strong>{n.titre}</strong>
                  <span>{n.texte}</span>
                  <time>{depuis(n.t)}</time>
                </button>
              ))
            ) : (
              <div className="vide">Aucune notification pour l’instant.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
