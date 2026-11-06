import { config } from '../config';
import { lireJson } from '../fournisseurs/clients';
import type { DemandeFusion, EtatExecution, Execution, Lancable } from '../../../shared/outils';
import { instant, type Outil } from './outil';

/** GitHub Actions : exécutions de workflows, lancement (workflow_dispatch), relance, pull requests (API REST, jeton). */

interface RunGithub {
  id: number;
  run_number: number;
  name: string;
  head_branch: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  actor?: { login: string };
  event?: string;
}

export function etatGithub(status: string, conclusion: string | null): EtatExecution {
  if (status !== 'completed') return status === 'in_progress' ? 'en-cours' : 'attente';
  if (conclusion === 'success') return 'succes';
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') return 'echec';
  if (conclusion === 'cancelled' || conclusion === 'skipped') return 'annule';
  if (conclusion === 'action_required') return 'attente';
  return 'inconnu';
}

export class Github implements Outil {
  readonly cle = 'github' as const;
  get url() {
    return config.githubDepot ? `https://github.com/${config.githubDepot}` : null;
  }

  private appel<T>(chemin: string, methode = 'GET', corps?: unknown): Promise<T> {
    return lireJson<T>(`${config.githubUrl}/repos/${config.githubDepot}${chemin}`, {
      method: methode,
      headers: {
        authorization: `Bearer ${config.githubJeton}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'supervision-officina',
        ...(corps !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
  }

  private execution(r: RunGithub): Execution {
    const etat = etatGithub(r.status, r.conclusion);
    return {
      outil: 'github',
      id: String(r.id),
      nom: `${r.name} #${r.run_number}`,
      contexte: r.head_branch,
      etat,
      statutBrut: r.conclusion ?? r.status,
      debut: instant(r.created_at),
      fin: r.status === 'completed' ? instant(r.updated_at) : null,
      par: r.actor?.login ?? r.event ?? null,
      lien: r.html_url,
    };
  }

  async executions(): Promise<Execution[]> {
    const r = await this.appel<{ workflow_runs: RunGithub[] }>('/actions/runs?per_page=20');
    return r.workflow_runs.map((x) => this.execution(x));
  }

  async lancables(): Promise<Lancable[]> {
    const r = await this.appel<{ workflows: { id: number; name: string; path: string; state: string }[] }>('/actions/workflows?per_page=50');
    return r.workflows.filter((w) => w.state === 'active').map((w) => ({ outil: 'github', id: String(w.id), nom: w.name, description: w.path }));
  }

  async lancer(id: string): Promise<Execution> {
    // workflow_dispatch exige une branche : la branche par défaut du dépôt.
    const depot = await this.appel<{ default_branch: string }>('');
    await this.appel(`/actions/workflows/${encodeURIComponent(id)}/dispatches`, 'POST', { ref: depot.default_branch });
    const nom = (await this.lancables()).find((l) => l.id === id)?.nom ?? `Workflow ${id}`;
    return {
      outil: 'github',
      id: `dispatch-${Date.now()}`,
      nom,
      contexte: depot.default_branch,
      etat: 'attente',
      statutBrut: 'queued',
      debut: Date.now(),
      fin: null,
      par: null,
      lien: `${this.url}/actions`,
    };
  }

  async relancer(id: string): Promise<Execution> {
    await this.appel(`/actions/runs/${encodeURIComponent(id)}/rerun`, 'POST', {});
    return this.execution(await this.appel<RunGithub>(`/actions/runs/${encodeURIComponent(id)}`));
  }

  async demandesFusion(): Promise<DemandeFusion[]> {
    const prs =
      await this.appel<{ number: number; title: string; user?: { login: string }; head: { ref: string }; base: { ref: string }; updated_at: string; html_url: string }[]>(
        '/pulls?state=open&per_page=10',
      );
    return prs.map((p) => ({
      iid: p.number,
      titre: p.title,
      auteur: p.user?.login ?? '',
      source: p.head.ref,
      cible: p.base.ref,
      majLe: instant(p.updated_at) ?? 0,
      lien: p.html_url,
      pipeline: null,
    }));
  }
}
