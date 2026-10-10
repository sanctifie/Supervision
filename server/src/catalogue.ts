import { randomUUID } from 'node:crypto';
import type { Stockage } from './stockage';
import type { Tickets } from './tickets';
import { ErreurMetier } from './erreurs';
import { ICONES_CATALOGUE, remplirModele, type ArticleCatalogue, type ReponseVariable, type TypeVariable, type Variable } from '../../shared/catalogue';
import { CATEGORIES, type Niveau, type Ticket } from '../../shared/itsm';

/**
 * Le catalogue de demandes : gestion (administrateurs) et commande
 * (tout le monde). Les réponses sont contrôlées selon le type de chaque
 * champ avant de créer la demande.
 */

const TYPES: TypeVariable[] = ['texte', 'zone', 'choix', 'date', 'nombre', 'case'];
const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const niveau = (v: unknown, defaut: Niveau): Niveau => (v === 1 || v === 2 || v === 3 ? v : defaut);

/** Le catalogue de départ, pensé pour une officine. */
function catalogueInitial(): Omit<ArticleCatalogue, 'id'>[] {
  const roles = ['Pharmacien(ne)', 'Préparateur / préparatrice', 'Caissier / caissière', 'Comptable', 'Titulaire'];
  return [
    {
      nom: 'Créer un compte Officina',
      description: 'Un nouvel employé arrive : son compte, son rôle et son code PIN.',
      categorie: 'Accès / compte',
      icone: 'utilisateur',
      groupe: 'Support officine',
      impact: 3,
      urgence: 2,
      modeleTitre: 'Compte Officina : {prenom} {nom}',
      ordre: 1,
      actif: true,
      variables: [
        { cle: 'prenom', libelle: 'Prénom', type: 'texte', obligatoire: true },
        { cle: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true },
        { cle: 'role', libelle: 'Rôle', type: 'choix', obligatoire: true, options: roles },
        { cle: 'arrivee', libelle: 'Date d’arrivée', type: 'date', obligatoire: true },
        { cle: 'telephone', libelle: 'Téléphone', type: 'texte', obligatoire: false, aide: 'Pour envoyer le code par SMS' },
      ],
    },
    {
      nom: 'Désactiver un compte (départ)',
      description: 'Un employé quitte l’officine : couper ses accès le jour de son départ.',
      categorie: 'Accès / compte',
      icone: 'depart',
      groupe: 'Support officine',
      impact: 2,
      urgence: 2,
      modeleTitre: 'Départ : désactiver le compte de {personne}',
      ordre: 2,
      actif: true,
      variables: [
        { cle: 'personne', libelle: 'Personne qui part', type: 'texte', obligatoire: true },
        { cle: 'depart', libelle: 'Date de départ', type: 'date', obligatoire: true },
        { cle: 'materiel', libelle: 'Récupérer badge et matériel', type: 'case', obligatoire: false },
      ],
    },
    {
      nom: 'Réinitialiser un code PIN',
      description: 'Code PIN oublié ou compte bloqué après plusieurs essais.',
      categorie: 'Accès / compte',
      icone: 'cle',
      groupe: 'Support officine',
      impact: 3,
      urgence: 1,
      modeleTitre: 'Réinitialiser le PIN de {personne}',
      ordre: 3,
      actif: true,
      variables: [
        { cle: 'personne', libelle: 'Personne concernée', type: 'texte', obligatoire: true },
        { cle: 'poste', libelle: 'Poste', type: 'texte', obligatoire: false, aide: 'Ex. : comptoir 2' },
      ],
    },
    {
      nom: 'Installer un poste comptoir',
      description: 'Une nouvelle tablette ou un nouvel ordinateur de caisse, avec ou sans imprimante.',
      categorie: 'Nouveau poste',
      icone: 'poste',
      groupe: 'Exploitation',
      impact: 3,
      urgence: 3,
      modeleTitre: 'Nouveau poste comptoir : {emplacement}',
      ordre: 4,
      actif: true,
      variables: [
        { cle: 'emplacement', libelle: 'Emplacement', type: 'texte', obligatoire: true, aide: 'Ex. : comptoir 3, réserve' },
        { cle: 'appareil', libelle: 'Appareil', type: 'choix', obligatoire: true, options: ['Tablette', 'Ordinateur'] },
        { cle: 'imprimante', libelle: 'Avec imprimante ticket', type: 'case', obligatoire: false },
        { cle: 'souhaite', libelle: 'Pour le', type: 'date', obligatoire: false },
      ],
    },
    {
      nom: 'Réparer ou remplacer un matériel',
      description: 'Imprimante, lecteur de code-barres, tiroir-caisse, terminal de paiement…',
      categorie: 'Imprimante / matériel',
      icone: 'materiel',
      groupe: 'Support officine',
      impact: 3,
      urgence: 2,
      modeleTitre: '{equipement} à réparer ({poste})',
      ordre: 5,
      actif: true,
      variables: [
        {
          cle: 'equipement',
          libelle: 'Équipement',
          type: 'choix',
          obligatoire: true,
          options: ['Imprimante ticket', 'Imprimante A4', 'Lecteur de code-barres', 'Tiroir-caisse', 'Terminal de paiement', 'Autre'],
        },
        { cle: 'poste', libelle: 'Poste', type: 'texte', obligatoire: true },
        { cle: 'symptome', libelle: 'Ce qui ne va pas', type: 'zone', obligatoire: true },
      ],
    },
    {
      nom: 'Ajouter ou corriger un produit',
      description: 'Un médicament absent du référentiel, un prix ou un code-barres faux.',
      categorie: 'Paramétrage',
      icone: 'produit',
      groupe: 'Support officine',
      impact: 3,
      urgence: 3,
      modeleTitre: 'Référentiel : {designation}',
      ordre: 6,
      actif: true,
      variables: [
        { cle: 'designation', libelle: 'Désignation', type: 'texte', obligatoire: true },
        { cle: 'code', libelle: 'Code CIP / EAN', type: 'texte', obligatoire: false },
        { cle: 'correction', libelle: 'À ajouter ou corriger', type: 'zone', obligatoire: true },
      ],
    },
    {
      nom: 'Export de données',
      description: 'Ventes, stock, comptabilité ou clients, sur une période.',
      categorie: 'Données / export',
      icone: 'export',
      groupe: 'Exploitation',
      impact: 3,
      urgence: 3,
      modeleTitre: 'Export {donnees} du {du} au {au}',
      ordre: 7,
      actif: true,
      variables: [
        { cle: 'donnees', libelle: 'Données', type: 'choix', obligatoire: true, options: ['Ventes', 'Stock', 'Comptabilité', 'Clients', 'Tiers payant'] },
        { cle: 'du', libelle: 'Du', type: 'date', obligatoire: true },
        { cle: 'au', libelle: 'Au', type: 'date', obligatoire: true },
        { cle: 'format', libelle: 'Format', type: 'choix', obligatoire: true, options: ['Excel', 'CSV', 'PDF'] },
      ],
    },
    {
      nom: 'Formation',
      description: 'Une séance sur la caisse, l’ordonnancier, les commandes, l’inventaire…',
      categorie: 'Formation',
      icone: 'formation',
      groupe: 'Support officine',
      impact: 3,
      urgence: 3,
      modeleTitre: 'Formation : {sujet}',
      ordre: 8,
      actif: true,
      variables: [
        { cle: 'sujet', libelle: 'Sujet', type: 'choix', obligatoire: true, options: ['Caisse', 'Ordonnancier', 'Commandes', 'Inventaire', 'Tiers payant', 'Comptabilité'] },
        { cle: 'participants', libelle: 'Participants', type: 'nombre', obligatoire: true },
        { cle: 'souhaite', libelle: 'Date souhaitée', type: 'date', obligatoire: false },
      ],
    },
  ];
}

