import { useEffect, useState } from 'react';
import { Plus, Users, X } from 'lucide-react';
import { useDonnees } from '../../lib/useDonnees';
import { appeler } from '../../lib/api';
import { Carte, Charge } from '../../components/ui';

interface EquipeDonnees {
  membres: string[];
  groupes: string[];
}

function ListeEditable({ titre, sousTitre, valeurs, changer }: { titre: string; sousTitre: string; valeurs: string[]; changer: (v: string[]) => void }) {
  const [nouveau, setNouveau] = useState('');
  return (
    <Carte titre={titre} sousTitre={sousTitre}>
      <div className="chips" style={{ marginBottom: 12 }}>
        {valeurs.map((v) => (
          <span key={v} className="pastille bleu" style={{ fontSize: '0.82rem', padding: '5px 8px 5px 12px' }}>
            {v}
            <button className="puce-retirer" onClick={() => changer(valeurs.filter((x) => x !== v))} aria-label={`Retirer ${v}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        {!valeurs.length && <span className="discret">Aucun pour l’instant.</span>}
      </div>
      <form
        className="ligne-flex"
        onSubmit={(e) => {
          e.preventDefault();
          const v = nouveau.trim();
          if (v && !valeurs.includes(v)) changer([...valeurs, v]);
          setNouveau('');
        }}
      >
        <input className="champ" style={{ flex: 1 }} value={nouveau} onChange={(e) => setNouveau(e.target.value)} placeholder="Ajouter…" />
        <button className="bouton" type="submit">
          <Plus size={14} /> Ajouter
        </button>
      </form>
    </Carte>
  );
}

/** Les personnes assignables et les groupes d'affectation. */
export default function Equipe() {
  const etat = useDonnees<EquipeDonnees>('/equipe', 0);
  const [local, setLocal] = useState<EquipeDonnees | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (etat.donnees) setLocal(etat.donnees);
  }, [etat.donnees]);

  const enregistrer = async (e: EquipeDonnees) => {
    setLocal(e);
    try {
      etat.remplacer(await appeler<EquipeDonnees>('/equipe', { methode: 'PUT', corps: e }));
      setMessage('Enregistré.');
    } catch (x) {
      setMessage((x as Error).message);
    }
  };

  return (
    <Charge etat={{ donnees: local, erreur: etat.erreur }}>
      {(e) => (
        <div className="empile">
          <div className="encadre ligne-flex">
            <Users size={16} />
            <span>Toute personne qui se connecte et agit sur un ticket est ajoutée aux membres automatiquement. Les groupes servent à répartir les files d’attente.</span>
            {message && <strong style={{ marginLeft: 'auto' }}>{message}</strong>}
          </div>
          <div className="grille g2" style={{ alignItems: 'start' }}>
            <ListeEditable titre={`Membres (${e.membres.length})`} sousTitre="Les personnes à qui on peut assigner un ticket" valeurs={e.membres} changer={(membres) => enregistrer({ ...e, membres })} />
            <ListeEditable titre={`Groupes d’affectation (${e.groupes.length})`} sousTitre="Ex. : Exploitation, Développement, Support officine" valeurs={e.groupes} changer={(groupes) => enregistrer({ ...e, groupes })} />
          </div>
        </div>
      )}
    </Charge>
  );
}
