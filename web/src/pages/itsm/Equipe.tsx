import { useEffect, useState } from 'react';
import { KeyRound, Plus, UserPlus, X } from 'lucide-react';
import { useDonnees } from '../../lib/useDonnees';
import { appeler } from '../../lib/api';
import { useSupervision } from '../../components/Coquille';
import { Carte, Erreur, Modale, Pastille, Squelette } from '../../components/ui';
import { depuis } from '../../../../shared/format';
import { AIDE_ROLE, LIBELLE_ROLE, ROLES, type Compte, type Role } from '../../../../shared/comptes';

/** Le mot de passe provisoire, montré une seule fois. */
function MotDePasseMontre({ identifiant, motDePasse, fermer }: { identifiant: string; motDePasse: string; fermer: () => void }) {
  return (
    <Modale titre="Mot de passe provisoire" fermer={fermer}>
      <p>Transmettez-le à la personne (de vive voix ou par message privé). Il ne sera plus affiché ; elle devra le changer à sa première connexion.</p>
      <div className="encadre">
        Identifiant : <strong className="mono">{identifiant}</strong>
        <div className="mono" style={{ fontSize: '1.15rem', marginTop: 6, userSelect: 'all' }}>
          {motDePasse}
        </div>
      </div>
      <div className="ligne-flex" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="bouton" onClick={() => navigator.clipboard?.writeText(motDePasse)}>
          Copier
        </button>
        <button className="bouton primaire" onClick={fermer}>
          C’est noté
        </button>
      </div>
    </Modale>
  );
}

function FormulaireCompte({
  initial,
  groupes,
  enregistrer,
  fermer,
}: {
  initial?: Compte;
  groupes: string[];
  enregistrer: (d: Record<string, unknown>) => Promise<void>;
  fermer: () => void;
}) {
  const [identifiant, setIdentifiant] = useState(initial?.identifiant ?? '');
  const [nom, setNom] = useState(initial?.nom ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState<Role>(initial?.role ?? 'agent');
  const [approbateur, setApprobateur] = useState(initial?.approbateur ?? false);
  const [mesGroupes, setMesGroupes] = useState<string[]>(initial?.groupes ?? []);
  const [actif, setActif] = useState(initial?.actif ?? true);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <Modale titre={initial ? `Modifier ${initial.nom}` : 'Nouveau compte'} fermer={fermer}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErreur(null);
          try {
            await enregistrer({ identifiant, nom, email, role, approbateur, groupes: mesGroupes, ...(initial ? { actif } : {}) });
          } catch (x) {
            setErreur((x as Error).message);
          }
        }}
      >
        <div className="grille g2" style={{ gap: 12 }}>
          <div className="champ-groupe">
            <label className="etiquette">Identifiant</label>
            <input className="champ" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required autoFocus placeholder="prenom.nom" />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Nom affiché</label>
            <input className="champ" value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Prénom Nom" />
          </div>
        </div>
        <div className="champ-groupe">
          <label className="etiquette">E-mail</label>
          <input className="champ" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="champ-groupe">
          <label className="etiquette">Rôle</label>
          <select className="champ" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {LIBELLE_ROLE[r]} — {AIDE_ROLE[r]}
              </option>
            ))}
          </select>
        </div>
        <label className="ligne-flex" style={{ marginTop: 12, gap: 8, fontSize: '0.86rem' }}>
          <input type="checkbox" checked={approbateur || role === 'admin'} disabled={role === 'admin'} onChange={(e) => setApprobateur(e.target.checked)} />
          Approbateur des changements (membre du CAB)
        </label>
        <div className="champ-groupe">
          <label className="etiquette">Groupes</label>
          <div className="chips">
            {groupes.map((g) => (
              <label key={g} className={`pastille ${mesGroupes.includes(g) ? 'bleu' : 'inconnu'}`} style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ display: 'none' }}
                  checked={mesGroupes.includes(g)}
                  onChange={(e) => setMesGroupes(e.target.checked ? [...mesGroupes, g] : mesGroupes.filter((x) => x !== g))}
                />
                {g}
              </label>
            ))}
          </div>
        </div>
        {initial && (
          <label className="ligne-flex" style={{ marginTop: 12, gap: 8, fontSize: '0.86rem' }}>
            <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} /> Compte actif (décocher pour un départ : ses tickets restent, il ne peut plus se
            connecter)
          </label>
        )}
        {erreur && (
          <div className="erreur" style={{ marginTop: 12 }}>
            {erreur}
          </div>
        )}
        <div className="ligne-flex" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="bouton" onClick={fermer}>
            Annuler
          </button>
          <button className="bouton primaire" type="submit">
            {initial ? 'Enregistrer' : 'Créer le compte'}
          </button>
        </div>
      </form>
    </Modale>
  );
}

