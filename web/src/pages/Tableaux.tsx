import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LayoutPanelLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, Modale, Pages, Vide } from '../components/ui';
import { Courbe } from '../components/graphiques';
import { useSupervision } from '../components/Coquille';
import { nombre } from '../../../shared/format';
import { EXEMPLES_REQUETES, PERIODES, type Panneau, type TableauPerso, type VueTableau } from '../../../shared/tableaux';

const COULEURS = ['#2f5bea', '#16a34a', '#e5860a', '#7c5cff', '#dc2626', '#0891b2', '#be185d', '#65a30d', '#475569', '#b45309'];
const affiche = (v: number, unite: string) => `${nombre(Math.round(v * 100) / 100)}${unite ? ` ${unite}` : ''}`;

/** La liste des tableaux de bord personnalisés. */
export default function Tableaux() {
  const etat = useDonnees<{ id: string; nom: string; panneaux: number }[]>('/tableaux', 30_000);
  const { peut } = useSupervision();
  const naviguer = useNavigate();
  const creer = async () => {
    const nom = prompt('Nom du tableau de bord');
    if (nom) naviguer(`/tableaux/${(await appeler<TableauPerso>('/tableaux', { methode: 'POST', corps: { nom } })).id}`);
  };
  return (
    <div className="empile">
      {peut('agir') && (
        <div className="ligne-flex">
          <span className="espace" />
          <button className="bouton primaire" onClick={() => void creer()}>
            <Plus size={15} /> Nouveau tableau
          </button>
        </div>
      )}
      <Charge etat={etat}>
        {(liste) =>
          liste.length ? (
            <Pages liste={liste} parPage={12}>
              {(visibles) => (
                <div className="grille g3">
                  {visibles.map((t) => (
                    <Link key={t.id} to={`/tableaux/${t.id}`} className="carte domaine" style={{ display: 'block' }}>
                      <div className="ligne-flex">
                        <span className="tuile">
                          <LayoutPanelLeft size={16} />
                        </span>
                        <strong style={{ color: 'var(--encre)' }}>{t.nom}</strong>
                        <span className="espace" />
                        <span className="discret">{t.panneaux} panneau(x)</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Pages>
          ) : (
            <Carte>
              <Vide icone={<LayoutPanelLeft size={28} />}>Aucun tableau de bord personnalisé. {peut('agir') && 'Créez-en un, puis ajoutez-lui des panneaux.'}</Vide>
            </Carte>
          )
        }
      </Charge>
    </div>
  );
}

function FormulairePanneau({
  initial,
  fermer,
  enregistrer,
}: {
  initial: Panneau | null;
  fermer: () => void;
  enregistrer: (p: Omit<Panneau, 'id'> & { id?: string }) => Promise<void>;
}) {
  const [d, setD] = useState({ titre: initial?.titre ?? '', type: initial?.type ?? 'courbe', requete: initial?.requete ?? '', unite: initial?.unite ?? '' });
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <Modale titre={initial ? `Modifier « ${initial.titre} »` : 'Nouveau panneau'} fermer={fermer} large>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await enregistrer({ ...d, id: initial?.id });
          } catch (x) {
            setErreur((x as Error).message);
          }
        }}
      >
        <div className="grille g3">
          <div className="champ-groupe">
            <label htmlFor="pan-titre">Titre</label>
            <input id="pan-titre" className="champ" required value={d.titre} onChange={(e) => setD({ ...d, titre: e.target.value })} />
          </div>
          <div className="champ-groupe">
            <label htmlFor="pan-type">Affichage</label>
            <select id="pan-type" className="champ" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as Panneau['type'] })}>
              <option value="courbe">Courbe dans le temps</option>
              <option value="valeur">Valeur actuelle</option>
            </select>
          </div>
          <div className="champ-groupe">
            <label htmlFor="pan-unite">Unité (facultatif)</label>
            <input id="pan-unite" className="champ" maxLength={12} placeholder="%, ms, req/s…" value={d.unite} onChange={(e) => setD({ ...d, unite: e.target.value })} />
          </div>
        </div>
        <div className="champ-groupe">
          <label htmlFor="pan-requete">Requête PromQL</label>
          <textarea id="pan-requete" className="champ mono" rows={3} required value={d.requete} onChange={(e) => setD({ ...d, requete: e.target.value })} />
        </div>
        <div className="champ-groupe">
          <label htmlFor="pan-exemple">Ou partir d’un exemple</label>
          <select id="pan-exemple" className="champ mono" value="" onChange={(e) => e.target.value && setD({ ...d, requete: e.target.value })}>
            <option value="">— choisir —</option>
            {EXEMPLES_REQUETES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
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

/** Un tableau de bord : ses panneaux sur la période choisie. */
export function PageTableau() {
  const { id = '' } = useParams();
  const [heures, setHeures] = useState(6);
  const etat = useDonnees<VueTableau>(`/tableaux/${id}?heures=${heures}`, 30_000);
  const { peut } = useSupervision();
  const agent = peut('agir');
  const naviguer = useNavigate();
  const [formulaire, setFormulaire] = useState<Panneau | 'nouveau' | null>(null);

  return (
    <Charge etat={etat}>
      {(v) => {
        const enregistrer = async (panneaux: (Omit<Panneau, 'id'> & { id?: string })[]) => {
          await appeler(`/tableaux/${id}`, { methode: 'PUT', corps: { panneaux } });
          setFormulaire(null);
          await etat.recharger();
        };
        return (
          <div className="empile">
            <div className="filtres">
              <Link className="bouton petit" to="/tableaux">
                <ArrowLeft size={13} /> Tableaux
              </Link>
              <strong style={{ color: 'var(--encre)' }}>{v.tableau.nom}</strong>
              <div className="onglets">
                {PERIODES.map((p) => (
                  <button key={p.heures} className={heures === p.heures ? 'actif' : ''} onClick={() => setHeures(p.heures)}>
                    {p.libelle}
                  </button>
                ))}
              </div>
              <span className="espace" />
              {agent && (
                <>
                  <button className="bouton primaire petit" onClick={() => setFormulaire('nouveau')}>
                    <Plus size={13} /> Ajouter un panneau
                  </button>
                  <button
                    className="icone-bouton"
                    title="Supprimer ce tableau"
                    aria-label="Supprimer ce tableau"
                    onClick={async () => {
                      if (!confirm(`Supprimer le tableau « ${v.tableau.nom} » et ses panneaux ?`)) return;
                      await appeler(`/tableaux/${id}`, { methode: 'DELETE' });
                      naviguer('/tableaux');
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>

            {v.tableau.panneaux.length ? (
              <Pages liste={v.tableau.panneaux} parPage={6}>
                {(visibles) => (
                  <div className="grille g2">
                    {visibles.map((p) => {
                      const d = v.donnees[p.id] ?? { series: [], erreur: null };
                      const derniere = d.series[0]?.points.at(-1)?.v;
                      return (
                        <Carte
                          key={p.id}
                          titre={p.titre}
                          sousTitre={<span className="mono">{p.requete.length > 70 ? `${p.requete.slice(0, 70)}…` : p.requete}</span>}
                          droite={
                            agent && (
                              <div className="ligne-flex" style={{ gap: 6 }}>
                                <button className="icone-bouton" title="Modifier" aria-label={`Modifier ${p.titre}`} onClick={() => setFormulaire(p)}>
                                  <Pencil size={13} />
                                </button>
                                <button
                                  className="icone-bouton"
                                  title="Retirer"
                                  aria-label={`Retirer ${p.titre}`}
                                  onClick={() => confirm(`Retirer le panneau « ${p.titre} » ?`) && void enregistrer(v.tableau.panneaux.filter((x) => x.id !== p.id))}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )
                          }
                        >
                          {d.erreur ? (
                            <div className="erreur">{d.erreur}</div>
                          ) : !d.series.length ? (
                            <Vide>Aucune donnée pour cette requête sur la période.</Vide>
                          ) : p.type === 'valeur' ? (
                            <div className="kpi-valeur" style={{ fontSize: '2.4rem', padding: '24px 0' }}>
                              {derniere === undefined ? '—' : affiche(derniere, p.unite)}
                            </div>
                          ) : (
                            <>
                              <Courbe
                                series={d.series.map((s, i) => ({ ...s, couleur: COULEURS[i % COULEURS.length] }))}
                                hauteur={220}
                                format={(x) => affiche(x, p.unite)}
                                longue={heures > 24}
                              />
                              {d.series.length > 1 && (
                                <div className="chips" style={{ marginTop: 8 }}>
                                  {d.series.map((s, i) => (
                                    <span key={s.nom} className="discret" style={{ color: COULEURS[i % COULEURS.length] }}>
                                      ● {s.nom}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </Carte>
                      );
                    })}
                  </div>
                )}
              </Pages>
            ) : (
              <Carte>
                <Vide icone={<LayoutPanelLeft size={28} />}>
                  Ce tableau est vide. {agent && 'Ajoutez un panneau : un titre et une requête PromQL (des exemples sont proposés).'}
                </Vide>
              </Carte>
            )}

            {formulaire && (
              <FormulairePanneau
                initial={formulaire === 'nouveau' ? null : formulaire}
                fermer={() => setFormulaire(null)}
                enregistrer={(p) => enregistrer(p.id ? v.tableau.panneaux.map((x) => (x.id === p.id ? p : x)) : [...v.tableau.panneaux, p])}
              />
            )}
          </div>
        );
      }}
    </Charge>
  );
}
