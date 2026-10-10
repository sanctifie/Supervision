import { useState } from 'react';
import { ArrowRight, Check, Lock } from 'lucide-react';
import { appeler, memoriserNom, nomLocal } from '../lib/api';

/**
 * Page d'entrée : l'accroche à gauche, la connexion à droite.
 * Sans mot de passe configuré, on demande seulement le nom (qui signe les
 * acquittements et les notes d'incident).
 */
export default function Connexion({ produit, accesActif, connecte }: { produit: string; accesActif: boolean; connecte: (nom: string) => void }) {
  const [nom, setNom] = useState(nomLocal());
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const nomPropre = nom.trim() || 'Équipe';
      memoriserNom(nomPropre);
      if (accesActif) {
        const r = await appeler<{ nom: string }>('/connexion', { methode: 'POST', corps: { nom: nomPropre, motDePasse } });
        connecte(r.nom);
      } else {
        connecte(nomPropre);
      }
    } catch (x) {
      setErreur((x as Error).message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="accueil">
      <div>
        <span className="nouveau">
          <b>Nouveau</b> Supervision {produit} est en ligne
        </span>
        <h1>
          Toute la supervision
          <br />
          de votre <em>officine</em>
          <br />
          en un seul écran
        </h1>
        <p className="accroche">
          Serveur, conteneurs, API, base de données, ventes, sauvegardes, alertes et incidents : {produit} est surveillée en continu, et l’état global se lit en trois secondes — vert, orange
          ou rouge.
        </p>
        <div className="atouts">
          <span>
            <Check size={16} /> Seuils du guide intégrés
          </span>
          <span>
            <Check size={16} /> Incidents et runbooks
          </span>
          <span>
            <Check size={16} /> Page de statut publique
          </span>
        </div>
      </div>

      <form className="formulaire-connexion" onSubmit={envoyer}>
        <div className="ligne-flex" style={{ marginBottom: 6 }}>
          <img src="/logo.svg" alt="" width={34} height={34} />
          <div>
            <h2>Connexion</h2>
            <span className="discret">Supervision · {produit}</span>
          </div>
        </div>
        <div className="champ-groupe">
          <label className="etiquette" htmlFor="nom">
            Votre nom
          </label>
          <input id="nom" className="champ" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. : Alex" autoComplete="name" autoFocus />
          <span className="discret" style={{ fontSize: '0.74rem' }}>
            Il signe vos acquittements et vos notes d’incident.
          </span>
        </div>
        {accesActif && (
          <div className="champ-groupe">
            <label className="etiquette" htmlFor="mdp">
              Mot de passe
            </label>
            <input id="mdp" className="champ" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoComplete="current-password" required />
          </div>
        )}
        {erreur && (
          <div className="erreur" style={{ marginTop: 14 }}>
            {erreur}
          </div>
        )}
        <button className="bouton primaire" type="submit" disabled={enCours} style={{ width: '100%', marginTop: 20, padding: '12px 16px' }}>
          Entrer dans la supervision
          <span className="rond">
            <ArrowRight size={14} />
          </span>
        </button>
        {!accesActif && (
          <p className="discret" style={{ marginTop: 14, fontSize: '0.74rem', display: 'flex', gap: 6 }}>
            <Lock size={13} style={{ flexShrink: 0, marginTop: 2 }} /> Aucun mot de passe n’est configuré. En production, définissez SUPERVISION_MOT_DE_PASSE.
          </p>
        )}
      </form>
    </div>
  );
}
