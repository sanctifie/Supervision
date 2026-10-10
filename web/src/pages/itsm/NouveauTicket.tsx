import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, ShoppingCart } from 'lucide-react';
import type { ArticleResume } from '../../../../shared/connaissances';
import { appeler } from '../../lib/api';
import { useSupervision } from '../../components/Coquille';
import { Carte } from '../../components/ui';
import { CHEMIN_TYPE, IconeType, PastillePriorite, depuisChampDate, useReferentiels } from '../../components/itsm';
import { AIDE_IMPACT, AIDE_URGENCE, CATEGORIES, LIBELLE_NIVEAU, LIBELLE_TYPE, prioriteDeMatrice, type Niveau, type Ticket, type TypeTicket } from '../../../../shared/itsm';

const TYPES: TypeTicket[] = ['incident', 'demande', 'probleme', 'changement'];

/** Création d'un ticket, avec les champs propres à chaque type. */
export default function NouveauTicket() {
  const [params] = useSearchParams();
  const naviguer = useNavigate();
  const { nom, peut } = useSupervision();
  const agent = peut('agir');
  const typesPermis = agent ? TYPES : TYPES.filter((t) => t === 'incident' || t === 'demande');
  const ref = useReferentiels();
  const typeDemande = params.get('type') as TypeTicket;
  const typeInitial = TYPES.includes(typeDemande) && (agent || typeDemande === 'incident' || typeDemande === 'demande') ? typeDemande : 'incident';
  const lien = params.get('lien') ?? '';

  const [type, setType] = useState<TypeTicket>(typeInitial);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState<Niveau>(2);
  const [urgence, setUrgence] = useState<Niveau>(2);
  const [categorie, setCategorie] = useState(CATEGORIES[typeInitial][0]);
  const [ci, setCi] = useState('');
  const [groupe, setGroupe] = useState('');
  const [assigneA, setAssigneA] = useState('');
  const [demandeur, setDemandeur] = useState(nom);
  const [typeChangement, setTypeChangement] = useState('normal');
  const [risque, setRisque] = useState('moyen');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [justification, setJustification] = useState('');
  const [planMiseEnOeuvre, setPlanMiseEnOeuvre] = useState('');
  const [planRetourArriere, setPlanRetourArriere] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => setCategorie(CATEGORIES[type][0]), [type]);

  // Créé depuis un autre ticket : reprendre son titre et son CI.
  useEffect(() => {
    if (!lien) return;
    appeler<{ ticket: Ticket }>(`/tickets/${encodeURIComponent(lien)}`)
      .then(({ ticket }) => {
        setTitre((x) => x || ticket.titre);
        setCi((x) => x || ticket.ci || '');
        setDescription((x) => x || `Lié à ${ticket.numero} : ${ticket.titre}`);
      })
      .catch(() => undefined);
  }, [lien]);

  const priorite = prioriteDeMatrice(impact, urgence);

  // Suggestions de la base de connaissances pendant la saisie du titre.
  const [suggestions, setSuggestions] = useState<ArticleResume[]>([]);
  useEffect(() => {
    if (titre.trim().length < 6) {
      setSuggestions([]);
      return;
    }
    const minuterie = setTimeout(() => {
      appeler<ArticleResume[]>(`/connaissances/suggestions?q=${encodeURIComponent(titre)}`).then(setSuggestions, () => undefined);
    }, 400);
    return () => clearTimeout(minuterie);
  }, [titre]);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const corps: Record<string, unknown> = {
        type,
        titre,
        description,
        impact,
        urgence,
        categorie,
        ci: ci || null,
        groupe: groupe || null,
        assigneA: assigneA || null,
        demandeur,
        lien: lien || undefined,
      };
      if (type === 'changement')
        Object.assign(corps, { typeChangement, risque, debutPrevu: depuisChampDate(debut), finPrevue: depuisChampDate(fin), justification, planMiseEnOeuvre, planRetourArriere });
      const t = await appeler<Ticket>('/tickets', { methode: 'POST', corps });
      naviguer(`/tickets/${t.numero}`, { replace: true });
    } catch (x) {
      setErreur((x as Error).message);
      setEnCours(false);
    }
  }

  return (
    <form className="empile" onSubmit={creer} style={{ maxWidth: 980 }}>
      <Link to={CHEMIN_TYPE[type]} className="lien-fleche" style={{ color: 'var(--gris)' }}>
        <ArrowLeft size={14} /> {LIBELLE_TYPE[type].des}
      </Link>
      <div className="onglets" style={{ alignSelf: 'flex-start' }}>
        {typesPermis.map((x) => (
          <button type="button" key={x} className={type === x ? 'actif' : ''} onClick={() => setType(x)}>
            <IconeType type={x} taille={13} /> {LIBELLE_TYPE[x].un}
          </button>
        ))}
      </div>

      {type === 'demande' && (
        <div className="encadre ligne-flex">
          <ShoppingCart size={16} color="#2f5bea" />
          <span>Un compte, un poste, une réparation, un export, une formation ? Le catalogue pose les bonnes questions et envoie la demande à la bonne équipe.</span>
          <Link className="bouton petit primaire" to="/catalogue">
            Ouvrir le catalogue
          </Link>
        </div>
      )}
      <Carte titre={LIBELLE_TYPE[type].nouveau} sousTitre={lien ? `Sera lié à ${lien}` : undefined}>
        <div className="champ-groupe" style={{ marginTop: 0 }}>
          <label className="etiquette">Titre *</label>
          <input
            className="champ"
            required
            autoFocus
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder={
              type === 'incident'
                ? 'Ex. : la caisse du poste 2 ne valide plus les ventes'
                : type === 'changement'
                  ? 'Ex. : mise à jour Officina 1.2'
                  : type === 'probleme'
                    ? 'Ex. : synchronisation lente chaque matin'
                    : 'Ex. : créer un compte pour la nouvelle préparatrice'
            }
          />
        </div>
        {suggestions.length > 0 && (type === 'incident' || type === 'demande') && (
          <div className="encadre suggestions-kb">
            <strong>Ces articles peuvent résoudre le problème tout de suite :</strong>
            {suggestions.map((a) => (
              <Link key={a.id} to={`/connaissances/${a.numero}`} target="_blank" rel="noreferrer">
                <BookOpen size={13} /> {a.titre}
              </Link>
            ))}
          </div>
        )}
        <div className="champ-groupe">
          <label className="etiquette">Description</label>
          <textarea className="champ" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="grille g3" style={{ gap: 12, marginTop: 4 }}>
          <div className="champ-groupe">
            <label className="etiquette">Impact</label>
            <select className="champ" value={impact} onChange={(e) => setImpact(Number(e.target.value) as Niveau)}>
              {([1, 2, 3] as Niveau[]).map((n) => (
                <option key={n} value={n}>
                  {LIBELLE_NIVEAU[n]}
                </option>
              ))}
            </select>
            <span className="discret" style={{ fontSize: '0.74rem' }}>
              {AIDE_IMPACT[impact]}
            </span>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Urgence</label>
            <select className="champ" value={urgence} onChange={(e) => setUrgence(Number(e.target.value) as Niveau)}>
              {([1, 2, 3] as Niveau[]).map((n) => (
                <option key={n} value={n}>
                  {LIBELLE_NIVEAU[n]}
                </option>
              ))}
            </select>
            <span className="discret" style={{ fontSize: '0.74rem' }}>
              {AIDE_URGENCE[urgence]}
            </span>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Priorité calculée</label>
            <div style={{ paddingTop: 8 }}>
              <PastillePriorite p={priorite} />
            </div>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Catégorie</label>
            <select className="champ" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              {CATEGORIES[type].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Élément de configuration</label>
            <select className="champ" value={ci} onChange={(e) => setCi(e.target.value)}>
              <option value="">—</option>
              {ref.elementsConfiguration.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {agent && (
            <>
              <div className="champ-groupe">
                <label className="etiquette">Demandeur</label>
                <input className="champ" value={demandeur} onChange={(e) => setDemandeur(e.target.value)} />
              </div>
              <div className="champ-groupe">
                <label className="etiquette">Groupe</label>
                <select className="champ" value={groupe} onChange={(e) => setGroupe(e.target.value)}>
                  <option value="">—</option>
                  {ref.equipe.groupes.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="champ-groupe">
                <label className="etiquette">Assigné à</label>
                <select className="champ" value={assigneA} onChange={(e) => setAssigneA(e.target.value)}>
                  <option value="">— personne —</option>
                  {[...new Set([...ref.equipe.membres, nom])].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      </Carte>

      {type === 'changement' && (
        <Carte titre="Planification et plans" sousTitre="Complétables plus tard ; obligatoires avant l’évaluation (sauf changement standard)">
          <div className="grille g2" style={{ gap: 12 }}>
            <div className="champ-groupe">
              <label className="etiquette">Type</label>
              <select className="champ" value={typeChangement} onChange={(e) => setTypeChangement(e.target.value)}>
                <option value="standard">Standard (pré-approuvé, répétitif, faible risque)</option>
                <option value="normal">Normal (passe en CAB)</option>
                <option value="urgent">Urgent (corrige un incident en cours)</option>
              </select>
            </div>
            <div className="champ-groupe">
              <label className="etiquette">Risque</label>
              <select className="champ" value={risque} onChange={(e) => setRisque(e.target.value)}>
                <option value="faible">Faible</option>
                <option value="moyen">Moyen</option>
                <option value="eleve">Élevé</option>
              </select>
            </div>
            <div className="champ-groupe">
              <label className="etiquette">Début prévu</label>
              <input className="champ" type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} />
            </div>
            <div className="champ-groupe">
              <label className="etiquette">Fin prévue</label>
              <input className="champ" type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} />
            </div>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Justification</label>
            <textarea className="champ" rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Plan de mise en œuvre</label>
            <textarea className="champ mono" rows={3} value={planMiseEnOeuvre} onChange={(e) => setPlanMiseEnOeuvre(e.target.value)} />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Plan de retour arrière</label>
            <textarea className="champ mono" rows={3} value={planRetourArriere} onChange={(e) => setPlanRetourArriere(e.target.value)} />
          </div>
        </Carte>
      )}

      {erreur && <div className="erreur">{erreur}</div>}
      <div className="ligne-flex">
        <span className="espace" />
        <Link className="bouton" to={CHEMIN_TYPE[type]}>
          Annuler
        </Link>
        <button className="bouton primaire" type="submit" disabled={enCours || !titre.trim()}>
          Créer {type === 'demande' ? 'la demande' : type === 'incident' ? 'l’incident' : type === 'probleme' ? 'le problème' : 'le changement'}
        </button>
      </div>
    </form>
  );
}
