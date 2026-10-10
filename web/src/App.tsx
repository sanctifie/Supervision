import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Coquille } from './components/Coquille';
import { Squelette } from './components/ui';
import { appeler, nomLocal, quandDeconnecte } from './lib/api';
import Connexion from './pages/Connexion';
import StatutPublic from './pages/StatutPublic';
import TableauDeBord from './pages/TableauDeBord';
import Serveur from './pages/Serveur';
import Conteneurs from './pages/Conteneurs';
import Services from './pages/Services';
import Bdd from './pages/Bdd';
import Sauvegardes from './pages/Sauvegardes';
import Application from './pages/Application';
import Metier from './pages/Metier';
import Journaux from './pages/Journaux';
import Alertes from './pages/Alertes';
import Incidents from './pages/Incidents';
import Securite from './pages/Securite';
import Automatisations from './pages/Automatisations';
import FeuilleDeRoute from './pages/FeuilleDeRoute';

const COMPOSANTS: Record<string, ComponentType> = {
  '/': TableauDeBord,
  '/serveur': Serveur,
  '/conteneurs': Conteneurs,
  '/services': Services,
  '/bdd': Bdd,
  '/sauvegardes': Sauvegardes,
  '/application': Application,
  '/metier': Metier,
  '/journaux': Journaux,
  '/alertes': Alertes,
  '/incidents': Incidents,
  '/securite': Securite,
  '/automatisations': Automatisations,
  '/feuille-de-route': FeuilleDeRoute,
};

interface Session {
  connecte: boolean;
  nom: string | null;
  accesActif: boolean;
  produit: string;
}

function Espace() {
  const [session, setSession] = useState<Session | null>(null);
  const [nom, setNom] = useState<string | null>(null);

  const lireSession = useCallback(async () => {
    try {
      const s = await appeler<Session>('/session');
      setSession(s);
      // Sans mot de passe : on entre dès qu'un nom est connu sur ce poste.
      setNom(s.accesActif ? (s.connecte ? s.nom : null) : nomLocal() || null);
    } catch {
      setSession({ connecte: false, nom: null, accesActif: true, produit: 'Officina' });
    }
  }, []);

  useEffect(() => {
    void lireSession();
    quandDeconnecte(() => setNom(null));
  }, [lireSession]);

  if (!session) return <div style={{ padding: 40 }}><Squelette hauteur={400} /></div>;
  if (!nom) return <Connexion produit={session.produit} accesActif={session.accesActif} connecte={setNom} />;

  const deconnecter = async () => {
    await appeler('/deconnexion', { methode: 'POST', corps: {} }).catch(() => undefined);
    try {
      localStorage.removeItem('supervision.nom');
    } catch {
      /* rien */
    }
    setNom(null);
  };

  return (
    <Coquille nom={nom} produit={session.produit} seDeconnecter={deconnecter}>
      <Routes>
        {Object.entries(COMPOSANTS).map(([chemin, Composant]) => (
          <Route key={chemin} path={chemin} element={<Composant />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Coquille>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/statut" element={<StatutPublic />} />
        <Route path="*" element={<Espace />} />
      </Routes>
    </BrowserRouter>
  );
}
