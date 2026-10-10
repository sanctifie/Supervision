import { useEffect, useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { appeler } from '../lib/api';
import { useSupervision } from '../components/Coquille';
import { Carte, Pastille } from '../components/ui';
import { dateHeure } from '../../../shared/format';
import { LIBELLE_ROLE, LONGUEUR_MIN_MOT_DE_PASSE, type Compte } from '../../../shared/comptes';

/** Mon compte : coordonnées, notifications, mot de passe. */
export default function Profil() {
  const { compte, rafraichirCompte } = useSupervision();
  const [email, setEmail] = useState(compte.email);
  const [telegram, setTelegram] = useState(compte.telegram);
  const [notifEmail, setNotifEmail] = useState(compte.notifications.email);
  const [notifTelegram, setNotifTelegram] = useState(compte.notifications.telegram);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [messageMdp, setMessageMdp] = useState<{ ok: boolean; texte: string } | null>(null);

  useEffect(() => {
    setEmail(compte.email);
    setTelegram(compte.telegram);
  }, [compte.email, compte.telegram]);

  return (
    <div className="grille g2" style={{ alignItems: 'start' }}>
      <div className="empile">
        <Carte titre={compte.nom} sousTitre={`Identifiant : ${compte.identifiant}`} droite={<Pastille statut="bleu">{LIBELLE_ROLE[compte.role]}</Pastille>}>
          <div className="chips">
            {compte.approbateur && <span className="pastille violet">Approbateur (CAB)</span>}
            {compte.groupes.map((g) => (
              <span key={g} className="pastille inconnu">
                {g}
              </span>
            ))}
          </div>
          <p className="discret" style={{ marginBottom: 0 }}>
            Compte créé le {dateHeure(compte.creeLe)}. Le nom, le rôle et les groupes sont gérés par un administrateur.
          </p>
        </Carte>

        <Carte titre="Coordonnées et notifications" sousTitre="Où vous prévenir quand un ticket vous concerne">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setMessage(null);
              try {
                await appeler<Compte>('/profil', { methode: 'PATCH', corps: { email, telegram, notifications: { email: notifEmail, telegram: notifTelegram } } });
                await rafraichirCompte();
                setMessage({ ok: true, texte: 'Enregistré.' });
              } catch (x) {
                setMessage({ ok: false, texte: (x as Error).message });
              }
            }}
          >
            <div className="champ-groupe">
              <label className="etiquette" htmlFor="email">
                E-mail
              </label>
              <input id="email" className="champ" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@officine.ga" />
            </div>
            <div className="champ-groupe">
              <label className="etiquette" htmlFor="telegram">
                Identifiant Telegram (chat id)
              </label>
              <input id="telegram" className="champ mono" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="123456789" />
              <span className="discret" style={{ fontSize: '0.74rem' }}>
                Écrivez d’abord au bot de supervision sur Telegram, puis demandez votre identifiant à @userinfobot.
              </span>
            </div>
            <label className="ligne-flex" style={{ marginTop: 12, fontSize: '0.86rem', gap: 8 }}>
              <input type="checkbox" checked={notifEmail} onChange={(e) => setNotifEmail(e.target.checked)} /> Me prévenir par e-mail
            </label>
            <label className="ligne-flex" style={{ marginTop: 6, fontSize: '0.86rem', gap: 8 }}>
              <input type="checkbox" checked={notifTelegram} onChange={(e) => setNotifTelegram(e.target.checked)} /> Me prévenir sur Telegram
            </label>
            {message && (
              <div className={message.ok ? 'encadre' : 'erreur'} style={{ marginTop: 12 }}>
                {message.texte}
              </div>
            )}
            <button className="bouton primaire" type="submit" style={{ marginTop: 14 }}>
              <Save size={14} /> Enregistrer
            </button>
          </form>
        </Carte>
      </div>

      <Carte titre="Mot de passe" sousTitre="Les autres sessions ouvertes seront fermées">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setMessageMdp(null);
            if (nouveau !== confirmation) {
              setMessageMdp({ ok: false, texte: 'Les deux mots de passe ne correspondent pas' });
              return;
            }
            try {
              await appeler('/profil/mot-de-passe', { methode: 'POST', corps: { ancien, nouveau } });
              setAncien('');
              setNouveau('');
              setConfirmation('');
              setMessageMdp({ ok: true, texte: 'Mot de passe changé.' });
            } catch (x) {
              setMessageMdp({ ok: false, texte: (x as Error).message });
            }
          }}
        >
          <div className="champ-groupe">
            <label className="etiquette" htmlFor="ancien">
              Mot de passe actuel
            </label>
            <input id="ancien" className="champ" type="password" autoComplete="current-password" value={ancien} onChange={(e) => setAncien(e.target.value)} required />
          </div>
          <div className="champ-groupe">
            <label className="etiquette" htmlFor="nouveau">
              Nouveau mot de passe
            </label>
            <input
              id="nouveau"
              className="champ"
              type="password"
              autoComplete="new-password"
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              required
              minLength={LONGUEUR_MIN_MOT_DE_PASSE}
            />
          </div>
          <div className="champ-groupe">
            <label className="etiquette" htmlFor="confirmation">
              Confirmer
            </label>
            <input
              id="confirmation"
              className="champ"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
            />
          </div>
          {messageMdp && (
            <div className={messageMdp.ok ? 'encadre' : 'erreur'} style={{ marginTop: 12 }}>
              {messageMdp.texte}
            </div>
          )}
          <button className="bouton primaire" type="submit" style={{ marginTop: 14 }}>
            <KeyRound size={14} /> Changer le mot de passe
          </button>
        </form>
      </Carte>
    </div>
  );
}
