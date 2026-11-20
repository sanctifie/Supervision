import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Stockage } from './stockage';
import { ErreurMetier } from './erreurs';
import { SERVICES_OFFICINA } from './fournisseurs/demo';
import { estTermine, prochaineExecution, type Frequence, type ModeleTache, type Planning, type Travail } from '../../shared/taches';

/**
 * Tâches automatisées façon AWX. Un modèle de tâche pointe vers un script du
 * dossier des scripts (monté en lecture seule) : l'application ne lance
 * jamais autre chose, sans shell, et un paramètre ne peut prendre qu'une
 * valeur prévue. Les modèles sensibles demandent l'accord d'un approbateur.
 */

export interface EtatTaches {
  modeles: ModeleTache[];
  plannings: Planning[];
  travaux: Travail[];
  initialises?: boolean;
  /** Scripts des modèles de départ déjà proposés (un modèle supprimé ne revient pas). */
  proposes?: string[];
}

export const TACHES_VIDE: EtatTaches = { modeles: [], plannings: [], travaux: [] };

const MAX_SORTIE = 200_000;
const MAX_TRAVAUX = 300;
const EN_PARALLELE = 2;

const DEPART: Omit<ModeleTache, 'id'>[] = [
  {
    nom: 'Vérifier les services (/health)',
    description: 'Interroge le /health de chaque service d’Officina et dit lesquels ne répondent pas. Sans risque.',
    script: 'verifier-services.mjs',
    arguments: [],
    parametre: null,
    approbation: false,
    delaiMinutes: 5,
    actif: true,
  },
  {
    nom: 'Sauvegarder maintenant',
    description: 'Lance deploy/backup.sh d’Officina (dump PostgreSQL, volumes, envoi hors site).',
    script: 'sauvegarder.sh',
    arguments: [],
    parametre: null,
    approbation: false,
    delaiMinutes: 60,
    actif: true,
  },
  {
    nom: 'Redémarrer un service',
    description: 'Redémarre un conteneur d’Officina. Coupe le service quelques secondes : approbation requise.',
    script: 'redemarrer-service.sh',
    arguments: [],
    parametre: { nom: 'service', libelle: 'Service', choix: [...SERVICES_OFFICINA] },
    approbation: true,
    delaiMinutes: 5,
    actif: true,
  },
  {
    nom: 'Tester la restauration',
    description:
      'Restaure la dernière sauvegarde PostgreSQL dans une base jetable (conteneur supprimé ensuite) et compte les lignes des plus grosses tables. Ne touche pas à la production.',
    script: 'tester-restauration.sh',
    arguments: [],
    parametre: null,
    approbation: false,
    delaiMinutes: 60,
    actif: true,
  },
  {
    nom: 'Nettoyer Docker',
    description: 'Supprime les images et le cache de construction inutilisés pour libérer le disque.',
    script: 'nettoyer-docker.sh',
    arguments: [],
    parametre: null,
    approbation: true,
    delaiMinutes: 30,
    actif: true,
  },
];

const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export interface EffetsTaches {
  mode: () => 'reel' | 'demo';
  fuseau: string;
  dossierScripts: string;
  prevenir: (qui: 'agents' | 'approbateurs', n: { titre: string; texte: string; lien: string }, sauf?: string) => void;
}

export class Taches {
  private readonly enCours = new Map<number, ChildProcess | NodeJS.Timeout>();

  constructor(
    private readonly stockage: Stockage,
    private readonly effets: EffetsTaches,
  ) {
    this.stockage.modifier((e) => {
      if (!e.taches.initialises) {
        e.taches.modeles = DEPART.map((m) => ({ ...m, id: randomUUID() }));
        e.taches.initialises = true;
      }
      // Modèles ajoutés depuis : proposés une fois aux installations existantes.
      e.taches.proposes ??= DEPART.map((m) => m.script).filter((s) => s !== 'tester-restauration.sh');
      for (const m of DEPART)
        if (!e.taches.proposes.includes(m.script)) {
          e.taches.proposes.push(m.script);
          if (!e.taches.modeles.some((x) => x.script === m.script)) e.taches.modeles.push({ ...m, id: randomUUID() });
        }
      // Un redémarrage de l'application interrompt les tâches en cours.
      for (const t of e.taches.travaux)
        if (t.statut === 'en-cours' || t.statut === 'attente') {
          t.statut = 'echoue';
          t.fin = Date.now();
          t.sortie += '\n[supervision] Interrompu : l’application a redémarré.\n';
        }
    });
  }

  private get etat(): EtatTaches {
    return this.stockage.donnees.taches;
  }

  // --- Modèles ---------------------------------------------------------------

  modeles(): (ModeleTache & { scriptPresent: boolean; dernier: Travail | null })[] {
    return this.etat.modeles.map((m) => ({ ...m, scriptPresent: !!this.cheminScript(m.script), dernier: this.etat.travaux.find((t) => t.modeleId === m.id) ?? null }));
  }

