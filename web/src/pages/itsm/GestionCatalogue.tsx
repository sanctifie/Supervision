import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2, Wrench } from 'lucide-react';
import { useDonnees } from '../../lib/useDonnees';
import { appeler } from '../../lib/api';
import { Carte, Charge, Modale, Pastille } from '../../components/ui';
import { useReferentiels } from '../../components/itsm';
import { ICONES } from './Catalogue';
import { ICONES_CATALOGUE, LIBELLE_TYPE_VARIABLE, type ArticleCatalogue, type TypeVariable, type Variable } from '../../../../shared/catalogue';
import { CATEGORIES, LIBELLE_NIVEAU, prioriteDeMatrice, type Niveau } from '../../../../shared/itsm';

type Edition = Omit<ArticleCatalogue, 'id'> & { id?: string };

const NOUVEAU: Edition = {
  nom: '',
  description: '',
  categorie: 'Autre',
  icone: 'autre',
  groupe: null,
  impact: 3,
  urgence: 3,
  modeleTitre: '',
  variables: [],
  actif: true,
  ordre: 99,
};

function EditeurArticle({ initial, fermer, enregistre }: { initial: Edition; fermer: () => void; enregistre: () => void }) {
  const ref = useReferentiels();
  const [a, setA] = useState<Edition>(structuredClone(initial));
  const [erreur, setErreur] = useState<string | null>(null);
  const maj = (m: Partial<Edition>) => setA({ ...a, ...m });
  const majVar = (i: number, m: Partial<Variable>) => maj({ variables: a.variables.map((v, k) => (k === i ? { ...v, ...m } : v)) });
  const deplacer = (i: number, d: number) => {
    const v = [...a.variables];
    const [x] = v.splice(i, 1);
    v.splice(i + d, 0, x);
    maj({ variables: v });
  };
  return (
    <Modale large titre={a.id ? `Modifier « ${initial.nom} »` : 'Nouvel article du catalogue'} fermer={fermer}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErreur(null);
          try {
            if (a.id) await appeler(`/catalogue/${a.id}`, { methode: 'PATCH', corps: a });
            else await appeler('/catalogue', { methode: 'POST', corps: a });
            enregistre();
          } catch (x) {
            setErreur((x as Error).message);
          }
        }}
      >
        <div className="champ-groupe">
          <label className="etiquette">Nom</label>
          <input className="champ" required value={a.nom} onChange={(e) => maj({ nom: e.target.value })} autoFocus />
        </div>
        <div className="champ-groupe">
          <label className="etiquette">Description</label>
          <input className="champ" value={a.description} onChange={(e) => maj({ description: e.target.value })} />
        </div>
        <div className="grille g2" style={{ gap: 12 }}>
          <div className="champ-groupe">
            <label className="etiquette">Catégorie</label>
            <select className="champ" value={a.categorie} onChange={(e) => maj({ categorie: e.target.value })}>
              {CATEGORIES.demande.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Groupe qui traite</label>
            <select className="champ" value={a.groupe ?? ''} onChange={(e) => maj({ groupe: e.target.value || null })}>
              <option value="">—</option>
              {ref.equipe.groupes.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Impact</label>
            <select className="champ" value={a.impact} onChange={(e) => maj({ impact: Number(e.target.value) as Niveau })}>
              {([1, 2, 3] as Niveau[]).map((n) => (
                <option key={n} value={n}>
                  {LIBELLE_NIVEAU[n]}
                </option>
              ))}
            </select>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Urgence (priorité {prioriteDeMatrice(a.impact, a.urgence)})</label>
            <select className="champ" value={a.urgence} onChange={(e) => maj({ urgence: Number(e.target.value) as Niveau })}>
              {([1, 2, 3] as Niveau[]).map((n) => (
                <option key={n} value={n}>
                  {LIBELLE_NIVEAU[n]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="champ-groupe">
          <label className="etiquette">Icône</label>
          <div className="chips">
            {ICONES_CATALOGUE.map((i) => {
              const Icone = ICONES[i];
              return (
                <button
                  key={i}
                  type="button"
                  className={`icone-bouton ${a.icone === i ? 'choisie' : ''}`}
                  onClick={() => maj({ icone: i })}
                  aria-label={i}
                  aria-pressed={a.icone === i}
                >
                  <Icone size={16} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="champ-groupe">
          <label className="etiquette">Titre de la demande</label>
          <input className="champ mono" value={a.modeleTitre} onChange={(e) => maj({ modeleTitre: e.target.value })} placeholder="Compte Officina : {prenom} {nom}" />
          <span className="discret" style={{ fontSize: '0.74rem' }}>
            {'{cle}'} est remplacé par la réponse du champ : {a.variables.map((v) => `{${v.cle}}`).join(' ') || 'ajoutez des champs'}
          </span>
        </div>

        <div className="champ-groupe">
          <label className="etiquette">Champs du formulaire</label>
          {a.variables.map((v, i) => (
            <div key={i} className="variable-ligne">
              <input className="champ" value={v.libelle} placeholder="Libellé" onChange={(e) => majVar(i, { libelle: e.target.value })} required />
              <input
                className="champ mono"
                value={v.cle}
                placeholder="cle"
                onChange={(e) => majVar(i, { cle: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                style={{ width: 110 }}
              />
              <select className="champ" value={v.type} onChange={(e) => majVar(i, { type: e.target.value as TypeVariable })} style={{ width: 150 }}>
                {Object.entries(LIBELLE_TYPE_VARIABLE).map(([t, l]) => (
                  <option key={t} value={t}>
                    {l}
                  </option>
                ))}
              </select>
              <label className="ligne-flex discret" style={{ gap: 4, fontSize: '0.76rem' }}>
                <input type="checkbox" checked={v.obligatoire} onChange={(e) => majVar(i, { obligatoire: e.target.checked })} /> requis
              </label>
              <button type="button" className="bouton petit" disabled={i === 0} onClick={() => deplacer(i, -1)} aria-label="Monter">
                <ArrowUp size={12} />
              </button>
              <button type="button" className="bouton petit" disabled={i === a.variables.length - 1} onClick={() => deplacer(i, 1)} aria-label="Descendre">
                <ArrowDown size={12} />
              </button>
              <button type="button" className="bouton petit danger" onClick={() => maj({ variables: a.variables.filter((_, k) => k !== i) })} aria-label="Retirer">
                <Trash2 size={12} />
              </button>
              {v.type === 'choix' && (
                <input
                  className="champ"
                  style={{ gridColumn: '1 / -1' }}
                  placeholder="Choix, séparés par des virgules"
                  value={(v.options ?? []).join(', ')}
                  onChange={(e) => majVar(i, { options: e.target.value.split(',').map((o) => o.trim()) })}
                />
              )}
            </div>
          ))}
          <button
            type="button"
            className="bouton petit"
            style={{ marginTop: 8 }}
            onClick={() => maj({ variables: [...a.variables, { cle: `champ${a.variables.length + 1}`, libelle: '', type: 'texte', obligatoire: false }] })}
          >
            <Plus size={13} /> Ajouter un champ
          </button>
        </div>
        <label className="ligne-flex" style={{ marginTop: 12, gap: 8, fontSize: '0.86rem' }}>
          <input type="checkbox" checked={a.actif} onChange={(e) => maj({ actif: e.target.checked })} /> Proposé dans le catalogue
        </label>
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
            Enregistrer
          </button>
        </div>
      </form>
    </Modale>
  );
}

/** Gestion du catalogue (administrateurs). */
export default function GestionCatalogue() {
  const etat = useDonnees<ArticleCatalogue[]>('/catalogue?tous', 0);
  const [edition, setEdition] = useState<Edition | null>(null);
  return (
    <Charge etat={etat}>
      {(articles) => (
        <div className="empile">
          <div className="ligne-flex">
            <Link to="/catalogue" className="lien-fleche" style={{ color: 'var(--gris)' }}>
              <ArrowLeft size={14} /> Catalogue
            </Link>
            <span className="espace" />
            <button className="bouton primaire" onClick={() => setEdition({ ...NOUVEAU, ordre: articles.length + 1 })}>
              <Plus size={14} /> Nouvel article
            </button>
          </div>
          <Carte serree titre={`Articles du catalogue (${articles.length})`}>
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Catégorie</th>
                    <th>Groupe</th>
                    <th>Priorité</th>
                    <th>Champs</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {articles.map((a) => {
                    const Icone = ICONES[a.icone] ?? Wrench;
                    return (
                      <tr key={a.id} style={{ opacity: a.actif ? 1 : 0.5 }}>
                        <td>
                          <div className="nom-cellule">
                            <Icone size={16} color="#2f5bea" /> {a.nom}
                            {!a.actif && <Pastille statut="inconnu">masqué</Pastille>}
                          </div>
                        </td>
                        <td className="discret">{a.categorie}</td>
                        <td className="discret">{a.groupe ?? '—'}</td>
                        <td>{prioriteDeMatrice(a.impact, a.urgence)}</td>
                        <td className="discret">{a.variables.length}</td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          <button className="bouton petit" onClick={() => setEdition(a)}>
                            Modifier
                          </button>{' '}
                          <button
                            className="bouton petit danger"
                            aria-label={`Supprimer ${a.nom}`}
                            onClick={async () => {
                              if (!confirm(`Supprimer « ${a.nom} » du catalogue ? Les demandes déjà passées restent.`)) return;
                              await appeler(`/catalogue/${a.id}`, { methode: 'DELETE' });
                              void etat.recharger();
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Carte>
          {edition && (
            <EditeurArticle
              initial={edition}
              fermer={() => setEdition(null)}
              enregistre={() => {
                setEdition(null);
                void etat.recharger();
              }}
            />
          )}
        </div>
      )}
    </Charge>
  );
}
