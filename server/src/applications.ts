import { identifiantDe, type Application } from '../../shared/applications';
import { ErreurMetier } from './erreurs';
import type { Stockage } from './stockage';

const MAX_APPLICATIONS = 50;
const MAX_SERVICES = 200;
/** Lettres, chiffres, espace et . _ ( ) / - : couvre « comptoir (postes) » comme « api-gateway ». */
const NOM_SERVICE = /^[\p{L}\p{N}][\p{L}\p{N} ._()/-]{0,59}$/u;

/** L'application posée au premier démarrage : celle pour laquelle l'outil a été écrit. */
export const OFFICINA = {
  nom: 'Officina',
  description: 'Logiciel de gestion de l’officine (caisse, stock, paiements, comptabilité).',
  projet: 'officina',
  services: [
    'gateway',
    'identity',
    'catalog',
    'inventory',
    'syncd',
    'sales',
    'regulatory',
    'purchasing',
    'insurance',
    'billing',
    'ledger',
    'payments',
    'notify',
    'hr',
    'documents',
    'postgres',
    'redis',
    'nats',
    'caddy',
    'serveur',
    'comptoir (postes)',
    'supervision',
  ],
};

/** Les applications déclarées, et ce qui les relie aux éléments (CI) et aux projets Docker Compose. */
export class Applications {
  constructor(private readonly stockage: Stockage) {
    const e = stockage.donnees;
    if (!e.applicationsInitialisees && !e.applications.length) this.creer(OFFICINA, 'supervision');
    stockage.modifier((x) => {
      x.applicationsInitialisees = true;
    });
  }

  lister(): Application[] {
    return this.stockage.donnees.applications;
  }

  trouver(id: string): Application | undefined {
    return this.lister().find((a) => a.id === id);
  }

  /** L'application qui possède cet élément. */
  deCi(ci: string | null | undefined): Application | undefined {
    return ci ? this.lister().find((a) => a.services.includes(ci)) : undefined;
  }

  deProjet(projet: string | null | undefined): Application | undefined {
    return projet ? this.lister().find((a) => a.projet === projet) : undefined;
  }

  /** Tous les éléments déclarés, toutes applications confondues. */
  services(): string[] {
    return this.lister().flatMap((a) => a.services);
  }

  private valider(champs: Record<string, unknown>, base?: Application) {
    const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const v = { ...(base ?? {}), ...champs } as Record<string, unknown>;
    const nom = texte(v.nom, 60);
    if (!nom) throw new ErreurMetier('Donnez un nom à l’application');
    const brut = Array.isArray(v.services) ? v.services : typeof v.services === 'string' ? v.services.split(/[\n,;]+/) : [];
    const services = [...new Set(brut.map((s) => texte(s, 60)).filter(Boolean))];
    const invalide = services.find((s) => !NOM_SERVICE.test(s));
    if (invalide) throw new ErreurMetier(`Nom d’élément invalide : « ${invalide} »`);
    if (services.length > MAX_SERVICES) throw new ErreurMetier(`${MAX_SERVICES} éléments au plus par application`);
    const projet = texte(v.projet, 60) || null;
    for (const autre of this.lister().filter((a) => a.id !== base?.id)) {
      const pris = services.find((s) => autre.services.includes(s));
      if (pris) throw new ErreurMetier(`L’élément « ${pris} » appartient déjà à l’application ${autre.nom}`);
      if (projet && autre.projet === projet) throw new ErreurMetier(`Le projet « ${projet} » est déjà celui de l’application ${autre.nom}`);
    }
    return { nom, description: texte(v.description, 500), projet, services };
  }

  creer(champs: Record<string, unknown>, auteur: string): Application {
    if (this.lister().length >= MAX_APPLICATIONS) throw new ErreurMetier(`${MAX_APPLICATIONS} applications au plus`);
    const v = this.valider(champs);
    let id = identifiantDe(v.nom);
    for (let n = 2; this.trouver(id); n++) id = `${identifiantDe(v.nom).slice(0, 36)}-${n}`;
    const a: Application = { id, ...v, creeLe: Date.now(), par: auteur };
    this.stockage.modifier((e) => e.applications.push(a));
    this.rattacher();
    return a;
  }

  modifier(id: string, champs: Record<string, unknown>): Application {
    const a = this.trouver(id);
    if (!a) throw new ErreurMetier(`Application ${id} introuvable`);
    const v = this.valider(champs, a);
    this.stockage.modifier(() => Object.assign(a, v));
    this.rattacher();
    return a;
  }

  /** Les tickets de l'application restent, mais n'y sont plus rattachés. */
  supprimer(id: string): void {
    this.stockage.modifier((e) => {
      e.applications = e.applications.filter((a) => a.id !== id);
      for (const t of e.tickets) if (t.application === id) t.application = null;
    });
  }

  /** Rattache les tickets sans application dont l'élément est déclaré (anciens tickets, nouvel élément). */
  rattacher(): void {
    const a_rattacher = this.stockage.donnees.tickets.filter((t) => !t.application && this.deCi(t.ci));
    if (!a_rattacher.length) return;
    this.stockage.modifier(() => {
      for (const t of a_rattacher) t.application = this.deCi(t.ci)?.id ?? null;
    });
  }
}
