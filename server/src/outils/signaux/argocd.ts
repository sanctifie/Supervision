import { config } from '../../config';
import { lireJson } from '../../fournisseurs/clients';
import type { LectureSignal } from '../../../../shared/outils';
import type { Statut } from '../../../../shared/types';
import type { SourceSignal } from './signal';

/** Argo CD : état de synchronisation et de santé des applications, synchronisation à la demande (API v1, jeton). */

interface AppArgo {
  metadata: { name: string };
  status: { sync?: { status?: string; revision?: string }; health?: { status?: string }; operationState?: { phase?: string; finishedAt?: string } };
}

const entetes = () => ({ authorization: `Bearer ${config.argocdJeton}` });

export function lectureArgocd(apps: AppArgo[], url: string | null): LectureSignal {
  const sync = (a: AppArgo) => a.status.sync?.status ?? 'Unknown';
  const sante = (a: AppArgo) => a.status.health?.status ?? 'Unknown';
  const statutApp = (a: AppArgo): Statut =>
    sante(a) === 'Degraded' || sante(a) === 'Missing'
      ? 'rouge'
      : sync(a) === 'OutOfSync' || sante(a) === 'Progressing'
        ? 'orange'
        : sync(a) === 'Synced' && sante(a) === 'Healthy'
          ? 'vert'
          : 'inconnu';
  const synchronisees = apps.filter((a) => sync(a) === 'Synced').length;
  const saines = apps.filter((a) => sante(a) === 'Healthy').length;
  const statuts = apps.map(statutApp);
  const statut: Statut = statuts.includes('rouge') ? 'rouge' : statuts.includes('orange') ? 'orange' : apps.length ? 'vert' : 'inconnu';
  const toutesOk = apps.length > 0 && synchronisees === apps.length && saines === apps.length;
  return {
    statut,
    resume: apps.length ? `${synchronisees}/${apps.length} synchronisée(s), ${saines}/${apps.length} saine(s)` : 'Aucune application',
    mesures: [
      { cle: 'applications', libelle: 'Applications', valeur: apps.length, unite: '', statut: apps.length ? 'vert' : 'inconnu', detail: 'Gérées par Argo CD' },
      {
        cle: 'synchronisees',
        libelle: 'Synchronisées',
        valeur: synchronisees,
        unite: '',
        statut: synchronisees === apps.length ? 'vert' : 'orange',
        detail: 'Conformes au dépôt Git',
      },
      { cle: 'saines', libelle: 'Saines', valeur: saines, unite: '', statut: saines === apps.length ? 'vert' : 'rouge', detail: 'Santé Healthy' },
    ],
    lignes: apps.map((a) => ({
      libelle: a.metadata.name,
      detail: `${sync(a)} · ${sante(a)}${a.status.sync?.revision ? ` · ${a.status.sync.revision.slice(0, 8)}` : ''}`,
      statut: statutApp(a),
      lien: url ? `${url}/applications/${encodeURIComponent(a.metadata.name)}` : null,
      t: a.status.operationState?.finishedAt ? Date.parse(a.status.operationState.finishedAt) || null : null,
      actions: [{ id: 'synchroniser', libelle: 'Synchroniser' }],
    })),
    lien: url ? `${url}/applications` : null,
    verifie: [
      { cle: 'pipeline:production', statut: toutesOk ? 'vert' : 'orange', detail: `Argo CD : ${synchronisees}/${apps.length} application(s) synchronisée(s)` },
      ...(apps.length ? [{ cle: 'checklist:rollback', statut: 'vert' as Statut, detail: 'GitOps : retour arrière = revenir au commit précédent' }] : []),
    ],
  };
}

export const argocd: SourceSignal = {
  cle: 'argocd',
  nom: 'Argo CD',
  categorie: 'gitops',
  variables: 'ARGOCD_URL, ARGOCD_JETON',
  url: () => config.argocdUrl || null,
  configure: () => !!(config.argocdUrl && config.argocdJeton),
  async lire() {
    const r = await lireJson<{ items?: AppArgo[] }>(`${config.argocdUrl}/api/v1/applications`, { headers: entetes() });
    return lectureArgocd(r.items ?? [], config.argocdUrl);
  },
  demo() {
    const t = Date.now();
    return lectureArgocd(
      [
        {
          metadata: { name: 'officina-prod' },
          status: {
            sync: { status: 'Synced', revision: 'a1b2c3d4e5f6' },
            health: { status: 'Healthy' },
            operationState: { phase: 'Succeeded', finishedAt: new Date(t - 4 * 3_600_000).toISOString() },
          },
        },
        {
          metadata: { name: 'officina-staging' },
          status: {
            sync: { status: 'OutOfSync', revision: 'f6e5d4c3b2a1' },
            health: { status: 'Healthy' },
            operationState: { phase: 'Succeeded', finishedAt: new Date(t - 30 * 60_000).toISOString() },
          },
        },
      ],
      null,
    );
  },
  async agir(action, cible, auteur) {
    if (action !== 'synchroniser') throw new Error(`Action inconnue : ${action}`);
    await lireJson(`${config.argocdUrl}/api/v1/applications/${encodeURIComponent(cible)}/sync`, {
      method: 'POST',
      headers: { ...entetes(), 'content-type': 'application/json' },
      body: '{}',
    });
    return `Synchronisation de ${cible} demandée par ${auteur}`;
  },
};