  private modele(id: string): ModeleTache {
    const m = this.etat.modeles.find((x) => x.id === id);
    if (!m) throw new ErreurMetier('Modèle de tâche introuvable');
    return m;
  }

  /** Le script, s'il existe bien DANS le dossier des scripts (liens symboliques compris). */
  private cheminScript(script: string): string | null {
    try {
      const racine = fs.realpathSync(this.effets.dossierScripts);
      const chemin = fs.realpathSync(path.resolve(racine, script));
      return chemin.startsWith(racine + path.sep) && fs.statSync(chemin).isFile() ? chemin : null;
    } catch {
      return null;
    }
  }

  private valider(d: Record<string, unknown>): Omit<ModeleTache, 'id'> {
    const nom = texte(d.nom, 100);
    if (!nom) throw new ErreurMetier('Le nom est obligatoire');
    const script = texte(d.script, 200);
    if (!/^[\w./-]+$/.test(script) || script.split('/').includes('..') || script.startsWith('/'))
      throw new ErreurMetier('Script : un chemin relatif au dossier des scripts (lettres, chiffres, - _ . /)');
    const args = Array.isArray(d.arguments)
      ? d.arguments
          .map((a) => texte(a, 200))
          .filter(Boolean)
          .slice(0, 20)
      : [];
    let parametre: ModeleTache['parametre'] = null;
    const p = d.parametre as Record<string, unknown> | null | undefined;
    if (p && texte(p.nom, 40)) {
      const choix = Array.isArray(p.choix) ? [...new Set(p.choix.map((c) => texte(c, 100)).filter(Boolean))].slice(0, 100) : [];
      if (!choix.length) throw new ErreurMetier('Paramètre : donnez au moins un choix');
      parametre = { nom: texte(p.nom, 40), libelle: texte(p.libelle, 80) || texte(p.nom, 40), choix };
    }
    const delai = Number(d.delaiMinutes);
    return {
      nom,
      description: texte(d.description, 1000),
      script,
      arguments: args,
      parametre,
      approbation: !!d.approbation,
      delaiMinutes: Number.isFinite(delai) ? Math.min(240, Math.max(1, Math.round(delai))) : 15,
      actif: d.actif === undefined ? true : !!d.actif,
    };
  }

  creerModele(d: Record<string, unknown>): ModeleTache {
    const m = { ...this.valider(d), id: randomUUID() };
    this.stockage.modifier((e) => e.taches.modeles.push(m));
    return m;
  }

  modifierModele(id: string, d: Record<string, unknown>): ModeleTache {
    const m = this.modele(id);
    const v = this.valider({ ...m, ...d });
    this.stockage.modifier(() => Object.assign(m, v));
    return m;
  }

  supprimerModele(id: string): void {
    this.modele(id);
    this.stockage.modifier((e) => {
      e.taches.modeles = e.taches.modeles.filter((m) => m.id !== id);
      e.taches.plannings = e.taches.plannings.filter((p) => p.modeleId !== id);
    });
  }

  // --- Travaux -----------------------------------------------------------------

  travaux(modeleId?: string): Omit<Travail, 'sortie'>[] {
    return this.etat.travaux
      .filter((t) => !modeleId || t.modeleId === modeleId)
      .slice(0, 100)
      .map(({ sortie: _s, ...t }) => t);
  }

  travail(id: number): Travail {
    const t = this.etat.travaux.find((x) => x.id === id);
    if (!t) throw new ErreurMetier(`Tâche #${id} introuvable`);
    return t;
  }

  /** Lance un modèle (ou le met en attente d'approbation). */
  lancer(modeleId: string, valeur: unknown, par: string, planifie = false): Travail {
    const m = this.modele(modeleId);
    if (!m.actif) throw new ErreurMetier('Ce modèle est désactivé');
    let v: string | null = null;
    if (m.parametre) {
      v = texte(valeur, 100);
      if (!m.parametre.choix.includes(v)) throw new ErreurMetier(`${m.parametre.libelle} : choisissez une valeur de la liste`);
    }
    const t: Travail = {
      id: (this.etat.travaux[0]?.id ?? 0) + 1,
      modeleId: m.id,
      nom: m.nom,
      valeur: v,
      statut: m.approbation && !planifie ? 'approbation' : 'attente',
      lancePar: par,
      approuvePar: null,
      planifie,
      creeLe: Date.now(),
      debut: null,
      fin: null,
      code: null,
      sortie: '',
      simule: false,
    };
    this.stockage.modifier((e) => {
      e.taches.travaux.unshift(t);
      e.taches.travaux = e.taches.travaux.slice(0, MAX_TRAVAUX);
    });
    if (t.statut === 'approbation') {
      this.effets.prevenir('approbateurs', { titre: `Tâche à approuver : ${m.nom}`, texte: `#${t.id}${v ? ` (${v})` : ''} — demandée par ${par}.`, lien: `/taches/${t.id}` }, par);
    }
    this.suivant();
    return t;
  }

