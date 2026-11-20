import { createHash } from 'node:crypto';
import type { Stockage } from './stockage';
import type { Tickets } from './tickets';
import { ErreurMetier } from './erreurs';
import {
  etatDefaut,
  LIBELLE_ACTION,
  LIBELLE_CLASSIFICATION,
  LIBELLE_GRAVITE,
  type Action,
  type Analyse,
  type Classification,
  type Defaut,
  type DefautVue,
  type Gravite,
  type Impact,
  type VueQualite,
} from '../../shared/qualite';

/**
 * Analyse de code façon Coverity. Le CI envoie un rapport SARIF (format
 * standard de Semgrep, CodeQL, ESLint, Trivy…) ; chaque défaut reçoit une
 * empreinte stable (sans le numéro de ligne, qui bouge à chaque commit) :
 * on sait ainsi ce qui est nouveau, ce qui reste et ce qui a été corrigé.
 */

export interface EtatQualite {
  analyses: Analyse[];
  defauts: Defaut[];
  /** Dernier CID attribué. */
  cid: number;
}

export const QUALITE_VIDE: EtatQualite = { analyses: [], defauts: [], cid: 1000 };
const MAX_RESULTATS = 20_000;
const MAX_ANALYSES = 200;

/* eslint-disable @typescript-eslint/no-explicit-any -- SARIF : JSON externe, lu champ par champ */
interface Trouvaille {
  empreinte: string;
  outil: string;
  regle: string;
  titreRegle: string;
  categorie: string;
  cwe: string | null;
  impact: Impact;
  message: string;
  fichier: string;
  ligne: number | null;
}

