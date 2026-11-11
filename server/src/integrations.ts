import { config } from './config';
import { ErreurMetier } from './erreurs';
import type { Stockage } from './stockage';
import { OUTILS, type ElementExterne, type LectureConnecteur, type Outil, type VueConnecteur } from '../../shared/integrations';

/**
 * Connecteurs vers les outils externes (Jira, GitLab, SonarQube, AWX, Zabbix,
 * Grafana, Control-M). Lecture seule, par l'API publique de chaque outil.
 * Le jeton reste sur le serveur : il n'est jamais renvoyé à l'interface.
 */

export interface ConnecteurStocke {
  url: string;
  identifiant: string;
  // shortcut: jeton en clair dans donnees/etat.json (comme le reste de l'état) ; à chiffrer si le dossier de données est partagé ou sauvegardé hors du serveur.
  jeton: string;
  actif: boolean;
}

type Entetes = Record<string, string>;
type Lecteur = (c: ConnecteurStocke) => Promise<ElementExterne[]>;
/* eslint-disable @typescript-eslint/no-explicit-any -- réponses d'API tierces */
type Json = any;

async function lire(url: string, entetes: Entetes, corps?: unknown): Promise<Json> {
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), config.delaiRequeteMs);
  try {
    const reponse = await fetch(url, {
      method: corps === undefined ? 'GET' : 'POST',
      headers: { accept: 'application/json', ...(corps === undefined ? {} : { 'content-type': 'application/json' }), ...entetes },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      signal: controle.signal,
      // Le jeton ne suit jamais une redirection vers une autre adresse.
      redirect: 'error',
    });
    if (!reponse.ok)
      throw new Error(
        reponse.status === 401 || reponse.status === 403 ? `Accès refusé (${reponse.status}) : vérifiez le jeton et ses droits` : `Réponse ${reponse.status} de l’outil`,
      );
    return await reponse.json();
  } catch (e) {
    const message = (e as Error).message || '';
    if ((e as Error).name === 'AbortError' || /abort/i.test(message)) throw new Error(`Pas de réponse en ${Math.round(config.delaiRequeteMs / 1000)} s`);
    if (/fetch failed|redirect/i.test(message)) throw new Error('Outil injoignable à cette adresse (ou redirection refusée)');
    if (e instanceof SyntaxError) throw new Error('Réponse illisible : l’adresse est-elle bien celle de l’API ?');
    throw e;
  } finally {
    clearTimeout(minuterie);
  }
}

const base64 = (s: string) => Buffer.from(s).toString('base64');
const date = (v: unknown): number | null => {
  const t = typeof v === 'string' || typeof v === 'number' ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};
