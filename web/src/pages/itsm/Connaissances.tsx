import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Eye, Plus, Search, ThumbsUp } from 'lucide-react';
import { useDonnees } from '../../lib/useDonnees';
import { useSupervision } from '../../components/Coquille';
import { Erreur, Squelette, Vide } from '../../components/ui';
import { depuis } from '../../../../shared/format';
import { CATEGORIES_ARTICLES, LIBELLE_STATUT_ARTICLE, type ArticleResume } from '../../../../shared/connaissances';

/** La base de connaissances : chercher une solution avant d'ouvrir un ticket. */
export default function Connaissances() {
  const { peut } = useSupervision();
  const agent = peut('agir');
  const [saisie, setSaisie] = useState('');
  const [q, setQ] = useState('');
  const [categorie, setCategorie] = useState('');
  const [statut, setStatut] = useState('');
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (categorie) params.set('categorie', categorie);
  if (statut) params.set('statut', statut);
  const etat = useDonnees<ArticleResume[]>(`/connaissances?${params}`, 0);

  return (
    <div className="empile">
      <div className="carte recherche-kb">
        <h2>Comment pouvons-nous aider ?</h2>
        <p className="discret">Cherchez une solution : imprimante, paiement, synchronisation, mot de passe…</p>
        <form
          className="ligne-flex"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(saisie.trim());
          }}
        >
          <div className="recherche" style={{ display: 'block', flex: 1 }}>
            <Search size={18} />
            <input
              style={{ width: '100%', padding: '12px 14px 12px 40px', fontSize: '0.95rem' }}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="Décrivez le problème…"
              autoFocus
            />
          </div>
          <button className="bouton primaire" type="submit">
            Chercher
          </button>
        </form>
        <div className="filtres" style={{ marginTop: 12 }}>
          <select className="champ" value={categorie} onChange={(e) => setCategorie(e.target.value)} aria-label="Catégorie">
            <option value="">Toutes les catégories</option>
            {CATEGORIES_ARTICLES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {agent && (
            <div className="onglets">
              {[
                ['', 'En cours'],
                ['publie', 'Publiés'],
                ['brouillon', 'Brouillons'],
                ['retire', 'Retirés'],
              ].map(([v, l]) => (
                <button key={v} type="button" className={statut === v ? 'actif' : ''} onClick={() => setStatut(v)}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <span className="espace" />
          {agent && (
            <Link className="bouton primaire" to="/connaissances/nouveau">
              <Plus size={15} /> Nouvel article
            </Link>
          )}
        </div>
      </div>

      {etat.erreur ? (
        <Erreur message={etat.erreur} />
      ) : !etat.donnees ? (
        <Squelette hauteur={240} />
      ) : etat.donnees.length ? (
        <div className="grille g3">
          {etat.donnees.map((a) => (
            <Link key={a.id} to={`/connaissances/${a.numero}`} className="carte domaine" style={{ display: 'block' }}>
              <div className="ligne-flex" style={{ marginBottom: 8 }}>
                <span className="tuile">
                  <BookOpen size={16} />
                </span>
                <span className="discret mono">{a.numero}</span>
                <span className="espace" />
                {a.statut !== 'publie' && <span className={`pastille ${a.statut === 'brouillon' ? 'orange' : 'inconnu'}`}>{LIBELLE_STATUT_ARTICLE[a.statut]}</span>}
                {agent && a.audience === 'equipe' && <span className="pastille violet">Interne</span>}
              </div>
              <h4>{a.titre}</h4>
              <p>{a.resume || a.categorie}</p>
              <div className="ligne-flex discret" style={{ fontSize: '0.74rem' }}>
                <span>{a.categorie}</span>
                <span className="espace" />
                <span>
                  <Eye size={12} style={{ verticalAlign: -2 }} /> {a.vues}
                </span>
                <span>
                  <ThumbsUp size={12} style={{ verticalAlign: -2 }} /> {a.avis.utile}
                </span>
                <span>{depuis(a.majLe)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Vide icone={<BookOpen size={28} />}>
          {q ? (
            <>
              Rien trouvé pour « {q} ». <Link to="/tickets/nouveau?type=incident">Déclarer un incident</Link> ou <Link to="/tickets/nouveau?type=demande">faire une demande</Link>.
            </>
          ) : (
            'Aucun article pour l’instant.'
          )}
        </Vide>
      )}
    </div>
  );
}
