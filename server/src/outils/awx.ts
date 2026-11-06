import { config } from '../config';
import { lireJson } from '../fournisseurs/clients';
import type { EtatExecution, Execution, Lancable } from '../../../shared/outils';
import { instant, type Outil } from './outil';

/** AWX (Ansible) : jobs et modèles de job (API v2, jeton personnel). */

interface JobAwx {
  id: number;
  name: string;
  status: string;
  created: string;
  started: string | null;
  finished: string | null;
  launch_type?: string;
  playbook?: string;
  summary_fields?: { job_template?: { name: string }; created_by?: { username: string } };
}

export function etatAwx(status: string): EtatExecution {
  if (status === 'successful') return 'succes';
  if (status === 'failed' || status === 'error') return 'echec';
  if (status === 'running') return 'en-cours';
  if (status === 'canceled') return 'annule';
  if (status === 'new' || status === 'pending' || status === 'waiting') return 'attente';
  return 'inconnu';
}

export class Awx implements Outil {
  readonly cle = 'awx' as const;
  readonly url = config.awxUrl;

  private appel<T>(chemin: string, methode = 'GET', corps?: unknown): Promise<T> {
    return lireJson<T>(`${config.awxUrl}/api/v2${chemin}`, {
      method: methode,
      headers: { authorization: `Bearer ${config.awxJeton}`, ...(corps !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
  }

  private execution(j: JobAwx): Execution {
    return {
      outil: 'awx',
      id: String(j.id),
      nom: j.name,
      contexte: j.summary_fields?.job_template?.name ?? j.playbook ?? '',
      etat: etatAwx(j.status),
      statutBrut: j.status,
      debut: instant(j.started) ?? instant(j.created),
      fin: instant(j.finished),
      par: j.summary_fields?.created_by?.username ?? j.launch_type ?? null,
      lien: `${config.awxUrl}/#/jobs/playbook/${j.id}/output`,
    };
  }

  async executions(): Promise<Execution[]> {
    const r = await this.appel<{ results: JobAwx[] }>('/jobs/?order_by=-created&page_size=20');
    return r.results.map((j) => this.execution(j));
  }

  async lancables(): Promise<Lancable[]> {
    const r = await this.appel<{ results: { id: number; name: string; description: string; playbook: string }[] }>('/job_templates/?order_by=name&page_size=100');
    return r.results.map((m) => ({ outil: 'awx', id: String(m.id), nom: m.name, description: m.description || m.playbook }));
  }

  async lancer(id: string): Promise<Execution> {
    // shortcut: un modèle avec questionnaire (survey) ou variables obligatoires est refusé par AWX (400) ; à étendre si besoin.
    return this.execution(await this.appel<JobAwx>(`/job_templates/${encodeURIComponent(id)}/launch/`, 'POST', {}));
  }

  async relancer(id: string): Promise<Execution> {
    return this.execution(await this.appel<JobAwx>(`/jobs/${encodeURIComponent(id)}/relaunch/`, 'POST', {}));
  }
}
