import { config } from '../../config';
import { lireJson } from '../../fournisseurs/clients';
import type { LectureSignal } from '../../../../shared/outils';
import type { Statut } from '../../../../shared/types';
import { nombre } from '../../../../shared/format';
import type { SourceSignal } from './signal';

/** Jaeger : traces du service suivi sur la dernière heure, p95 et erreurs (API de requête). Lecture seule. */

interface SpanJaeger {
  operationName: string;
  startTime: number;
  duration: number;
  tags?: { key: string; value: unknown }[];
  references?: unknown[];
}
interface TraceJaeger {
  traceID: string;
  spans: SpanJaeger[];
}

/** Durée (ms) et erreur d'une trace, depuis ses spans (µs). */
export function resumerTrace(t: TraceJaeger): { operation: string; dureeMs: number; erreur: boolean } {
  const debut = Math.min(...t.spans.map((s) => s.startTime));
  const fin = Math.max(...t.spans.map((s) => s.startTime + s.duration));
  const racine = t.spans.find((s) => !s.references?.length) ?? t.spans[0];
  const erreur = t.spans.some((s) =>
    s.tags?.some((x) => (x.key === 'error' && (x.value === true || x.value === 'true')) || (x.key === 'http.status_code' && Number(x.value) >= 500)),
  );
  return { operation: racine?.operationName ?? '?', dureeMs: t.spans.length ? (fin - debut) / 1000 : 0, erreur };
}

export function lectureJaeger(services: string[], traces: TraceJaeger[], url: string | null): LectureSignal {
  const resumes = traces.map((t) => ({ id: t.traceID, ...resumerTrace(t) }));
  const durees = resumes.map((r) => r.dureeMs).sort((a, b) => a - b);
  const p95 = durees.length ? durees[Math.min(durees.length - 1, Math.floor(0.95 * durees.length))] : null;
  const erreurs = resumes.filter((r) => r.erreur).length;
  const taux = resumes.length ? erreurs / resumes.length : 0;
  const statut: Statut = !resumes.length ? 'inconnu' : taux > 0.1 ? 'rouge' : erreurs || (p95 ?? 0) > 800 ? 'orange' : 'vert';
  const notables = [...resumes].sort((a, b) => Number(b.erreur) - Number(a.erreur) || b.dureeMs - a.dureeMs).slice(0, 10);
  return {
    statut,
    resume: resumes.length ? `${resumes.length} trace(s) sur 1 h · p95 ${nombre(p95, 0)} ms · ${erreurs} en erreur` : 'Aucune trace sur la dernière heure',
    mesures: [
      { cle: 'services', libelle: 'Services instrumentés', valeur: services.length, unite: '', statut: services.length ? 'vert' : 'inconnu', detail: 'Connus de Jaeger' },
      { cle: 'traces', libelle: 'Traces (1 h)', valeur: resumes.length, unite: '', statut: resumes.length ? 'vert' : 'inconnu', detail: `Service ${config.jaegerService}` },
      { cle: 'p95', libelle: 'Durée p95', valeur: p95, unite: 'ms', statut: p95 === null ? 'inconnu' : p95 > 800 ? 'orange' : 'vert', detail: 'Sur les traces lues' },
      { cle: 'erreurs', libelle: 'Traces en erreur', valeur: erreurs, unite: '', statut: taux > 0.1 ? 'rouge' : erreurs ? 'orange' : 'vert', detail: 'Tag error ou HTTP 5xx' },
    ],
    lignes: notables.map((r) => ({
      libelle: r.operation,
      detail: `${nombre(r.dureeMs, 0)} ms${r.erreur ? ' · erreur' : ''}`,
      statut: r.erreur ? 'rouge' : r.dureeMs > 800 ? 'orange' : 'vert',
      lien: url ? `${url}/trace/${encodeURIComponent(r.id)}` : null,
      t: null,
    })),
    lien: url ? `${url}/search?service=${encodeURIComponent(config.jaegerService)}` : null,
    verifie: [],
  };
}

export const jaeger: SourceSignal = {
  cle: 'jaeger',
  nom: 'Jaeger',
  categorie: 'traces',
  variables: 'JAEGER_URL, JAEGER_SERVICE',
  url: () => config.jaegerUrl || null,
  configure: () => !!config.jaegerUrl,
  async lire() {
    const [services, traces] = await Promise.all([
      lireJson<{ data?: string[] }>(`${config.jaegerUrl}/api/services`),
      lireJson<{ data?: TraceJaeger[] }>(`${config.jaegerUrl}/api/traces?service=${encodeURIComponent(config.jaegerService)}&limit=50&lookback=1h`),
    ]);
    return lectureJaeger(services.data ?? [], traces.data ?? [], config.jaegerUrl);
  },
  demo() {
    const t = Date.now() * 1000;
    const trace = (id: string, op: string, ms: number, erreur = false): TraceJaeger => ({
      traceID: id,
      spans: [
        { operationName: op, startTime: t - ms * 1000, duration: ms * 1000, tags: erreur ? [{ key: 'http.status_code', value: 502 }] : [] },
        { operationName: 'pg.query', startTime: t - ms * 800, duration: ms * 300, references: [{}] },
      ],
    });
    return lectureJaeger(
      ['gateway', 'sales', 'catalog', 'inventory', 'payments'],
      [
        trace('a1', 'POST /v1/sales', 210),
        trace('a2', 'GET /v1/catalog/products', 95),
        trace('a3', 'POST /v1/notify/sms', 1900),
        trace('a4', 'GET /v1/inventory/alerts', 140),
        trace('a5', 'POST /v1/sales', 320),
      ],
      null,
    );
  },
};