/** Un lien venu d'un outil n'est gardé que s'il est en http(s). */
function lien(href: string, baseUrl: string): string | null {
  try {
    const u = new URL(href, `${baseUrl}/`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
const texte = (v: unknown, defaut = ''): string => (v === null || v === undefined ? defaut : String(v).slice(0, 300));

const GRAVITE_ZABBIX = ['Non classé', 'Information', 'Avertissement', 'Moyen', 'Haut', 'Désastre'];

export const LECTEURS: Record<Outil, Lecteur> = {
  async jira(c) {
    const nuage = !!c.identifiant;
    const entetes = { authorization: nuage ? `Basic ${base64(`${c.identifiant}:${c.jeton}`)}` : `Bearer ${c.jeton}` };
    const requete = `jql=${encodeURIComponent('updated >= -30d ORDER BY updated DESC')}&maxResults=100&fields=summary,status,assignee,priority,updated`;
    const r = await lire(`${c.url}${nuage ? '/rest/api/3/search/jql' : '/rest/api/2/search'}?${requete}`, entetes);
    return (r.issues ?? []).map((i: Json): ElementExterne => {
      const fini = i.fields?.status?.statusCategory?.key === 'done';
      return {
        id: texte(i.key),
        titre: `${texte(i.key)} · ${texte(i.fields?.summary)}`,
        detail: texte(i.fields?.assignee?.displayName, 'Non assigné'),
        etat: texte(i.fields?.status?.name, '—'),
        statut: fini ? 'vert' : /^(highest|blocker|critical)$/i.test(texte(i.fields?.priority?.name)) ? 'rouge' : 'bleu',
        lien: lien(`browse/${encodeURIComponent(texte(i.key))}`, c.url),
        le: date(i.fields?.updated),
      };
    });
  },

  async gitlab(c) {
    const entetes = { 'private-token': c.jeton };
    const projets: Json[] = await lire(`${c.url}/api/v4/projects?membership=true&order_by=last_activity_at&per_page=20&simple=true`, entetes);
    return Promise.all(
      projets.map(async (p): Promise<ElementExterne> => {
        const pipelines: Json[] = await lire(`${c.url}/api/v4/projects/${encodeURIComponent(p.id)}/pipelines?per_page=1`, entetes).catch(() => []);
        const pl = pipelines[0];
        const etat = texte(pl?.status, 'aucun pipeline');
        return {
          id: texte(p.id),
          titre: texte(p.path_with_namespace ?? p.name),
          detail: pl ? `Pipeline #${texte(pl.id)} sur ${texte(pl.ref)}` : '',
          etat,
          statut: etat === 'success' ? 'vert' : etat === 'failed' ? 'rouge' : pl && !/canceled|skipped|manual/.test(etat) ? 'bleu' : 'inconnu',
          lien: lien(texte(pl?.web_url ?? p.web_url), c.url),
          le: date(pl?.updated_at ?? p.last_activity_at),
        };
      }),
    );
  },

  async sonarqube(c) {
    const entetes = { authorization: `Basic ${base64(`${c.jeton}:`)}` };
    const projets: Json[] = (await lire(`${c.url}/api/components/search_projects?ps=100&f=analysisDate`, entetes)).components ?? [];
    if (!projets.length) return [];
    const cles = projets.map((p) => encodeURIComponent(p.key)).join(',');
    const mesures: Json[] = (await lire(`${c.url}/api/measures/search?projectKeys=${cles}&metricKeys=alert_status,bugs,vulnerabilities,coverage`, entetes)).measures ?? [];
    const de = (cle: string, metrique: string) => mesures.find((m) => m.component === cle && m.metric === metrique)?.value;
    return projets.map((p): ElementExterne => {
      const porte = texte(de(p.key, 'alert_status'), 'NONE');
      const couverture = de(p.key, 'coverage');
      return {
        id: texte(p.key),
        titre: texte(p.name ?? p.key),
        detail: `${texte(de(p.key, 'bugs'), '0')} bug(s) · ${texte(de(p.key, 'vulnerabilities'), '0')} vulnérabilité(s)${couverture === undefined ? '' : ` · couverture ${texte(couverture)} %`}`,
        etat: porte === 'OK' ? 'Porte qualité passée' : porte === 'ERROR' ? 'Porte qualité en échec' : porte === 'WARN' ? 'Porte qualité : avertissement' : 'Jamais analysé',
        statut: porte === 'OK' ? 'vert' : porte === 'ERROR' ? 'rouge' : porte === 'WARN' ? 'orange' : 'inconnu',
        lien: lien(`dashboard?id=${encodeURIComponent(p.key)}`, c.url),
        le: date(p.analysisDate),
      };
    });
  },

  async awx(c) {
    const r = await lire(`${c.url}/api/v2/jobs/?order_by=-id&page_size=100`, { authorization: `Bearer ${c.jeton}` });
    return (r.results ?? []).map((j: Json): ElementExterne => {
      const etat = texte(j.status, '—');
      return {
        id: texte(j.id),
        titre: texte(j.name, `Job ${texte(j.id)}`),
        detail: [j.playbook, j.summary_fields?.inventory?.name]
          .filter(Boolean)
          .map((x) => texte(x))
          .join(' · '),
        etat,
        statut: etat === 'successful' ? 'vert' : etat === 'failed' || etat === 'error' ? 'rouge' : etat === 'canceled' ? 'inconnu' : 'bleu',
        lien: lien(`#/jobs/playbook/${encodeURIComponent(texte(j.id))}/output`, c.url),
        le: date(j.finished ?? j.started ?? j.created),
      };
    });
  },

  async zabbix(c) {
    const r = await lire(
      `${c.url}/api_jsonrpc.php`,
      { authorization: `Bearer ${c.jeton}` },
      {
        jsonrpc: '2.0',
        method: 'problem.get',
        params: { output: ['eventid', 'objectid', 'name', 'severity', 'clock', 'acknowledged'], sortfield: ['eventid'], sortorder: 'DESC', limit: 100 },
        id: 1,
      },
    );
    if (r.error) throw new Error(`Zabbix : ${texte(r.error.data ?? r.error.message)}`);
    return (r.result ?? []).map((p: Json): ElementExterne => {
      const gravite = Number(p.severity) || 0;
      return {
        id: texte(p.eventid),
        titre: texte(p.name),
        detail: p.acknowledged === '1' ? 'Acquitté' : 'Non acquitté',
        etat: GRAVITE_ZABBIX[gravite] ?? GRAVITE_ZABBIX[0],
        statut: gravite >= 4 ? 'rouge' : gravite >= 2 ? 'orange' : 'inconnu',
        lien: lien(`tr_events.php?triggerid=${encodeURIComponent(texte(p.objectid))}&eventid=${encodeURIComponent(texte(p.eventid))}`, c.url),
        le: date(Number(p.clock) * 1000),
      };
    });
  },

  async grafana(c) {
    const r: Json[] = await lire(`${c.url}/api/search?type=dash-db&limit=100`, { authorization: `Bearer ${c.jeton}` });
    return r.map((d): ElementExterne => ({
      id: texte(d.uid),
      titre: texte(d.title),
      detail: Array.isArray(d.tags) ? d.tags.map((x: unknown) => texte(x)).join(', ') : '',
      etat: texte(d.folderTitle, 'Général'),
      statut: 'inconnu',
      lien: lien(texte(d.url), c.url),
      le: null,
    }));
  },

  async controlm(c) {
    const api = /\/automation-api$/.test(c.url) ? c.url : `${c.url}/automation-api`;
    const r = await lire(`${api}/run/jobs/status?limit=100`, { 'x-api-key': c.jeton });
    return (r.statuses ?? []).map((j: Json): ElementExterne => {
      const etat = texte(j.status, '—');
      // Control-M date ses jobs en AAAAMMJJHHMMSS.
      const h = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/.exec(texte(j.endTime || j.startTime));
      return {
        id: texte(j.jobId),
        titre: texte(j.name, texte(j.jobId)),
        detail: [j.folder, j.application, j.host]
          .filter(Boolean)
          .map((x) => texte(x))
          .join(' · '),
        etat,
        statut: etat === 'Ended OK' ? 'vert' : etat === 'Ended Not OK' ? 'rouge' : etat === 'Executing' ? 'bleu' : 'inconnu',
        lien: null,
        le: h ? new Date(+h[1], +h[2] - 1, +h[3], +h[4], +h[5], +h[6]).getTime() : null,
      };
    });
  },
};

const CLES = new Set<string>(OUTILS.map((o) => o.cle));
const DUREE_CACHE_MS = 60_000;

export class Integrations {
  private cache = new Map<Outil, { expire: number; valeur: Promise<LectureConnecteur> }>();

  constructor(private readonly stockage: Stockage) {}

  private outil(cle: string): Outil {
    if (!CLES.has(cle)) throw new ErreurMetier(`Outil ${cle} introuvable`);
    return cle as Outil;
  }

  private vue(cle: Outil): VueConnecteur {
    const c = this.stockage.donnees.integrations?.[cle];
    return { ...OUTILS.find((o) => o.cle === cle)!, configure: !!c, url: c?.url ?? '', identifiant: c?.identifiant ?? '', actif: c?.actif ?? false };
  }

  lister(): VueConnecteur[] {
    return OUTILS.map((o) => this.vue(o.cle));
  }

  /** Jeton vide : on garde celui déjà enregistré (modifier l'adresse sans le ressaisir). */
  configurer(cleBrute: string, corps: { url?: unknown; identifiant?: unknown; jeton?: unknown; actif?: unknown }, par: string): VueConnecteur {
    const cle = this.outil(cleBrute);
    const ancien = this.stockage.donnees.integrations?.[cle];
    let adresse: URL;
    try {
      adresse = new URL(String(corps.url ?? '').trim());
    } catch {
      throw new ErreurMetier('Adresse invalide (exemple : https://outil.exemple.fr)');
    }
    if (adresse.protocol !== 'http:' && adresse.protocol !== 'https:') throw new ErreurMetier('L’adresse doit commencer par http:// ou https://');
    if (adresse.username || adresse.password || adresse.search || adresse.hash) throw new ErreurMetier('L’adresse ne doit contenir ni identifiants, ni paramètres');
    const url = `${adresse.origin}${adresse.pathname}`.replace(/\/+$/, '');
    const jeton = String(corps.jeton ?? '').trim() || (ancien && ancien.url === url ? ancien.jeton : '');
    // Changer d'adresse oblige à ressaisir le jeton : il ne part pas vers un autre serveur à l'insu de celui qui l'a saisi.
    if (!jeton) throw new ErreurMetier(ancien ? 'L’adresse change : ressaisissez le jeton' : 'Jeton obligatoire');
    if (jeton.length > 4000 || /[\r\n]/.test(jeton)) throw new ErreurMetier('Jeton invalide');
    const identifiant = String(corps.identifiant ?? '').trim();
    if (identifiant.length > 200 || /[\r\n:]/.test(identifiant)) throw new ErreurMetier('Identifiant invalide');
    this.stockage.modifier((e) => {
      e.integrations = { ...e.integrations, [cle]: { url, identifiant, jeton, actif: corps.actif !== false } };
    });
    this.cache.delete(cle);
    this.stockage.ajouterEvenement({
      t: Date.now(),
      type: 'info',
      titre: `Connecteur ${this.vue(cle).nom} ${ancien ? 'modifié' : 'configuré'}`,
      detail: `Par ${par} · ${url}`,
      statut: 'vert',
    });
    return this.vue(cle);
  }

  supprimer(cleBrute: string, par: string): void {
    const cle = this.outil(cleBrute);
    if (!this.stockage.donnees.integrations?.[cle]) return;
    this.stockage.modifier((e) => {
      delete e.integrations?.[cle];
    });
    this.cache.delete(cle);
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: `Connecteur ${this.vue(cle).nom} supprimé`, detail: `Par ${par}`, statut: 'orange' });
  }

  /** Les éléments lus dans l'outil ; une panne de l'outil devient un message, pas une exception. */
  lire(cleBrute: string, forcer = false): Promise<LectureConnecteur> {
    const cle = this.outil(cleBrute);
    const c = this.stockage.donnees.integrations?.[cle];
    if (!c) throw new ErreurMetier('Connecteur non configuré');
    if (!c.actif) return Promise.resolve({ elements: [], erreur: 'Connecteur en pause', luLe: Date.now() });
    const present = this.cache.get(cle);
    if (present && !forcer && present.expire > Date.now()) return present.valeur;
    const valeur = LECTEURS[cle](c).then(
      (elements): LectureConnecteur => ({ elements, erreur: null, luLe: Date.now() }),
      (e): LectureConnecteur => ({ elements: [], erreur: (e as Error).message || 'Lecture impossible', luLe: Date.now() }),
    );
    this.cache.set(cle, { expire: Date.now() + DUREE_CACHE_MS, valeur });
    return valeur;
  }
}