function nettoyerVariables(v: unknown): Variable[] {
  if (!Array.isArray(v)) throw new ErreurMetier('Champs du formulaire invalides');
  const vus = new Set<string>();
  return v.slice(0, 30).map((x, i) => {
    const libelle = texte(x?.libelle, 80);
    if (!libelle) throw new ErreurMetier(`Le champ n°${i + 1} n’a pas de libellé`);
    const type = TYPES.includes(x?.type) ? (x.type as TypeVariable) : 'texte';
    let cle = texte(x?.cle, 30).replace(/[^a-zA-Z0-9_]/g, '') || `champ${i + 1}`;
    while (vus.has(cle)) cle = `${cle}_${i + 1}`;
    vus.add(cle);
    const options =
      type === 'choix'
        ? (Array.isArray(x?.options) ? x.options : [])
            .map((o: unknown) => texte(o, 80))
            .filter(Boolean)
            .slice(0, 40)
        : undefined;
    if (type === 'choix' && !options?.length) throw new ErreurMetier(`« ${libelle} » : ajoutez au moins un choix`);
    return { cle, libelle, type, obligatoire: !!x?.obligatoire, ...(options ? { options } : {}), ...(texte(x?.aide, 160) ? { aide: texte(x?.aide, 160) } : {}) };
  });
}

