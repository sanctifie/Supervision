import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, GraduationCap, KeyRound, Monitor, Package, Printer, Settings2, Table, UserMinus, UserPlus, Wrench, type LucideIcon } from 'lucide-react';
import { useDonnees } from '../../lib/useDonnees';
import { appeler } from '../../lib/api';
import { useSupervision } from '../../components/Coquille';
import { Carte, Charge, Vide } from '../../components/ui';
import type { ArticleCatalogue, IconeCatalogue, Variable } from '../../../../shared/catalogue';
import type { Ticket } from '../../../../shared/itsm';

export const ICONES: Record<IconeCatalogue, LucideIcon> = {
  utilisateur: UserPlus,
  depart: UserMinus,
  cle: KeyRound,
  poste: Monitor,
  materiel: Printer,
  produit: Package,
  export: Table,
  formation: GraduationCap,
  autre: Wrench,
};

/** Le catalogue : choisir ce dont on a besoin. */
export default function Catalogue() {
  const etat = useDonnees<ArticleCatalogue[]>('/catalogue', 0);
  const { peut } = useSupervision();
  return (
    <Charge etat={etat}>
      {(articles) => {
        return (
          <div className="empile">
            <div className="ligne-flex">
              <span className="discret">Choisissez ce dont vous avez besoin : la demande arrive directement à la bonne équipe, avec toutes les informations.</span>
              <span className="espace" />
              <Link className="bouton" to="/connaissances">
                <BookOpen size={14} /> Chercher une solution
              </Link>
              {peut('administrer') && (
                <Link className="bouton" to="/catalogue/gerer">
                  <Settings2 size={14} /> Gérer le catalogue
                </Link>
              )}
            </div>
            {articles.length ? (
              <div className="grille g3">
                {articles.map((a) => {
                  const Icone = ICONES[a.icone] ?? Wrench;
                  return (
                    <Link key={a.id} to={`/catalogue/${a.id}`} className="carte domaine">
                      <span className="tuile grande">
                        <Icone size={22} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="nav-titre" style={{ padding: '0 0 4px' }}>
                          {a.categorie}
                        </div>
                        <h4>{a.nom}</h4>
                        <p>{a.description}</p>
                        <span className="lien-fleche">
                          Commander <ArrowRight size={13} />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Carte>
                <Vide>Le catalogue est vide.</Vide>
              </Carte>
            )}
          </div>
        );
      }}
    </Charge>
  );
}

export function ChampVariable({ v, valeur, changer }: { v: Variable; valeur: string | boolean; changer: (x: string | boolean) => void }) {
  const id = `var-${v.cle}`;
  if (v.type === 'case')
    return (
      <label className="ligne-flex champ-groupe" style={{ gap: 8, fontSize: '0.88rem' }}>
        <input type="checkbox" checked={valeur === true} onChange={(e) => changer(e.target.checked)} /> {v.libelle}
      </label>
    );
  return (
    <div className="champ-groupe">
      <label className="etiquette" htmlFor={id}>
        {v.libelle}
        {v.obligatoire ? ' *' : ''}
      </label>
      {v.type === 'zone' ? (
        <textarea id={id} className="champ" rows={4} required={v.obligatoire} value={String(valeur)} onChange={(e) => changer(e.target.value)} />
      ) : v.type === 'choix' ? (
        <select id={id} className="champ" required={v.obligatoire} value={String(valeur)} onChange={(e) => changer(e.target.value)}>
          <option value="">— choisir —</option>
          {v.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className="champ"
          type={v.type === 'date' ? 'date' : v.type === 'nombre' ? 'number' : 'text'}
          required={v.obligatoire}
          value={String(valeur)}
          onChange={(e) => changer(e.target.value)}
        />
      )}
      {v.aide && (
        <span className="discret" style={{ fontSize: '0.74rem' }}>
          {v.aide}
        </span>
      )}
    </div>
  );
}

/** Le formulaire de commande d'un article. */
export function CommandeCatalogue() {
  const { id = '' } = useParams();
  const etat = useDonnees<ArticleCatalogue>(`/catalogue/${encodeURIComponent(id)}`, 0);
  const naviguer = useNavigate();
  const [valeurs, setValeurs] = useState<Record<string, string | boolean>>({});
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  return (
    <Charge etat={etat}>
      {(a) => {
        const Icone = ICONES[a.icone] ?? Wrench;
        return (
          <form
            className="empile"
            style={{ maxWidth: 760 }}
            onSubmit={async (e) => {
              e.preventDefault();
              setErreur(null);
              setEnCours(true);
              try {
                const t = await appeler<Ticket>(`/catalogue/${a.id}/commander`, { methode: 'POST', corps: { valeurs, commentaire } });
                naviguer(`/tickets/${t.numero}`, { replace: true });
              } catch (x) {
                setErreur((x as Error).message);
                setEnCours(false);
              }
            }}
          >
            <Link to="/catalogue" className="lien-fleche" style={{ color: 'var(--gris)' }}>
              <ArrowLeft size={14} /> Catalogue
            </Link>
            <Carte>
              <div className="ligne-flex" style={{ marginBottom: 8 }}>
                <span className="tuile grande">
                  <Icone size={22} />
                </span>
                <div>
                  <h2 style={{ fontSize: '1.2rem' }}>{a.nom}</h2>
                  <span className="discret">{a.description}</span>
                </div>
              </div>
              {a.variables.map((v) => (
                <ChampVariable key={v.cle} v={v} valeur={valeurs[v.cle] ?? (v.type === 'case' ? false : '')} changer={(x) => setValeurs({ ...valeurs, [v.cle]: x })} />
              ))}
              <div className="champ-groupe">
                <label className="etiquette">Précisions (facultatif)</label>
                <textarea className="champ" rows={3} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
              </div>
            </Carte>
            {erreur && <div className="erreur">{erreur}</div>}
            <div className="ligne-flex">
              <span className="discret">{a.groupe ? `Traité par : ${a.groupe}` : ''}</span>
              <span className="espace" />
              <button className="bouton primaire" type="submit" disabled={enCours}>
                Envoyer la demande
              </button>
            </div>
          </form>
        );
      }}
    </Charge>
  );
}
