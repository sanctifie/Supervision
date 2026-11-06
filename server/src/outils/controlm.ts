import { config } from '../config';
import { lireJson } from '../fournisseurs/clients';
import { ErreurMetier } from '../erreurs';
import type { EtatExecution, Execution, Lancable } from '../../../shared/outils';
import { instant, type Outil } from './outil';

/** Control-M : statut des jobs du jour et relance (Automation API, jeton d'API). */

interface StatutJobControlm {
  jobId: string;
  name: string;
  folder?: string;
  type?: string;
  status: string;
  startTime?: string;
  endTime?: string;
  deleted?: boolean;
  held?: boolean;
  ctm?: string;
  description?: string;
}

export function etatControlm(status: string, supprime = false): EtatExecution {
  if (supprime) return 'annule';
  if (/not ok/i.test(status)) return 'echec';
  if (/ended ok/i.test(status)) return 'succes';
  if (/executing/i.test(status)) return 'en-cours';
  if (/^wait|hold/i.test(status)) return 'attente';
  return 'inconnu';
}

/** Control-M date « AAAAMMJJHHMMSS » (heure du serveur Control-M) ou ISO. */
export function instantControlm(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  // shortcut: l'heure est lue dans le fuseau de la supervision, pas celui de Control-M ; à corriger s'ils diffèrent.
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return instant(s);
}

export class Controlm implements Outil {
  readonly cle = 'controlm' as const;
  readonly url = config.controlmUrl;

  private appel<T>(chemin: string, methode = 'GET'): Promise<T> {
    return lireJson<T>(`${config.controlmUrl}/automation-api${chemin}`, { method: methode, headers: { 'x-api-key': config.controlmJeton } });
  }

  private execution(j: StatutJobControlm): Execution {
    return {
      outil: 'controlm',
      id: j.jobId,
      nom: j.name,
      contexte: j.folder ?? '',
      etat: etatControlm(j.status, j.deleted),
      statutBrut: j.status,
      debut: instantControlm(j.startTime),
      fin: instantControlm(j.endTime),
      par: j.ctm ?? null,
      lien: null,
    };
  }

  async executions(): Promise<Execution[]> {
    const r = await this.appel<{ statuses?: StatutJobControlm[] }>('/run/jobs/status?limit=100');
    return (r.statuses ?? [])
      .filter((j) => !/folder/i.test(j.type ?? ''))
      .map((j) => this.execution(j))
      .sort((a, b) => (b.debut ?? 0) - (a.debut ?? 0));
  }

  async lancables(): Promise<Lancable[]> {
    // shortcut: commander un dossier demande ctm + dossier (POST /run/order) ; seule la relance d'un job connu est offerte.
    return [];
  }

  async lancer(): Promise<Execution> {
    throw new ErreurMetier('Control-M : relancez un job existant depuis la liste');
  }

  async relancer(id: string): Promise<Execution> {
    const avant = (await this.executions()).find((e) => e.id === id);
    if (!avant) throw new ErreurMetier(`Job Control-M ${id} introuvable`);
    await this.appel(`/run/job/${encodeURIComponent(id)}/rerun`, 'POST');
    return { ...avant, etat: 'attente', statutBrut: 'Rerun requested', debut: Date.now(), fin: null };
  }
}
