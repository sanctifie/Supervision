import { useState, type ReactNode } from 'react';
import { ArrowRight, Check, KeyRound, LifeBuoy, ShieldCheck } from 'lucide-react';
import { appeler } from '../lib/api';
import { LONGUEUR_MIN_MOT_DE_PASSE, type Compte, type Permission } from '../../../shared/comptes';

export type CompteSession = Compte & { permissions: Permission[] };

/** La mise en page commune : l'accroche à gauche, le formulaire à droite. */
function Accueil({ produit, children }: { produit: string; children: ReactNode }) {
  return (
    <div className="accueil">
      <div>
        <span className="nouveau">
          <b>Nouveau</b> Service desk {produit}
        </span>
        <h1>
          Supervision et
          <br />
          service desk de votre <em>officine</em>
          <br />
          en un seul écran
        </h1>
        <p className="accroche">
          Serveur, API, ventes, sauvegardes et alertes surveillés en continu ; incidents, problèmes, changements et demandes suivis jusqu’au bout, avec leurs délais.
        </p>
        <div className="atouts">
          <span>
            <Check size={16} /> État vert / orange / rouge
          </span>
          <span>
            <Check size={16} /> Tickets et SLA
          </span>
          <span>
            <Check size={16} /> Changements approuvés (CAB)
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

function EnTeteFormulaire({ titre, sousTitre }: { titre: string; sousTitre: string }) {
  return (
    <div className="ligne-flex" style={{ marginBottom: 6 }}>
      <img src="/logo.svg" alt="" width={34} height={34} />
      <div>
        <h2>{titre}</h2>
        <span className="discret">{sousTitre}</span>
      </div>
    </div>
  );
}

function Champ({
  id,
  label,
  type = 'text',
  valeur,
  changer,
  aide,
  auto,
  focus,
}: {
  id: string;
  label: string;
  type?: string;
  valeur: string;
  changer: (v: string) => void;
  aide?: string;
  auto?: string;
  focus?: boolean;
}) {
  return (
    <div className="champ-groupe">
      <label className="etiquette" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="champ" type={type} value={valeur} onChange={(e) => changer(e.target.value)} autoComplete={auto} autoFocus={focus} required />
      {aide && (
        <span className="discret" style={{ fontSize: '0.74rem' }}>
          {aide}
        </span>
      )}
    </div>
  );
}

function BoutonEnvoi({ enCours, children }: { enCours: boolean; children: ReactNode }) {
  return (
    <button className="bouton primaire" type="submit" disabled={enCours} style={{ width: '100%', marginTop: 20, padding: '12px 16px' }}>
      {children}
      <span className="rond">
        <ArrowRight size={14} />
      </span>
    </button>
  );
}

function useEnvoi() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const envoyer = async (f: () => Promise<void>) => {
    setErreur(null);
    setEnCours(true);
    try {
      await f();
    } catch (x) {
      setErreur((x as Error).message);
    } finally {
      setEnCours(false);
    }
  };
  return { erreur, enCours, envoyer };
}

/** Connexion, avec le secours administrateur (code d'installation). */
export default function Connexion({ produit, connecte }: { produit: string; connecte: (c: CompteSession) => void }) {
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [secours, setSecours] = useState(false);
  const [code, setCode] = useState('');
  const [provisoire, setProvisoire] = useState<string | null>(null);
  const { erreur, enCours, envoyer } = useEnvoi();

  if (secours) {
    return (
      <Accueil produit={produit}>
        <form
          className="formulaire-connexion"
          onSubmit={(e) => {
            e.preventDefault();
            void envoyer(async () => {
              const r = await appeler<{ motDePasseProvisoire: string }>('/secours', { methode: 'POST', corps: { identifiant, code } });
              setProvisoire(r.motDePasseProvisoire);
            });
          }}
        >
          <EnTeteFormulaire titre="Secours administrateur" sousTitre="Mot de passe perdu" />
          {provisoire ? (
            <>
              <div className="encadre" style={{ marginTop: 16 }}>
                Mot de passe provisoire pour <strong>{identifiant}</strong> :
                <div className="mono" style={{ fontSize: '1.1rem', margin: '8px 0', userSelect: 'all' }}>
                  {provisoire}
                </div>
                Il faudra le changer à la connexion.
              </div>
              <button
                type="button"
                className="bouton primaire"
                style={{ width: '100%', marginTop: 16 }}
                onClick={() => {
                  setMotDePasse(provisoire);
                  setSecours(false);
                  setProvisoire(null);
                }}
              >
                Se connecter
              </button>
            </>
          ) : (
            <>
              <p className="discret">Le code d’installation (SUPERVISION_CODE_INSTALLATION, sur le serveur) donne un mot de passe provisoire à un administrateur.</p>
              <Champ id="id" label="Identifiant de l’administrateur" valeur={identifiant} changer={setIdentifiant} focus />
              <Champ id="code" label="Code d’installation" type="password" valeur={code} changer={setCode} />
              {erreur && (
                <div className="erreur" style={{ marginTop: 14 }}>
                  {erreur}
                </div>
              )}
              <BoutonEnvoi enCours={enCours}>Obtenir un mot de passe provisoire</BoutonEnvoi>
              <button type="button" className="bouton" style={{ width: '100%', marginTop: 10 }} onClick={() => setSecours(false)}>
                Retour
              </button>
            </>
          )}
        </form>
      </Accueil>
    );
  }

  return (
    <Accueil produit={produit}>
      <form
        className="formulaire-connexion"
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer(async () => connecte(await appeler<CompteSession>('/connexion', { methode: 'POST', corps: { identifiant, motDePasse } })));
        }}
      >
        <EnTeteFormulaire titre="Connexion" sousTitre={`Supervision · ${produit}`} />
        <Champ id="identifiant" label="Identifiant" valeur={identifiant} changer={setIdentifiant} auto="username" focus />
        <Champ id="mdp" label="Mot de passe" type="password" valeur={motDePasse} changer={setMotDePasse} auto="current-password" />
        {erreur && (
          <div className="erreur" style={{ marginTop: 14 }}>
            {erreur}
          </div>
        )}
        <BoutonEnvoi enCours={enCours}>Se connecter</BoutonEnvoi>
        <p className="discret" style={{ marginTop: 14, fontSize: '0.76rem' }}>
          Mot de passe oublié ? Demandez à un administrateur de le réinitialiser.{' '}
          <button type="button" className="lien-bouton" onClick={() => setSecours(true)}>
            <LifeBuoy size={12} /> Secours administrateur
          </button>
        </p>
      </form>
    </Accueil>
  );
}