  decider(id: number, accepte: boolean, par: string): Travail {
    const t = this.travail(id);
    if (t.statut !== 'approbation') throw new ErreurMetier('Cette tâche n’attend pas d’approbation');
    if (t.lancePar === par) throw new ErreurMetier('On n’approuve pas sa propre demande (séparation des tâches)');
    this.stockage.modifier(() => {
      t.approuvePar = par;
      t.statut = accepte ? 'attente' : 'refuse';
      if (!accepte) t.fin = Date.now();
      t.sortie += `[supervision] ${accepte ? 'Approuvée' : 'Refusée'} par ${par}.\n`;
    });
    this.suivant();
    return t;
  }

  annuler(id: number, par: string): Travail {
    const t = this.travail(id);
    if (estTermine(t.statut)) throw new ErreurMetier('Cette tâche est déjà terminée');
    const p = this.enCours.get(id);
    if (p && 'kill' in p) p.kill('SIGTERM');
    else if (p) clearTimeout(p);
    this.enCours.delete(id);
    this.terminer(t, 'annule', null, `\n[supervision] Annulée par ${par}.\n`);
    return t;
  }

  /** Démarre les tâches en file (2 à la fois, jamais deux fois le même modèle). */
  private suivant(): void {
    for (const t of [...this.etat.travaux].reverse()) {
      if (this.enCours.size >= EN_PARALLELE) return;
      if (t.statut !== 'attente') continue;
      if (this.etat.travaux.some((x) => x.statut === 'en-cours' && x.modeleId === t.modeleId)) continue;
      this.demarrer(t);
    }
  }

  private ecrire(t: Travail, morceau: string) {
    this.stockage.modifier(() => {
      if (t.sortie.length < MAX_SORTIE) t.sortie = (t.sortie + morceau).slice(0, MAX_SORTIE);
      if (t.sortie.length >= MAX_SORTIE && !t.sortie.endsWith('[tronqué]\n')) t.sortie += '\n[tronqué]\n';
    });
  }