const txt = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Lit un rapport SARIF 2.1.0 (validation : c'est une donnée externe). */
export function lireSarif(sarif: any): Trouvaille[] {
  if (!sarif || typeof sarif !== 'object' || !Array.isArray(sarif.runs)) throw new ErreurMetier('Rapport SARIF attendu (un objet avec « runs »)');
  const trouvailles: Trouvaille[] = [];
  for (const run of sarif.runs) {
    const pilote = run?.tool?.driver ?? {};
    const outil = txt(pilote.name, 80) || 'analyseur';
    const regles = new Map<string, any>();
    for (const r of [...(pilote.rules ?? []), ...(run?.tool?.extensions ?? []).flatMap((e: any) => e?.rules ?? [])]) if (r?.id) regles.set(String(r.id), r);
    for (const res of Array.isArray(run?.results) ? run.results : []) {
      if (trouvailles.length >= MAX_RESULTATS) throw new ErreurMetier(`Rapport trop gros (plus de ${MAX_RESULTATS} résultats)`);
      if (res?.suppressions?.length) continue; // supprimé dans le code (// nosemgrep…)
      const id = txt(res?.ruleId ?? res?.rule?.id, 200) || 'inconnue';
      const regle = regles.get(id) ?? (typeof res?.ruleIndex === 'number' ? pilote.rules?.[res.ruleIndex] : undefined) ?? {};
      const props = { ...(regle.properties ?? {}), ...(res?.properties ?? {}) };
      const tags: string[] = (Array.isArray(props.tags) ? props.tags : []).map(String);
      const cweTag = tags.map((t) => /cwe[-/]0*(\d+)/i.exec(t)).find(Boolean);
      const cwe = cweTag ? `CWE-${cweTag[1]}` : null;
      const loc = res?.locations?.[0]?.physicalLocation ?? {};
      const fichier = txt(loc.artifactLocation?.uri, 300).replace(/^file:\/\//, '') || '(inconnu)';
      const ligne = Number.isInteger(loc.region?.startLine) ? loc.region.startLine : null;
      const message = txt(res?.message?.text, 1000) || txt(regle.shortDescription?.text, 1000) || id;
      const niveau = txt(res?.level ?? regle.defaultConfiguration?.level, 20) || 'warning';
      const score = Number(props['security-severity']);
      const impact: Impact = Number.isFinite(score)
        ? score >= 7
          ? 'eleve'
          : score >= 4
            ? 'moyen'
            : 'faible'
        : niveau === 'error'
          ? 'eleve'
          : niveau === 'warning'
            ? 'moyen'
            : 'faible';
      const securite = !!cwe || tags.some((t) => /security|securite/i.test(t));
      const categorie = securite ? 'Sécurité' : (tags.find((t) => /^(correctness|maintainability|performance|reliability|style)$/i.test(t)) ?? 'Qualité');
      const empreinteSarif = Object.values(res?.partialFingerprints ?? {}).find((v) => typeof v === 'string') as string | undefined;
      const empreinte = createHash('sha256')
        .update(`${outil}|${id}|${empreinteSarif ?? `${fichier}|${message.replace(/\d+/g, '#')}`}`)
        .digest('hex')
        .slice(0, 24);
      trouvailles.push({
        empreinte,
        outil,
        regle: id,
        titreRegle: txt(regle.shortDescription?.text ?? regle.name, 200) || id,
        categorie: categorie.charAt(0).toUpperCase() + categorie.slice(1),
        cwe,
        impact,
        message,
        fichier,
        ligne,
      });
    }
  }
  return trouvailles;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const CLASSIFICATIONS = Object.keys(LIBELLE_CLASSIFICATION) as Classification[];
const ACTIONS = Object.keys(LIBELLE_ACTION) as Action[];
const GRAVITES = Object.keys(LIBELLE_GRAVITE) as Gravite[];

export class Qualite {
  constructor(
    private readonly stockage: Stockage,
    private readonly tickets: Tickets,
  ) {}

  private get etat(): EtatQualite {
    return this.stockage.donnees.qualite;
  }

  private derniere(projet: string): Analyse | undefined {
    return this.etat.analyses.find((a) => a.projet === projet);
  }

  /** Enregistre une analyse : nouveaux, toujours là, corrigés ; et la politique de qualité. */
  importer(sarif: unknown, meta: { projet?: unknown; branche?: unknown; commit?: unknown }, par: string): Analyse {
    const projet = txt(meta.projet, 60).trim() || 'officina';
    if (!/^[\w.-]+$/.test(projet)) throw new ErreurMetier('Projet : lettres, chiffres, point, tiret');
    const trouvailles = lireSarif(sarif);
    const maintenant = Date.now();
    let analyse!: Analyse;
    this.stockage.modifier((e) => {
      const q = e.qualite;
      const id = (q.analyses[0]?.id ?? 0) + 1;
      const parEmpreinte = new Map(q.defauts.filter((d) => d.projet === projet).map((d) => [d.empreinte, d]));
      const vus = new Set<string>();
      let nouveaux = 0;
      const nouveauxEleves: Defaut[] = [];
      for (const t of trouvailles) {
        if (vus.has(t.empreinte)) continue;
        vus.add(t.empreinte);
        const d = parEmpreinte.get(t.empreinte);
        if (d) {
          Object.assign(d, { ligne: t.ligne, fichier: t.fichier, message: t.message, derniereAnalyse: id, vuLe: maintenant });
          if (d.corrigeLe !== null) {
            d.corrigeLe = null;
            d.historique.push({ t: maintenant, par, texte: `Réapparu (analyse #${id})` });
          }
        } else {
          nouveaux++;
          const nd: Defaut = {
            ...t,
            cid: ++q.cid,
            projet,
            premiereAnalyse: id,
            derniereAnalyse: id,
            detecteLe: maintenant,
            vuLe: maintenant,
            corrigeLe: null,
            classification: 'non-classe',
            action: 'non-definie',
            gravite: 'non-definie',
            proprietaire: null,
            ticket: null,
            historique: [{ t: maintenant, par, texte: `Détecté par ${t.outil} (analyse #${id})` }],
          };
          q.defauts.push(nd);
          if (nd.impact === 'eleve') nouveauxEleves.push(nd);
        }
      }
      let corriges = 0;
      for (const d of parEmpreinte.values()) {
        if (!vus.has(d.empreinte) && d.corrigeLe === null) {
          d.corrigeLe = maintenant;
          d.historique.push({ t: maintenant, par, texte: `Corrigé : absent de l’analyse #${id}` });
          corriges++;
        }
      }
      analyse = {
        id,
        projet,
        branche: txt(meta.branche, 100) || 'main',
        commit: txt(meta.commit, 64),
        outils: [...new Set(trouvailles.map((t) => t.outil))],
        le: maintenant,
        par,
        total: vus.size,
        nouveaux,
        corriges,
        politique: nouveauxEleves.length
          ? {
              respectee: false,
              raison: `${nouveauxEleves.length} nouveau(x) défaut(s) d’impact élevé : ${nouveauxEleves
                .slice(0, 3)
                .map((d) => `CID ${d.cid}`)
                .join(', ')}`,
            }
          : { respectee: true, raison: 'Aucun nouveau défaut d’impact élevé' },
      };
      q.analyses.unshift(analyse);
      q.analyses = q.analyses.slice(0, MAX_ANALYSES);
    });
    this.stockage.ajouterEvenement({
      t: maintenant,
      type: 'info',
      titre: `Analyse de code #${analyse.id} (${projet})`,
      detail: `${analyse.nouveaux} nouveau(x), ${analyse.corriges} corrigé(s), ${analyse.total} présent(s) — ${analyse.politique.raison}`,
      statut: analyse.politique.respectee ? 'vert' : 'rouge',
    });
    return analyse;
  }

  private vue(d: Defaut): DefautVue {
    return { ...d, etat: etatDefaut(d, this.derniere(d.projet)?.id) };
  }

  lister(f: { projet?: string; etat?: string; impact?: string; categorie?: string; classification?: string; proprietaire?: string; q?: string }): DefautVue[] {
    const q = f.q?.toLowerCase();
    const ordre: Record<Impact, number> = { eleve: 0, moyen: 1, faible: 2 };
    return this.etat.defauts
      .filter((d) => !f.projet || d.projet === f.projet)
      .map((d) => this.vue(d))
      .filter((d) => (f.etat === 'tous' ? true : f.etat ? f.etat.split(',').includes(d.etat) : d.etat === 'nouveau' || d.etat === 'en-cours'))
      .filter((d) => !f.impact || d.impact === f.impact)
      .filter((d) => !f.categorie || d.categorie === f.categorie)
      .filter((d) => !f.classification || d.classification === f.classification)
      .filter((d) => !f.proprietaire || d.proprietaire === f.proprietaire)
      .filter((d) => !q || `${d.cid} ${d.regle} ${d.message} ${d.fichier} ${d.cwe ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => ordre[a.impact] - ordre[b.impact] || b.detecteLe - a.detecteLe)
      .slice(0, 1000);
  }

  trouver(cid: number): DefautVue {
    const d = this.etat.defauts.find((x) => x.cid === cid);
    if (!d) throw new ErreurMetier(`Défaut CID ${cid} introuvable`);
    return this.vue(d);
  }

  /** Tri d'un défaut (classification, action, gravité, propriétaire, commentaire), tracé. */
  trier(cid: number, champs: Record<string, unknown>, par: string): DefautVue {
    const d = this.etat.defauts.find((x) => x.cid === cid);
    if (!d) throw new ErreurMetier(`Défaut CID ${cid} introuvable`);
    const changements: string[] = [];
    const poser = <K extends 'classification' | 'action' | 'gravite'>(cle: K, valeurs: readonly Defaut[K][], libelles: Record<string, string>) => {
      const v = champs[cle];
      if (v === undefined || v === d[cle]) return;
      if (!valeurs.includes(v as Defaut[K])) throw new ErreurMetier(`${cle} inconnue`);
      changements.push(`${cle} : ${libelles[d[cle]]} → ${libelles[v as string]}`);
      d[cle] = v as Defaut[K];
    };
    const commentaire = txt(champs.commentaire, 2000).trim();
    if (champs.classification === 'faux-positif' || champs.classification === 'intentionnel') {
      if (!commentaire) throw new ErreurMetier('Expliquez pourquoi ce défaut est écarté (commentaire obligatoire)');
    }
    this.stockage.modifier(() => {
      poser('classification', CLASSIFICATIONS, LIBELLE_CLASSIFICATION);
      poser('action', ACTIONS, LIBELLE_ACTION);
      poser('gravite', GRAVITES, LIBELLE_GRAVITE);
      if (champs.proprietaire !== undefined) {
        const p = txt(champs.proprietaire, 80).trim() || null;
        if (p !== d.proprietaire) changements.push(`propriétaire : ${d.proprietaire ?? '—'} → ${p ?? '—'}`);
        d.proprietaire = p;
      }
      if (changements.length || commentaire) d.historique.push({ t: Date.now(), par, texte: [...changements, commentaire && `« ${commentaire} »`].filter(Boolean).join(' · ') });
    });
    return this.vue(d);
  }

  /** Ouvre un problème pour corriger le défaut, et les relie. */
  creerTicket(cid: number, par: string): DefautVue {
    const d = this.etat.defauts.find((x) => x.cid === cid);
    if (!d) throw new ErreurMetier(`Défaut CID ${cid} introuvable`);
    if (d.ticket) throw new ErreurMetier(`Déjà relié à ${d.ticket}`);
    const t = this.tickets.creer(
      'probleme',
      {
        titre: `CID ${d.cid} — ${d.titreRegle}`.slice(0, 200),
        description: `${d.message}\n\nFichier : ${d.fichier}${d.ligne ? `:${d.ligne}` : ''}\nRègle : ${d.regle} (${d.outil})${d.cwe ? `\n${d.cwe}` : ''}\nImpact : ${d.impact}`,
        impact: d.impact === 'eleve' ? 1 : d.impact === 'moyen' ? 2 : 3,
        urgence: 3,
        categorie: d.categorie === 'Sécurité' ? 'Sécurité' : 'Application',
        ci: d.projet,
        groupe: 'Développement',
        assigneA: d.proprietaire,
      },
      par,
    );
    this.stockage.modifier(() => {
      d.ticket = t.numero;
      if (d.classification === 'non-classe') d.classification = 'bug';
      if (d.action === 'non-definie') d.action = 'a-corriger';
      d.historique.push({ t: Date.now(), par, texte: `Problème ${t.numero} ouvert` });
    });
    return this.vue(d);
  }

  synthese(projet?: string): VueQualite {
    const projets = [...new Set(this.etat.analyses.map((a) => a.projet))];
    const p = projet ?? projets[0];
    const defauts = this.etat.defauts.filter((d) => d.projet === p).map((d) => this.vue(d));
    const actifs = defauts.filter((d) => d.etat === 'nouveau' || d.etat === 'en-cours');
    const top = (cle: (d: DefautVue) => string | null) => {
      const n = new Map<string, number>();
      for (const d of actifs) {
        const k = cle(d);
        if (k) n.set(k, (n.get(k) ?? 0) + 1);
      }
      return [...n.entries()]
        .map(([nom, valeur]) => ({ nom, valeur }))
        .sort((a, b) => b.valeur - a.valeur)
        .slice(0, 8);
    };
    return {
      projets,
      analyses: this.etat.analyses.filter((a) => a.projet === p).slice(0, 30),
      aTraiter: {
        eleve: actifs.filter((d) => d.impact === 'eleve').length,
        moyen: actifs.filter((d) => d.impact === 'moyen').length,
        faible: actifs.filter((d) => d.impact === 'faible').length,
      },
      nonClasses: actifs.filter((d) => d.classification === 'non-classe').length,
      corriges30j: defauts.filter((d) => d.corrigeLe !== null && d.corrigeLe > Date.now() - 30 * 86_400_000).length,
      parCategorie: top((d) => d.categorie),
      parFichier: top((d) => d.fichier),
      parCwe: top((d) => d.cwe),
    };
  }
}