/** Première installation : créer le compte administrateur. */
export function Installation({ produit, codeRequis, connecte }: { produit: string; codeRequis: boolean; connecte: (c: CompteSession) => void }) {
  const [code, setCode] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [nom, setNom] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const { erreur, enCours, envoyer } = useEnvoi();
  return (
    <Accueil produit={produit}>
      <form
        className="formulaire-connexion"
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer(async () => {
            if (motDePasse !== confirmation) throw new Error('Les deux mots de passe ne correspondent pas');
            connecte(await appeler<CompteSession>('/installation', { methode: 'POST', corps: { code, identifiant, nom, motDePasse } }));
          });
        }}
      >
        <EnTeteFormulaire titre="Première installation" sousTitre="Créez le compte administrateur" />
        {codeRequis && (
          <Champ id="code" label="Code d’installation" type="password" valeur={code} changer={setCode} aide="Valeur de SUPERVISION_CODE_INSTALLATION sur le serveur" focus />
        )}
        <Champ
          id="identifiant"
          label="Identifiant"
          valeur={identifiant}
          changer={setIdentifiant}
          aide="Pour se connecter : lettres, chiffres, . _ -"
          auto="username"
          focus={!codeRequis}
        />
        <Champ id="nom" label="Nom affiché" valeur={nom} changer={setNom} aide="Signe les tickets, les approbations, les notes" />
        <Champ
          id="mdp"
          label="Mot de passe"
          type="password"
          valeur={motDePasse}
          changer={setMotDePasse}
          aide={`Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères`}
          auto="new-password"
        />
        <Champ id="mdp2" label="Confirmer le mot de passe" type="password" valeur={confirmation} changer={setConfirmation} auto="new-password" />
        {erreur && (
          <div className="erreur" style={{ marginTop: 14 }}>
            {erreur}
          </div>
        )}
        <BoutonEnvoi enCours={enCours}>
          <ShieldCheck size={15} /> Créer l’administrateur
        </BoutonEnvoi>
      </form>
    </Accueil>
  );
}

/** Mot de passe provisoire : à changer avant d'entrer. */
export function ChangerMotDePasse({ produit, compte, fait }: { produit: string; compte: CompteSession; fait: () => void }) {
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const { erreur, enCours, envoyer } = useEnvoi();
  return (
    <Accueil produit={produit}>
      <form
        className="formulaire-connexion"
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer(async () => {
            if (nouveau !== confirmation) throw new Error('Les deux mots de passe ne correspondent pas');
            await appeler('/profil/mot-de-passe', { methode: 'POST', corps: { ancien, nouveau } });
            fait();
          });
        }}
      >
        <EnTeteFormulaire titre={`Bienvenue, ${compte.nom}`} sousTitre="Choisissez votre mot de passe" />
        <p className="discret">
          <KeyRound size={13} style={{ verticalAlign: -2 }} /> Votre mot de passe est provisoire : remplacez-le par un mot de passe que vous seul connaissez.
        </p>
        <Champ id="ancien" label="Mot de passe provisoire" type="password" valeur={ancien} changer={setAncien} auto="current-password" focus />
        <Champ
          id="nouveau"
          label="Nouveau mot de passe"
          type="password"
          valeur={nouveau}
          changer={setNouveau}
          aide={`Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères`}
          auto="new-password"
        />
        <Champ id="confirmation" label="Confirmer" type="password" valeur={confirmation} changer={setConfirmation} auto="new-password" />
        {erreur && (
          <div className="erreur" style={{ marginTop: 14 }}>
            {erreur}
          </div>
        )}
        <BoutonEnvoi enCours={enCours}>Enregistrer et entrer</BoutonEnvoi>
      </form>
    </Accueil>
  );
}