  private demarrer(t: Travail): void {
    const m = this.etat.modeles.find((x) => x.id === t.modeleId);
    if (!m) return this.terminer(t, 'echoue', null, '[supervision] Modèle supprimé.\n');
    const chemin = this.cheminScript(m.script);
    this.stockage.modifier(() => {
      t.statut = 'en-cours';
      t.debut = Date.now();
    });
    const args = [...m.arguments, ...(t.valeur !== null ? [t.valeur] : [])];
    // Démonstration : l'officine est fictive, aucun script n'est lancé.
    if (this.effets.mode() === 'demo') return this.simuler(t, m, args);
    if (!chemin) return this.terminer(t, 'echoue', null, `[supervision] Script introuvable : ${m.script} (dossier ${this.effets.dossierScripts}).\n`);
    this.ecrire(t, `$ ${m.script}${args.length ? ` ${args.join(' ')}` : ''}\n`);
    const p = spawn(chemin, args, {
      cwd: path.dirname(chemin),
      // Environnement réduit : aucun secret de la supervision ne passe aux scripts.
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        HOME: '/tmp',
        LANG: 'C.UTF-8',
        ...Object.fromEntries(['PROMETHEUS_URL', 'OFFICINA_DIR', 'SAUVEGARDES_DIR'].filter((k) => process.env[k]).map((k) => [k, process.env[k] as string])),
        SUPERVISION_TACHE: String(t.id),
        SUPERVISION_PAR: t.approuvePar ?? t.lancePar,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.enCours.set(t.id, p);
    const minuterie = setTimeout(() => {
      this.ecrire(t, `\n[supervision] Délai de ${m.delaiMinutes} min dépassé : arrêt.\n`);
      p.kill('SIGKILL');
    }, m.delaiMinutes * 60_000);
    p.stdout?.on('data', (b: Buffer) => this.ecrire(t, b.toString('utf8')));
    p.stderr?.on('data', (b: Buffer) => this.ecrire(t, b.toString('utf8')));
    p.on('error', (e) => this.ecrire(t, `[supervision] ${e.message}\n`));
    p.on('close', (code) => {
      clearTimeout(minuterie);
      if (!this.enCours.delete(t.id)) return; // annulée entre-temps
      this.terminer(t, code === 0 ? 'reussi' : 'echoue', code, `\n[supervision] Code de sortie ${code ?? '—'}.\n`);
    });
  }

  /** Mode démonstration sans script : quelques lignes au fil de l'eau. */
  private simuler(t: Travail, m: ModeleTache, args: string[]) {
    const lignes = [
      '[démonstration] Officine fictive : exécution simulée, aucun script lancé.',
      `$ ${m.script}${args.length ? ` ${args.join(' ')}` : ''}`,
      'Préparation…',
      ...(m.script.includes('services')
        ? SERVICES_OFFICINA.map((s) => `${s.padEnd(12)} OK`)
        : ['Étape 1/3 : vérifications', 'Étape 2/3 : exécution', 'Étape 3/3 : contrôle du résultat']),
      'Terminé.',
    ];
    this.stockage.modifier(() => (t.simule = true));
    let i = 0;
    const pas = () => {
      if (i < lignes.length) {
        this.ecrire(t, `${lignes[i++]}\n`);
        this.enCours.set(t.id, setTimeout(pas, 700));
      } else {
        this.enCours.delete(t.id);
        this.terminer(t, 'reussi', 0, '\n[supervision] Code de sortie 0.\n');
      }
    };
    pas();
  }

  private terminer(t: Travail, statut: Travail['statut'], code: number | null, message: string) {
    this.ecrire(t, message);
    this.stockage.modifier(() => {
      t.statut = statut;
      t.code = code;
      t.fin = Date.now();
    });
    if (statut === 'reussi' || statut === 'echoue') {
      this.stockage.ajouterEvenement({
        t: Date.now(),
        type: statut === 'reussi' ? 'info' : 'alerte',
        titre: `Tâche « ${t.nom} » ${statut === 'reussi' ? 'réussie' : 'en échec'}`,
        detail: `#${t.id}${t.valeur ? ` (${t.valeur})` : ''} — ${t.planifie ? 'planifiée' : `lancée par ${t.lancePar}`}`,
        statut: statut === 'reussi' ? 'vert' : 'rouge',
      });
    }
    if (statut === 'echoue')
      this.effets.prevenir('agents', {
        titre: `⚠ Tâche en échec : ${t.nom}`,
        texte: `#${t.id}${t.valeur ? ` (${t.valeur})` : ''} — code ${code ?? '—'}.`,
        lien: `/taches/${t.id}`,
      });
    this.suivant();
  }

  // --- Plannings ---------------------------------------------------------------

  plannings(): Planning[] {
    return this.etat.plannings;
  }

  creerPlanning(d: Record<string, unknown>, par: string, peutApprouver: boolean): Planning {
    const m = this.modele(texte(d.modeleId, 60));
    // Un planning lance sans redemander l'accord : le poser vaut approbation.
    if (m.approbation && !peutApprouver) throw new ErreurMetier('Ce modèle demande une approbation : seul un approbateur peut le planifier');
    const frequence = d.frequence as Frequence;
    if (!['horaire', 'quotidien', 'hebdomadaire'].includes(frequence)) throw new ErreurMetier('Fréquence : horaire, quotidien ou hebdomadaire');
    const heure = texte(d.heure, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) throw new ErreurMetier('Heure : HH:MM');
    const jour = Number(d.jour ?? 1);
    if (!Number.isInteger(jour) || jour < 0 || jour > 6) throw new ErreurMetier('Jour invalide');
    const valeur = m.parametre ? texte(d.valeur, 100) : null;
    if (m.parametre && !m.parametre.choix.includes(valeur ?? '')) throw new ErreurMetier(`${m.parametre.libelle} : choisissez une valeur de la liste`);
    const p: Planning = { id: randomUUID(), modeleId: m.id, frequence, heure, jour, valeur, actif: true, creePar: par, prochain: 0 };
    p.prochain = prochaineExecution(p, Date.now(), this.effets.fuseau);
    this.stockage.modifier((e) => e.taches.plannings.push(p));
    return p;
  }

  basculerPlanning(id: string, actif: boolean): Planning {
    const p = this.etat.plannings.find((x) => x.id === id);
    if (!p) throw new ErreurMetier('Planning introuvable');
    this.stockage.modifier(() => {
      p.actif = actif;
      p.prochain = prochaineExecution(p, Date.now(), this.effets.fuseau);
    });
    return p;
  }

  supprimerPlanning(id: string): void {
    this.stockage.modifier((e) => (e.taches.plannings = e.taches.plannings.filter((p) => p.id !== id)));
  }

  /** Appelé par la boucle de fond : lance les plannings arrivés à échéance (pré-approuvés par leur créateur). */
  echeances(maintenant = Date.now()): void {
    for (const p of this.etat.plannings) {
      if (!p.actif || p.prochain > maintenant) continue;
      this.stockage.modifier(() => (p.prochain = prochaineExecution(p, maintenant, this.effets.fuseau)));
      try {
        this.lancer(p.modeleId, p.valeur, `Planning (${p.creePar})`, true);
      } catch (e) {
        console.error('[taches] planning :', (e as Error).message);
      }
    }
  }
}
