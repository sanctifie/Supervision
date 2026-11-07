import { config } from '../../config';
import { lireJson } from '../../fournisseurs/clients';
import type { LectureSignal, LigneSignal } from '../../../../shared/outils';
import type { SourceSignal } from './signal';

/**
 * Jira : les tickets ouverts du projet (lecture), la création d'un ticket
 * Jira depuis un incident ou un problème, et le retour de son statut.
 * Cloud (JIRA_EMAIL renseigné) : API v3, jeton en Basic. Server / Data
 * Center (JIRA_EMAIL vide) : API v2, jeton d'accès personnel en Bearer.
 */

interface IssueJira {
  key: string;
  fields: {
    summary?: string;
    status?: { name: string; statusCategory?: { key: string } };
    priority?: { name: string } | null;
    issuetype?: { name: string };
    assignee?: { displayName: string } | null;
    updated?: string;
    labels?: string[];
  };
}

const cloud = () => !!config.jiraEmail;
const api = () => `${config.jiraUrl}/rest/api/${cloud() ? 3 : 2}`;
const entetes = () => ({
  authorization: cloud() ? `Basic ${Buffer.from(`${config.jiraEmail}:${config.jiraJeton}`).toString('base64')}` : `Bearer ${config.jiraJeton}`,
  accept: 'application/json',
});
export const configureJira = () => !!(config.jiraUrl && config.jiraJeton && config.jiraProjet);
export const lienJira = (cle: string) => `${config.jiraUrl}/browse/${cle}`;

async function chercher(jql: string, champs: string, max = 50): Promise<IssueJira[]> {
  // Cloud a retiré /search au profit de /search/jql (2025) ; Server garde /search.
  const chemin = cloud() ? '/search/jql' : '/search';
  const r = await lireJson<{ issues: IssueJira[] }>(`${api()}${chemin}?jql=${encodeURIComponent(jql)}&fields=${champs}&maxResults=${max}`, { headers: entetes() });
  return r.issues ?? [];
}

const PRIORITAIRE = /highest|high|critical|blocker|bloquant|critique|tr[eè]s haute|haute|urgent/i;

export function lectureJira(issues: IssueJira[], lien: string | null): LectureSignal {
  const enCours = issues.filter((i) => i.fields.status?.statusCategory?.key === 'indeterminate').length;
  const prioritaires = issues.filter((i) => PRIORITAIRE.test(i.fields.priority?.name ?? ''));
  const supervision = issues.filter((i) => i.fields.labels?.includes('supervision')).length;
  const lignes: LigneSignal[] = issues.slice(0, 20).map((i) => ({
    libelle: `${i.key} ${i.fields.summary ?? ''}`.trim(),
    detail: [i.fields.issuetype?.name, i.fields.status?.name, i.fields.priority?.name, i.fields.assignee?.displayName ?? 'non assigné'].filter(Boolean).join(' · '),
    statut: PRIORITAIRE.test(i.fields.priority?.name ?? '') ? 'orange' : 'vert',
    lien: config.jiraUrl ? lienJira(i.key) : null,
    t: i.fields.updated ? Date.parse(i.fields.updated) || null : null,
  }));
  return {
    statut: prioritaires.length ? 'orange' : 'vert',
    resume: issues.length ? `${issues.length} ticket(s) ouvert(s), ${prioritaires.length} prioritaire(s)` : 'Aucun ticket ouvert',
    mesures: [
      // shortcut: compte les 50 premiers résultats seulement ; paginer si le projet en a plus.
      { cle: 'ouverts', libelle: 'Ouverts', valeur: issues.length, unite: '', statut: 'vert', detail: 'Tickets non terminés' },
      { cle: 'en-cours', libelle: 'En cours', valeur: enCours, unite: '', statut: 'vert', detail: 'Catégorie « En cours »' },
      {
        cle: 'prioritaires',
        libelle: 'Prioritaires',
        valeur: prioritaires.length,
        unite: '',
        statut: prioritaires.length ? 'orange' : 'vert',
        detail: 'Priorité haute ou bloquante',
      },
      { cle: 'supervision', libelle: 'Venus de la supervision', valeur: supervision, unite: '', statut: 'vert', detail: 'Étiquette « supervision »' },
    ],
    lignes,
    lien,
    verifie: [],
  };
}

/** Crée un ticket Jira (titre, description, étiquettes « supervision » et numéro) ; renvoie sa clé. */
export async function creerIssueJira(resume: string, description: string, etiquettes: string[]): Promise<string> {
  const texte = description.trim() || resume;
  const r = await lireJson<{ key: string }>(`${api()}/issue`, {
    method: 'POST',
    headers: { ...entetes(), 'content-type': 'application/json' },
    body: JSON.stringify({
      fields: {
        project: { key: config.jiraProjet },
        summary: resume.slice(0, 250),
        issuetype: { name: config.jiraType },
        labels: etiquettes,
        // L'API v3 (Cloud) n'accepte que le format de document Atlassian ; la v2 du texte.
        description: cloud()
          ? { type: 'doc', version: 1, content: texte.split(/\n{2,}/).map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p.slice(0, 30_000) }] })) }
          : texte,
      },
    }),
  });
  return r.key;
}

/** Statut actuel de quelques tickets Jira : clé → { nom, fini }. */
export async function statutsJira(cles: string[]): Promise<Record<string, { nom: string; fini: boolean }>> {
  if (!cles.length) return {};
  const issues = await chercher(`key in (${cles.map((c) => `"${c.replace(/"/g, '')}"`).join(',')})`, 'status', 100);
  return Object.fromEntries(issues.map((i) => [i.key, { nom: i.fields.status?.name ?? '?', fini: i.fields.status?.statusCategory?.key === 'done' }]));
}

export const jira: SourceSignal = {
  cle: 'jira',
  nom: 'Jira',
  categorie: 'suivi',
  variables: 'JIRA_URL, JIRA_EMAIL (Cloud), JIRA_JETON, JIRA_PROJET',
  url: () => config.jiraUrl || null,
  configure: configureJira,
  async lire() {
    const jql = config.jiraJql || `project = "${config.jiraProjet}" AND statusCategory != Done ORDER BY updated DESC`;
    const issues = await chercher(jql, 'summary,status,priority,issuetype,assignee,updated,labels');
    return lectureJira(issues, `${config.jiraUrl}/jira/software/projects/${encodeURIComponent(config.jiraProjet)}/issues`);
  },
  demo() {
    const t = Date.now();
    const i = (key: string, summary: string, type: string, statut: string, cat: string, prio: string, qui: string | null, h: number, labels: string[] = []): IssueJira => ({
      key,
      fields: {
        summary,
        issuetype: { name: type },
        status: { name: statut, statusCategory: { key: cat } },
        priority: { name: prio },
        assignee: qui ? { displayName: qui } : null,
        updated: new Date(t - h * 3_600_000).toISOString(),
        labels,
      },
    });
    return lectureJira(
      [
        i('OFF-214', 'Export comptable : colonne TVA manquante', 'Bug', 'En cours', 'indeterminate', 'High', 'Awa Ndong', 2, ['supervision', 'INC0001001']),
        i('OFF-209', 'Prise en charge CNAMGS : nouveaux taux 2026', 'Story', 'En revue', 'indeterminate', 'Medium', 'Jean Mba', 5),
        i('OFF-198', 'Timeout des callbacks Moov Money', 'Bug', 'À faire', 'new', 'Medium', null, 26),
        i('OFF-187', 'Mettre à jour Node 22 sur les postes comptoir', 'Task', 'À faire', 'new', 'Low', null, 72),
      ],
      null,
    );
  },
};