/** Contrôle une réponse ; renvoie la valeur propre (texte) ou lève l'erreur. */
function controler(v: Variable, brut: unknown): string {
  if (v.type === 'case') return brut === true || brut === 'oui' || brut === 'true' ? 'Oui' : 'Non';
  const valeur = texte(typeof brut === 'number' ? String(brut) : brut, v.type === 'zone' ? 5000 : 300);
  if (!valeur) {
    if (v.obligatoire) throw new ErreurMetier(`« ${v.libelle} » est obligatoire`);
    return '';
  }
  if (v.type === 'choix' && !v.options?.includes(valeur)) throw new ErreurMetier(`« ${v.libelle} » : choix inconnu`);
  if (v.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur) || Number.isNaN(Date.parse(valeur))) throw new ErreurMetier(`« ${v.libelle} » : date invalide`);
    const [a, m, j] = valeur.split('-');
    return `${j}/${m}/${a}`;
  }
  if (v.type === 'nombre' && !Number.isFinite(Number(valeur.replace(',', '.')))) throw new ErreurMetier(`« ${v.libelle} » : nombre attendu`);
  return valeur;
}

export class Catalogue {
  constructor(
    private readonly stockage: Stockage,
    private readonly tickets: Tickets,
  ) {
    if (!this.stockage.donnees.catalogueInitialise) {
      this.stockage.modifier((e) => {
        e.catalogue = catalogueInitial().map((a) => ({ ...a, id: randomUUID() }));
        e.catalogueInitialise = true;
      });
    }
  }

  private get liste(): ArticleCatalogue[] {
    return this.stockage.donnees.catalogue;
  }

  lister(tous: boolean): ArticleCatalogue[] {
    return this.liste.filter((a) => tous || a.actif).sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'));
  }

  trouver(id: string, tous = false): ArticleCatalogue {
    const a = this.liste.find((x) => x.id === id);
    if (!a || (!a.actif && !tous)) throw new ErreurMetier('Article du catalogue introuvable');
    return a;
  }

  private propre(d: Record<string, unknown>, base?: ArticleCatalogue): Omit<ArticleCatalogue, 'id'> {
    const nom = d.nom !== undefined ? texte(d.nom, 80) : (base?.nom ?? '');
    if (!nom) throw new ErreurMetier('Le nom est obligatoire');
    const variables = d.variables !== undefined ? nettoyerVariables(d.variables) : (base?.variables ?? []);
    const categorie = d.categorie !== undefined ? texte(d.categorie, 60) : (base?.categorie ?? 'Autre');
    return {
      nom,
      description: d.description !== undefined ? texte(d.description, 300) : (base?.description ?? ''),
      categorie: CATEGORIES.demande.includes(categorie) ? categorie : 'Autre',
      icone: ICONES_CATALOGUE.includes(d.icone as never) ? (d.icone as ArticleCatalogue['icone']) : (base?.icone ?? 'autre'),
      groupe: d.groupe !== undefined ? texte(d.groupe, 80) || null : (base?.groupe ?? null),
      impact: niveau(d.impact, base?.impact ?? 3),
      urgence: niveau(d.urgence, base?.urgence ?? 3),
      modeleTitre: (d.modeleTitre !== undefined ? texte(d.modeleTitre, 200) : base?.modeleTitre) || nom,
      variables,
      actif: d.actif !== undefined ? !!d.actif : (base?.actif ?? true),
      ordre: Number.isFinite(Number(d.ordre)) ? Number(d.ordre) : (base?.ordre ?? this.liste.length + 1),
    };
  }

  creer(d: Record<string, unknown>): ArticleCatalogue {
    const a = { ...this.propre(d), id: randomUUID() };
    this.stockage.modifier((e) => {
      e.catalogue.push(a);
    });
    return a;
  }

  modifier(id: string, d: Record<string, unknown>): ArticleCatalogue {
    const a = this.trouver(id, true);
    const nouveau = this.propre(d, a);
    this.stockage.modifier(() => {
      Object.assign(a, nouveau);
    });
    return a;
  }

  supprimer(id: string): void {
    this.trouver(id, true);
    this.stockage.modifier((e) => {
      e.catalogue = e.catalogue.filter((x) => x.id !== id);
    });
  }

  /** Commande : contrôle le formulaire et crée la demande. */
  commander(id: string, valeurs: Record<string, unknown>, commentaire: string, auteur: string): Ticket {
    const a = this.trouver(id);
    const propres: Record<string, string> = {};
    const reponses: ReponseVariable[] = [];
    for (const v of a.variables) {
      const valeur = controler(v, valeurs?.[v.cle]);
      propres[v.cle] = valeur;
      if (valeur) reponses.push({ libelle: v.libelle, valeur });
    }
    const titre = remplirModele(a.modeleTitre, propres) || a.nom;
    const description = [...reponses.map((r) => `${r.libelle} : ${r.valeur}`), ...(commentaire.trim() ? ['', commentaire.trim()] : [])].join('\n');
    const t = this.tickets.creer('demande', { titre, description, impact: a.impact, urgence: a.urgence, categorie: a.categorie, groupe: a.groupe, demandeur: auteur }, auteur);
    this.stockage.modifier(() => {
      t.catalogue = { id: a.id, nom: a.nom };
      t.variables = reponses;
    });
    return t;
  }
}