/** Équipe : les comptes et les groupes d'affectation. */
export default function Equipe() {
  const { peut, rafraichirCompte } = useSupervision();
  const admin = peut('administrer');
  const comptes = useDonnees<Compte[]>(peut('agir') ? '/comptes' : null, 0);
  const equipe = useDonnees<{ groupes: string[] }>('/equipe', 0);
  const [edition, setEdition] = useState<Compte | 'nouveau' | null>(null);
  const [provisoire, setProvisoire] = useState<{ identifiant: string; motDePasse: string } | null>(null);
  const [nouveauGroupe, setNouveauGroupe] = useState('');
  const [groupes, setGroupes] = useState<string[]>([]);
  useEffect(() => {
    if (equipe.donnees) setGroupes(equipe.donnees.groupes);
  }, [equipe.donnees]);

  const enregistrerGroupes = async (g: string[]) => {
    setGroupes(g);
    equipe.remplacer(await appeler<{ groupes: string[] }>('/equipe', { methode: 'PUT', corps: { groupes: g } }));
  };

  return (
    <div className="empile">
      {peut('agir') && (
        <Carte
          serree
          titre={`Comptes (${comptes.donnees?.filter((c) => c.actif).length ?? '…'} actifs)`}
          sousTitre="Chacun se connecte avec son identifiant : ses actions sont signées de son nom"
          droite={
            admin && (
              <button className="bouton primaire petit" onClick={() => setEdition('nouveau')}>
                <UserPlus size={14} /> Nouveau compte
              </button>
            )
          }
        >
          {comptes.erreur ? (
            <div style={{ padding: 20 }}>
              <Erreur message={comptes.erreur} />
            </div>
          ) : !comptes.donnees ? (
            <div style={{ padding: 20 }}>
              <Squelette hauteur={200} />
            </div>
          ) : (
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Identifiant</th>
                    <th>Rôle</th>
                    <th>Groupes</th>
                    <th>Dernière connexion</th>
                    {admin && <th />}
                  </tr>
                </thead>
                <tbody>
                  {comptes.donnees.map((c) => (
                    <tr key={c.id} style={{ opacity: c.actif ? 1 : 0.5 }}>
                      <td>
                        <strong style={{ color: 'var(--encre)' }}>{c.nom}</strong>
                        {!c.actif && <span className="discret"> · désactivé</span>}
                        {c.doitChangerMotDePasse && c.actif && <span className="discret"> · mot de passe provisoire</span>}
                      </td>
                      <td className="mono">{c.identifiant}</td>
                      <td>
                        <div className="chips">
                          <Pastille statut={c.role === 'admin' ? 'violet' : c.role === 'agent' ? 'bleu' : 'inconnu'}>{LIBELLE_ROLE[c.role]}</Pastille>
                          {c.approbateur && c.role !== 'admin' && <span className="pastille violet">CAB</span>}
                        </div>
                      </td>
                      <td className="discret">{c.groupes.join(', ') || '—'}</td>
                      <td className="discret">{c.derniereConnexion ? depuis(c.derniereConnexion) : 'jamais'}</td>
                      {admin && (
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          <button className="bouton petit" onClick={() => setEdition(c)}>
                            Modifier
                          </button>{' '}
                          <button
                            className="bouton petit"
                            title="Réinitialiser le mot de passe"
                            onClick={async () => {
                              if (!confirm(`Réinitialiser le mot de passe de ${c.nom} ? Ses sessions seront fermées.`)) return;
                              const r = await appeler<{ motDePasseProvisoire: string }>(`/comptes/${c.id}/reinitialiser`, { methode: 'POST', corps: {} });
                              setProvisoire({ identifiant: c.identifiant, motDePasse: r.motDePasseProvisoire });
                              void comptes.recharger();
                            }}
                          >
                            <KeyRound size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Carte>
      )}

      <Carte titre={`Groupes d’affectation (${groupes.length})`} sousTitre="Répartissent les files d’attente (Exploitation, Développement, Support officine…)">
        <div className="chips" style={{ marginBottom: admin ? 12 : 0 }}>
          {groupes.map((g) => (
            <span key={g} className="pastille bleu" style={{ fontSize: '0.82rem', padding: '5px 8px 5px 12px' }}>
              {g}
              {admin && (
                <button className="puce-retirer" onClick={() => enregistrerGroupes(groupes.filter((x) => x !== g))} aria-label={`Retirer ${g}`}>
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
        {admin && (
          <form
            className="ligne-flex"
            onSubmit={(e) => {
              e.preventDefault();
              const v = nouveauGroupe.trim();
              if (v && !groupes.includes(v)) void enregistrerGroupes([...groupes, v]);
              setNouveauGroupe('');
            }}
          >
            <input className="champ" style={{ flex: 1 }} value={nouveauGroupe} onChange={(e) => setNouveauGroupe(e.target.value)} placeholder="Nouveau groupe…" />
            <button className="bouton" type="submit">
              <Plus size={14} /> Ajouter
            </button>
          </form>
        )}
      </Carte>

      {edition && (
        <FormulaireCompte
          initial={edition === 'nouveau' ? undefined : edition}
          groupes={groupes}
          fermer={() => setEdition(null)}
          enregistrer={async (d) => {
            if (edition === 'nouveau') {
              const r = await appeler<{ compte: Compte; motDePasseProvisoire: string }>('/comptes', { methode: 'POST', corps: d });
              setProvisoire({ identifiant: r.compte.identifiant, motDePasse: r.motDePasseProvisoire });
            } else {
              await appeler(`/comptes/${edition.id}`, { methode: 'PATCH', corps: d });
              await rafraichirCompte();
            }
            setEdition(null);
            void comptes.recharger();
          }}
        />
      )}
      {provisoire && <MotDePasseMontre identifiant={provisoire.identifiant} motDePasse={provisoire.motDePasse} fermer={() => setProvisoire(null)} />}
    </div>
  );
}
