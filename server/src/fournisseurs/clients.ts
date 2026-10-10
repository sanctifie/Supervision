import { config } from '../config';
import type { Point } from '../../../shared/types';

/** Petits clients HTTP pour Prometheus, Alertmanager et Loki (fetch natif). */

async function lireJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), config.delaiRequeteMs);
  try {
    const reponse = await fetch(url, { ...init, signal: controle.signal });
    if (!reponse.ok) throw new Error(`${reponse.status} ${reponse.statusText} sur ${url.split('?')[0]}`);
    const texte = await reponse.text();
    return (texte ? JSON.parse(texte) : null) as T;
  } finally {
    clearTimeout(minuterie);
  }
}

export interface Echantillon {
  metric: Record<string, string>;
  value?: [number, string];
  values?: [number, string][];
}

interface ReponsePrometheus {
  status: string;
  data: { resultType: string; result: Echantillon[] };
}

export const prometheus = {
  /** Requête instantanée ; une liste vide si la mesure n'existe pas. */
  async requete(promql: string): Promise<Echantillon[]> {
    const url = `${config.prometheusUrl}/api/v1/query?query=${encodeURIComponent(promql)}`;
    const r = await lireJson<ReponsePrometheus>(url);
    return r.data.result;
  },

  /** Une seule valeur (la première série), ou null. */
  async valeur(promql: string): Promise<number | null> {
    try {
      const r = await this.requete(promql);
      if (!r.length || !r[0].value) return null;
      const v = Number(r[0].value[1]);
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  },

  /** Une valeur par étiquette : { sales: 0.4, catalog: 0.1, … }. */
  async parEtiquette(promql: string, etiquette: string): Promise<Record<string, number>> {
    try {
      const r = await this.requete(promql);
      const resultat: Record<string, number> = {};
      for (const e of r) {
        const v = Number(e.value?.[1]);
        if (Number.isFinite(v)) resultat[e.metric[etiquette] ?? ''] = v;
      }
      return resultat;
    } catch {
      return {};
    }
  },

  /** Une série sur `heures` heures, `points` points environ. */
  async serie(promql: string, heures = 6, points = 120): Promise<Point[]> {
    try {
      const fin = Math.floor(Date.now() / 1000);
      const debut = fin - heures * 3600;
      const pas = Math.max(15, Math.floor((heures * 3600) / points));
      const url = `${config.prometheusUrl}/api/v1/query_range?query=${encodeURIComponent(promql)}` + `&start=${debut}&end=${fin}&step=${pas}`;
      const r = await lireJson<ReponsePrometheus>(url);
      const valeurs = r.data.result[0]?.values ?? [];
      return valeurs.map(([t, v]) => ({ t: t * 1000, v: Number(v) })).filter((p) => Number.isFinite(p.v));
    } catch {
      return [];
    }
  },

  async joignable(): Promise<boolean> {
    try {
      await lireJson(`${config.prometheusUrl}/api/v1/status/buildinfo`);
      return true;
    } catch {
      return false;
    }
  },
};

export interface AlerteAM {
  fingerprint: string;
  startsAt: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  status: { state: 'active' | 'suppressed' | 'unprocessed'; silencedBy: string[]; inhibitedBy: string[] };
}

export interface SilenceAM {
  id: string;
  createdBy: string;
  comment: string;
  startsAt: string;
  endsAt: string;
  matchers: { name: string; value: string; isRegex: boolean; isEqual?: boolean }[];
  status: { state: 'active' | 'pending' | 'expired' };
}

export const alertmanager = {
  alertes: () => lireJson<AlerteAM[]>(`${config.alertmanagerUrl}/api/v2/alerts?active=true&silenced=true&inhibited=false`),
  silences: () => lireJson<SilenceAM[]>(`${config.alertmanagerUrl}/api/v2/silences`),
  async creerSilence(corps: unknown): Promise<string> {
    const r = await lireJson<{ silenceID: string }>(`${config.alertmanagerUrl}/api/v2/silences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
    return r.silenceID;
  },
  async supprimerSilence(id: string): Promise<void> {
    await lireJson(`${config.alertmanagerUrl}/api/v2/silence/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async envoyer(alertes: unknown[]): Promise<void> {
    await lireJson(`${config.alertmanagerUrl}/api/v2/alerts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(alertes),
    });
  },
  async joignable(): Promise<boolean> {
    try {
      await lireJson(`${config.alertmanagerUrl}/api/v2/status`);
      return true;
    } catch {
      return false;
    }
  },
};

interface ReponseLoki {
  data: { result: { stream: Record<string, string>; values: [string, string][] }[] };
}

export const loki = {
  async requete(logql: string, minutes: number, limite: number) {
    const fin = BigInt(Date.now()) * 1_000_000n;
    const debut = fin - BigInt(minutes) * 60n * 1_000_000_000n;
    const url = `${config.lokiUrl}/loki/api/v1/query_range?query=${encodeURIComponent(logql)}` + `&start=${debut}&end=${fin}&limit=${limite}&direction=backward`;
    const r = await lireJson<ReponseLoki>(url);
    return r.data.result;
  },
  async joignable(): Promise<boolean> {
    try {
      const controle = new AbortController();
      const minuterie = setTimeout(() => controle.abort(), config.delaiRequeteMs);
      const r = await fetch(`${config.lokiUrl}/ready`, { signal: controle.signal });
      clearTimeout(minuterie);
      return r.ok;
    } catch {
      return false;
    }
  },
};
