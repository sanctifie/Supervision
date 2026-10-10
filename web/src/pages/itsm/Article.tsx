import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, History, Link2, Pencil, Save, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useDonnees } from '../../lib/useDonnees';
import { appeler } from '../../lib/api';
import { useSupervision } from '../../components/Coquille';
import { Carte, Charge, Pastille } from '../../components/ui';
import { Markdown } from '../../components/Markdown';
import { useReferentiels } from '../../components/itsm';
import { dateHeure } from '../../../../shared/format';
import { CATEGORIES_ARTICLES, LIBELLE_STATUT_ARTICLE, type Article as ArticleT } from '../../../../shared/connaissances';

type Brouillon = Pick<ArticleT, 'titre' | 'resume' | 'contenu' | 'categorie' | 'ci' | 'motsCles' | 'audience'>;

const VIDE: Brouillon = {
  titre: '',
  resume: '',
  contenu: '## Symptômes\n\n## Solution\n1. \n\n## Pour vérifier\n- ',
  categorie: 'Autre',
  ci: null,
  motsCles: [],
  audience: 'equipe',
};

function Editeur({ initial, enregistrer, annuler }: { initial: Brouillon; enregistrer: (b: Brouillon) => Promise<void>; annuler: () => void }) {
  const ref = useReferentiels();
  const [b, setB] = useState(initial);
  const [motsCles, setMotsCles] = useState(initial.motsCles.join(', '));
  const [apercu, setApercu] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = (m: Partial<Brouillon>) => setB({ ...b, ...m });
  return (
    <form
      className="empile"
      onSubmit={async (e) => {
        e.preventDefault();
        setErreur(null);
        try {
          await enregistrer({
            ...b,
            motsCles: motsCles
              .split(',')
              .map((m) => m.trim())
              .filter(Boolean),
          });
        } catch (x) {
          setErreur((x as Error).message);
        }
      }}
    >
      <Carte>
        <div className="champ-groupe">
          <label className="etiquette">Titre *</label>
          <input
            className="champ"
            required
            value={b.titre}
            onChange={(e) => champ({ titre: e.target.value })}
            placeholder="Ex. : Que faire si l’imprimante ticket ne sort plus rien"
            autoFocus
          />
        </div>
        <div className="champ-groupe">
          <label className="etiquette">Résumé</label>
          <input className="champ" value={b.resume} onChange={(e) => champ({ resume: e.target.value })} placeholder="Une phrase, affichée dans les résultats de recherche" />
        </div>
        <div className="grille g3" style={{ gap: 12 }}>
          <div className="champ-groupe">
            <label className="etiquette">Catégorie</label>
            <select className="champ" value={b.categorie} onChange={(e) => champ({ categorie: e.target.value })}>
              {CATEGORIES_ARTICLES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Élément (CI)</label>
            <select className="champ" value={b.ci ?? ''} onChange={(e) => champ({ ci: e.target.value || null })}>
              <option value="">—</option>
              {ref.elementsConfiguration.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Visible par</label>
            <select className="champ" value={b.audience} onChange={(e) => champ({ audience: e.target.value as Brouillon['audience'] })}>
              <option value="equipe">L’équipe seulement (interne)</option>
              <option value="tous">Tout le monde (demandeurs compris)</option>
            </select>
          </div>
        </div>
        <div className="champ-groupe">
          <label className="etiquette">Mots-clés (séparés par des virgules)</label>
          <input className="champ" value={motsCles} onChange={(e) => setMotsCles(e.target.value)} placeholder="imprimante, ticket, rouleau" />
        </div>
      </Carte>
      <Carte
        titre="Contenu"
        sousTitre="Markdown simple : ## titre, - liste, 1. étape, **gras**, `code`, ``` bloc de code ```, [lien](https://…)"
        droite={
          <div className="onglets">
            <button type="button" className={!apercu ? 'actif' : ''} onClick={() => setApercu(false)}>
              Écrire
            </button>
            <button type="button" className={apercu ? 'actif' : ''} onClick={() => setApercu(true)}>
              Aperçu
            </button>
          </div>
        }
      >
        {apercu ? <Markdown texte={b.contenu} /> : <textarea className="champ mono" rows={18} value={b.contenu} onChange={(e) => champ({ contenu: e.target.value })} />}
      </Carte>
      {erreur && <div className="erreur">{erreur}</div>}
      <div className="ligne-flex">
        <span className="espace" />
        <button type="button" className="bouton" onClick={annuler}>
          Annuler
        </button>
        <button className="bouton primaire" type="submit">
          <Save size={14} /> Enregistrer
        </button>
      </div>
    </form>
  );
}

/** Création : vide, ou pré-remplie depuis un ticket (?depuis=INC…). */
export function NouvelArticle() {
  const [params] = useSearchParams();
  const depuis = params.get('depuis');
  const naviguer = useNavigate();
  const [initial, setInitial] = useState<Brouillon | null>(depuis ? null : VIDE);
  useEffect(() => {
    if (!depuis) return;
    appeler<Partial<Brouillon>>(`/connaissances/modele/${encodeURIComponent(depuis)}`)
      .then((m) => setInitial({ ...VIDE, ...m, audience: 'equipe' }))
      .catch(() => setInitial(VIDE));
  }, [depuis]);
  if (!initial) return null;
  return (
    <div className="empile">
      {depuis && <div className="encadre">Brouillon pré-rempli depuis {depuis} ; il y sera lié.</div>}
      <Editeur
        initial={initial}
        annuler={() => naviguer(-1)}
        enregistrer={async (b) => {
          const a = await appeler<ArticleT>('/connaissances', { methode: 'POST', corps: { ...b, ticket: depuis ?? undefined } });
          naviguer(`/connaissances/${a.numero}`, { replace: true });
        }}
      />
    </div>
  );
}

export default function Article() {
  const { numero = '' } = useParams();
  const etat = useDonnees<ArticleT>(`/connaissances/${encodeURIComponent(numero)}`, 0);
  const { peut } = useSupervision();
  const agent = peut('agir');
  const [edition, setEdition] = useState(false);
  const [historique, setHistorique] = useState(false);
  const [avis, setAvis] = useState<string | null>(null);
  const [ticket, setTicket] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const action = async (chemin: string, corps: unknown, methode = 'POST') => {
    setErreur(null);
    try {
      etat.remplacer(await appeler<ArticleT>(`/connaissances/${numero}${chemin}`, { methode, corps }));
      return true;
    } catch (x) {
      setErreur((x as Error).message);
      return false;
    }
  };

  return (
    <Charge etat={etat}>
      {(a) =>
        edition ? (
          <Editeur
            initial={a}
            annuler={() => setEdition(false)}
            enregistrer={async (b) => {
              if (await action('', b, 'PATCH')) setEdition(false);
            }}
          />
        ) : (
          <div className="empile">
            <Link to="/connaissances" className="lien-fleche" style={{ color: 'var(--gris)' }}>
              <ArrowLeft size={14} /> Base de connaissances
            </Link>
            <div className="grille g-principal" style={{ alignItems: 'start' }}>
              <div className="empile">
                <div className="carte">
                  <div className="ligne-flex discret mono" style={{ marginBottom: 6 }}>
                    {a.numero} · {a.categorie}
                    {a.ci ? ` · ${a.ci}` : ''}
                  </div>
                  <h1 style={{ fontSize: '1.5rem', marginBottom: 6 }}>{a.titre}</h1>
                  {a.resume && <p style={{ marginTop: 0, color: 'var(--gris)' }}>{a.resume}</p>}
                  <Markdown texte={a.contenu} />
                  <div className="ligne-flex avis">
                    <span>Cet article vous a-t-il aidé ?</span>
                    <button
                      className="bouton petit"
                      onClick={async () => {
                        if (await action('/avis', { utile: true })) setAvis('Merci pour votre retour.');
                      }}
                    >
                      <ThumbsUp size={13} /> Oui
                    </button>
                    <button
                      className="bouton petit"
                      onClick={async () => {
                        if (await action('/avis', { utile: false })) setAvis('Merci. Si le problème continue, déclarez un incident.');
                      }}
                    >
                      <ThumbsDown size={13} /> Non
                    </button>
                    {avis && <span className="discret">{avis}</span>}
                    {avis?.startsWith('Merci.') && (
                      <Link className="bouton petit primaire" to={`/tickets/nouveau?type=incident`}>
                        Déclarer un incident
                      </Link>
                    )}
                  </div>
                </div>
                {erreur && <div className="erreur">{erreur}</div>}
              </div>

              <div className="empile">
                <Carte
                  titre="Article"
                  droite={<Pastille statut={a.statut === 'publie' ? 'vert' : a.statut === 'brouillon' ? 'orange' : 'inconnu'}>{LIBELLE_STATUT_ARTICLE[a.statut]}</Pastille>}
                >
                  <div className="fiche-dates" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                    <span>
                      Écrit par {a.auteur}, le {dateHeure(a.creeLe)}
                    </span>
                    <span>
                      Mis à jour {dateHeure(a.majLe)}
                      {a.modifiePar ? ` par ${a.modifiePar}` : ''}
                    </span>
                    <span>
                      <Eye size={12} style={{ verticalAlign: -2 }} /> {a.vues} lecture(s) · 👍 {a.avis.utile} · 👎 {a.avis.inutile}
                    </span>
                    {agent && <span>Visible par : {a.audience === 'tous' ? 'tout le monde' : 'l’équipe seulement'}</span>}
                  </div>
                  {a.motsCles.length > 0 && (
                    <div className="chips" style={{ marginTop: 10 }}>
                      {a.motsCles.map((m) => (
                        <span key={m} className="pastille inconnu">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                  {agent && (
                    <div className="ligne-flex" style={{ marginTop: 14 }}>
                      <button className="bouton" onClick={() => setEdition(true)}>
                        <Pencil size={13} /> Modifier
                      </button>
                      {a.statut !== 'publie' && (
                        <button className="bouton primaire" onClick={() => action('/statut', { statut: 'publie' })}>
                          Publier
                        </button>
                      )}
                      {a.statut === 'publie' && (
                        <button className="bouton" onClick={() => action('/statut', { statut: 'retire' })}>
                          Retirer
                        </button>
                      )}
                      {a.statut === 'retire' && (
                        <button className="bouton" onClick={() => action('/statut', { statut: 'brouillon' })}>
                          Repasser en brouillon
                        </button>
                      )}
                    </div>
                  )}
                </Carte>

                {agent && (
                  <Carte titre={`Tickets liés (${a.tickets.length})`}>
                    {a.tickets.map((n) => (
                      <div key={n} className="ligne-flex lien-ligne">
                        <Link className="mono lien-ticket" to={`/tickets/${n}`}>
                          {n}
                        </Link>
                        <span className="espace" />
                        <button className="bouton petit" aria-label={`Retirer le lien avec ${n}`} onClick={() => action(`/liens/${n}`, undefined, 'DELETE')}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <form
                      className="ligne-flex"
                      style={{ marginTop: 10 }}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (ticket.trim() && (await action('/liens', { ticket: ticket.trim().toUpperCase() }))) setTicket('');
                      }}
                    >
                      <input className="champ mono" style={{ flex: 1 }} placeholder="INC0001001…" value={ticket} onChange={(e) => setTicket(e.target.value)} />
                      <button className="bouton" type="submit">
                        <Link2 size={14} /> Lier
                      </button>
                    </form>
                  </Carte>
                )}

                {agent && a.versions.length > 0 && (
                  <Carte
                    titre={`Versions précédentes (${a.versions.length})`}
                    droite={
                      <button className="bouton petit" onClick={() => setHistorique(!historique)}>
                        <History size={13} /> {historique ? 'Masquer' : 'Afficher'}
                      </button>
                    }
                  >
                    {historique &&
                      a.versions.map((v, i) => (
                        <details key={i} className="version">
                          <summary>
                            {dateHeure(v.t)} — {v.auteur}
                          </summary>
                          <strong>{v.titre}</strong>
                          <pre>{v.contenu}</pre>
                        </details>
                      ))}
                  </Carte>
                )}
              </div>
            </div>
          </div>
        )
      }
    </Charge>
  );
}
