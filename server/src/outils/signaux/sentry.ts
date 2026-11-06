import { config } from '../../config';
import { lireJson } from '../../fournisseurs/clients';
import type { LectureSignal, LigneSignal } from '../../../../shared/outils';
import type { Statut } from '../../../../shared/types';
import type { SourceSignal } from './signal';

/** Sentry : issues non résolues du projet (24 h), résolution depuis l'interface (API v0, jeton). */

interface IssueSentry {
  id: string;
  title: string;
  culprit?: string;
  level: string;
  count: string;
  userCount: number;
  lastSeen: string;
  permalink: string;
  stats?: { '24h'?: [number, number][] };
}

const projet = () => `${config.sentryUrl}/api/0/projects/${encodeURIComponent(config.sentryOrg)}/${encodeURIComponent(config.sentryProjet)}`;
const entetes = () => ({ authorization: `Bearer ${config.sentryJeton}` });

export function lectureSentry(issues: IssueSentry[], lien: string | null): LectureSignal {
  const evenements24h = issues.reduce((s, i) => s + (i.stats?.['24h'] ?? []).reduce((x, [, n]) => x + n, 0), 0);
  const utilisateurs = issues.reduce((s, i) => s + (i.userCount ?? 0), 0);
  const graves = issues.filter((i) => i.level === 'fatal' || i.level === 'error');
  const statut: Statut = evenements24h >= 1000 ? 'rouge' : graves.length ? 'orange' : 'vert';
  const lignes: LigneSignal[] = issues.map((i) => ({
    libelle: i.title,
    detail: `${i.culprit ?? ''} · ${i.level} · ${i.count} événement(s), ${i.userCount ?? 0} utilisateur(s)`,
    statut: i.level === 'fatal' || i.level === 'error' ? 'orange' : 'vert',
    lien: i.permalink ?? null,
    t: Date.parse(i.lastSeen) || null,
    actions: [{ id: 'resoudre', libelle: 'Résoudre' }],
  }));
  return {
    statut,
    resume: issues.length ? `${issues.length} issue(s) non résolue(s), ${evenements24h} événement(s) sur 24 h` : 'Aucune issue non résolue',
    mesures: [
      { cle: 'issues', libelle: 'Issues non résolues', valeur: issues.length, unite: '', statut: graves.length ? 'orange' : 'vert', detail: 'Erreurs distinctes à traiter' },
      {
        cle: 'evenements',
        libelle: 'Événements (24 h)',
        valeur: evenements24h,
        unite: '',
        statut: evenements24h >= 1000 ? 'rouge' : evenements24h ? 'orange' : 'vert',
        detail: 'Occurrences remontées par le SDK',
      },
      { cle: 'utilisateurs', libelle: 'Utilisateurs touchés', valeur: utilisateurs, unite: '', statut: utilisateurs ? 'orange' : 'vert', detail: 'Sur les issues ouvertes' },
    ],
    lignes,
    lien,
    verifie: [{ cle: 'checklist:sentry', statut: 'vert', detail: `Sentry relié : ${issues.length} issue(s) non résolue(s)` }],
  };
}

export const sentry: SourceSignal = {
  cle: 'sentry',
  nom: 'Sentry',
  categorie: 'erreurs',
  variables: 'SENTRY_URL, SENTRY_JETON, SENTRY_ORG, SENTRY_PROJET',
  url: () => (config.sentryJeton ? config.sentryUrl : null),
  configure: () => !!(config.sentryJeton && config.sentryOrg && config.sentryProjet),
  async lire() {
    const issues = await lireJson<IssueSentry[]>(`${projet()}/issues/?query=is%3Aunresolved&statsPeriod=24h&sort=freq&limit=10`, { headers: entetes() });
    return lectureSentry(issues, `${config.sentryUrl}/organizations/${config.sentryOrg}/issues/?project=${encodeURIComponent(config.sentryProjet)}`);
  },
  demo() {
    const t = Date.now();
    return lectureSentry(
      [
        {
          id: '1',
          title: 'TypeError: Cannot read properties of undefined (reading "prix")',
          culprit: 'sales/panier.ts',
          level: 'error',
          count: '42',
          userCount: 7,
          lastSeen: new Date(t - 20 * 60_000).toISOString(),
          permalink: '#',
          stats: { '24h': [[t, 42]] },
        },
        {
          id: '2',
          title: 'TimeoutError: Moov Money callback',
          culprit: 'payments/moov.ts',
          level: 'warning',
          count: '9',
          userCount: 3,
          lastSeen: new Date(t - 3 * 3_600_000).toISOString(),
          permalink: '#',
          stats: { '24h': [[t, 9]] },
        },
      ],
      null,
    );
  },
  async agir(action, cible, auteur) {
    if (action !== 'resoudre') throw new Error(`Action inconnue : ${action}`);
    await lireJson(`${config.sentryUrl}/api/0/issues/${encodeURIComponent(cible)}/`, {
      method: 'PUT',
      headers: { ...entetes(), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    });
    return `Issue ${cible} résolue par ${auteur}`;
  },
};
