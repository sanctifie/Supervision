import { config } from '../config';
import { lireJson } from '../fournisseurs/clients';
import type { DemandeFusion, EtatExecution, Execution, Lancable } from '../../../shared/outils';
import { instant, type Outil } from './outil';

/** GitLab : pipelines CI/CD d'un projet, branches, demandes de fusion (API v4). */

interface PipelineGitlab {
  id: number;
  iid: number;
  ref: string;
  sha: string;
  status: string;
  source?: string;
  created_at: string;
  updated_at: string;
  web_url: string;
  user?: { name: string } | null;
}

export function etatGitlab(status: string): EtatExecution {
  if (status === 'success') return 'succes';
  if (status === 'failed') return 'echec';
  if (status === 'running' || status === 'preparing') return 'en-cours';
  if (status === 'canceled' || status === 'canceling' || status === 'skipped') return 'annule';
  if (['created', 'pending', 'waiting_for_resource', 'manual', 'scheduled'].includes(status)) return 'attente';
  return 'inconnu';
}

export class Gitlab implements Outil {
  readonly cle = 'gitlab' as const;
  get url() {
    return config.gitlabUrl;
  }
  private get projet() {
    return `${config.gitlabUrl}/api/v4/projects/${encodeURIComponent(config.gitlabProjet)}`;
  }

  private appel<T>(chemin: string, methode = 'GET', corps?: unknown): Promise<T> {
    return lireJson<T>(`${this.projet}${chemin}`, {
      method: methode,
      headers: { 'PRIVATE-TOKEN': config.gitlabJeton, ...(corps !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
  }

  private execution(p: PipelineGitlab): Execution {
    const etat = etatGitlab(p.status);
    return {
      outil: 'gitlab',
      id: String(p.id),
      nom: `Pipeline #${p.iid}`,
      contexte: p.ref,
      etat,
      statutBrut: p.status,
      debut: instant(p.created_at),
      // La liste ne donne pas finished_at : la dernière mise à jour en tient lieu.
      fin: etat === 'succes' || etat === 'echec' || etat === 'annule' ? instant(p.updated_at) : null,
      par: p.user?.name ?? (p.source ? p.source.replace(/_/g, ' ') : null),
      lien: p.web_url,
    };
  }

  async executions(): Promise<Execution[]> {
    const pipelines = await this.appel<PipelineGitlab[]>('/pipelines?per_page=20&order_by=updated_at&sort=desc');
    return pipelines.map((p) => this.execution(p));
  }

  async lancables(): Promise<Lancable[]> {
    const branches = await this.appel<{ name: string; commit?: { title?: string } }[]>('/repository/branches?per_page=50');
    return branches.map((b) => ({ outil: 'gitlab', id: b.name, nom: `Pipeline sur ${b.name}`, description: b.commit?.title ?? '' }));
  }

  async lancer(ref: string): Promise<Execution> {
    return this.execution(await this.appel<PipelineGitlab>('/pipeline', 'POST', { ref }));
  }

  async relancer(id: string): Promise<Execution> {
    return this.execution(await this.appel<PipelineGitlab>(`/pipelines/${encodeURIComponent(id)}/retry`, 'POST', {}));
  }

  async demandesFusion(): Promise<DemandeFusion[]> {
    const mrs = await this.appel<
      {
        iid: number;
        title: string;
        author?: { name: string };
        source_branch: string;
        target_branch: string;
        updated_at: string;
        web_url: string;
        head_pipeline?: { status: string } | null;
      }[]
    >('/merge_requests?state=opened&per_page=10&order_by=updated_at&sort=desc');
    return mrs.map((m) => ({
      iid: m.iid,
      titre: m.title,
      auteur: m.author?.name ?? '',
      source: m.source_branch,
      cible: m.target_branch,
      majLe: instant(m.updated_at) ?? 0,
      lien: m.web_url,
      pipeline: m.head_pipeline ? etatGitlab(m.head_pipeline.status) : null,
    }));
  }
}
