import { useState } from 'react';
import { Check } from 'lucide-react';
import { appeler } from '../lib/api';
import { useSupervision } from './Coquille';

/**
 * Case à cocher enregistrée côté serveur : « c'est en place », signé du nom
 * de la personne connectée.
 */
export function CaseConfirmation({ cle, faite, auto, apres, titre }: { cle: string; faite: boolean; auto?: boolean; apres: () => void; titre?: string }) {
  const [enCours, setEnCours] = useState(false);
  const { peut } = useSupervision();
  if (auto) {
    return (
      <span className="case-coche auto" title="Vérifié automatiquement par la supervision">
        <Check size={14} strokeWidth={3} />
      </span>
    );
  }
  return (
    <button
      className={`case-coche ${faite ? 'faite' : ''}`}
      disabled={enCours || !peut('agir')}
      aria-pressed={faite}
      aria-label={titre ?? (faite ? 'Décocher' : 'Confirmer')}
      title={faite ? 'Confirmé — cliquer pour annuler' : 'Confirmer que c’est en place'}
      onClick={async () => {
        setEnCours(true);
        try {
          await appeler(`/confirmations/${encodeURIComponent(cle)}`, { methode: 'PUT', corps: { fait: !faite } });
          apres();
        } finally {
          setEnCours(false);
        }
      }}
    >
      {faite && <Check size={14} strokeWidth={3} />}
    </button>
  );
}
