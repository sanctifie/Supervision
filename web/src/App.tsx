import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Coquille } from './components/Coquille';
import { Squelette } from './components/ui';
import { appeler, quandDeconnecte } from './lib/api';
import Connexion, { ChangerMotDePasse, Installation, type CompteSession } from './pages/Connexion';
import Profil from './pages/Profil';
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
import AccueilItsm from './pages/itsm/AccueilItsm';
import ListeTickets from './pages/itsm/ListeTickets';
import FicheTicket from './pages/itsm/FicheTicket';
import NouveauTicket from './pages/itsm/NouveauTicket';
import Equipe from './pages/itsm/Equipe';
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
  '/itsm': AccueilItsm,
  '/incidents': () => <ListeTickets key="incident" type="incident" />,
  '/problemes': () => <ListeTickets key="probleme" type="probleme" />,
  '/changements': () => <ListeTickets key="changement" type="changement" />,
  '/demandes': () => <ListeTickets key="demande" type="demande" />,
  '/equipe': Equipe,
  '/profil': Profil,
  '/tickets/nouveau': NouveauTicket,
  '/tickets/:numero': FicheTicket,
  '/securite': Securite,
  '/automatisations': Automatisations,
  '/feuille-de-route': FeuilleDeRoute,
};

interface Session {
  installation: boolean;
  codeRequis: boolean;
  compte: CompteSession | null;
  produit: string;
}

function Espace() {
  const [session, setSession] = useState<Session | null>(null);

  const lireSession = useCallback(async () => {
    try {
      setSession(await appeler<Session>('/session'));
    } catch {
      setSession({ installation: false, codeRequis: true, compte: null, produit: 'Officina' });
    }
  }, []);

  useEffect(() => {
    void lireSession();
    quandDeconnecte(() => setSession((s) => (s ? { ...s, compte: null } : s)));
  }, [lireSession]);

  if (!session)
    return (
      <div style={{ padding: 40 }}>
        <Squelette hauteur={400} />
      </div>
    );
  const connecte = (compte: CompteSession) => setSession({ ...session, installation: false, compte });
  if (session.installation) return <Installation produit={session.produit} codeRequis={session.codeRequis} connecte={connecte} />;
  if (!session.compte) return <Connexion produit={session.produit} connecte={connecte} />;
  if (session.compte.doitChangerMotDePasse) return <ChangerMotDePasse produit={session.produit} compte={session.compte} fait={lireSession} />;

  const deconnecter = async () => {
    await appeler('/deconnexion', { methode: 'POST', corps: {} }).catch(() => undefined);
    setSession({ ...session, compte: null });
  };

  return (
    <Coquille compte={session.compte} produit={session.produit} seDeconnecter={deconnecter} rafraichirCompte={lireSession}>
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
