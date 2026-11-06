import { config } from '../../config';
import type { LectureSignal } from '../../../../shared/outils';
import type { Statut } from '../../../../shared/types';
import type { SourceSignal } from './signal';

/** Uptime Kuma : ses moniteurs, lus sur sa page de métriques Prometheus (clé d'API). */

export interface EchantillonTexte {
  nom: string;
  etiquettes: Record<string, string>;
  valeur: number;
}

/** Parse le format texte Prometheus : `nom{a="x",b="y"} 12.5`. Commentaires et lignes vides ignorés. */
export function parserPrometheus(texte: string): EchantillonTexte[] {
  const r: EchantillonTexte[] = [];
  for (const ligne of texte.split('\n')) {
    const m = /^([A-Za-z_:][\w:]*)(?:\{(.*)\})?\s+(\S+)/.exec(ligne.trim());
    if (!m || ligne.startsWith('#')) continue;
    const etiquettes: Record<string, string> = {};
    for (const e of m[2]?.matchAll(/([A-Za-z_][\w]*)="((?:[^"\\]|\\.)*)"/g) ?? []) etiquettes[e[1]] = e[2].replace(/\\(["\\n])/g, (_, c) => (c === 'n' ? '\n' : c));
    const valeur = Number(m[3]);
    if (Number.isFinite(valeur)) r.push({ nom: m[1], etiquettes, valeur });
  }
  return r;
}

/** GET texte avec le délai d'attente de la configuration. */
export async function lireTexte(url: string, init?: RequestInit): Promise<string> {
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), config.delaiRequeteMs);
  try {
    const reponse = await fetch(url, { ...init, signal: controle.signal });
    if (!reponse.ok) throw new Error(`${reponse.status} ${reponse.statusText} sur ${url.split('?')[0]}`);
    return await reponse.text();
  } finally {
    clearTimeout(minuterie);
  }
}

const STATUT_KUMA: Record<number, { statut: Statut; libelle: string }> = {
  0: { statut: 'rouge', libelle: 'en panne' },
  1: { statut: 'vert', libelle: 'en ligne' },
  2: { statut: 'inconnu', libelle: 'en attente' },
  3: { statut: 'inconnu', libelle: 'en maintenance' },
};

export function lectureUptimeKuma(echantillons: EchantillonTexte[], lien: string | null): LectureSignal {
  const parNom = new Map<string, { nom: string; url: string; statut: number; reponseMs: number | null; certJours: number | null }>();
  for (const e of echantillons) {
    const nom = e.etiquettes.monitor_name;
    if (!nom || !/^monitor_(status|response_time|cert_days_remaining)$/.test(e.nom)) continue;
    const m = parNom.get(nom) ?? { nom, url: e.etiquettes.monitor_url ?? '', statut: 2, reponseMs: null, certJours: null };
    if (e.nom === 'monitor_status') m.statut = e.valeur;
    else if (e.nom === 'monitor_response_time') m.reponseMs = e.valeur;
    else m.certJours = e.valeur;
    parNom.set(nom, m);
  }
  const moniteurs = [...parNom.values()];
  const enPanne = moniteurs.filter((m) => m.statut === 0).length;
  const actifs = moniteurs.filter((m) => m.statut === 1 || m.statut === 0);
  const certs = moniteurs.map((m) => m.certJours).filter((j): j is number => j !== null && j >= 0);
  const certMin = certs.length ? Math.min(...certs) : null;
  const statut: Statut = enPanne ? 'rouge' : certMin !== null && certMin < 14 ? 'orange' : moniteurs.length ? 'vert' : 'inconnu';
  return {
    statut,
    resume: moniteurs.length ? `${moniteurs.length} moniteur(s), ${enPanne} en panne` : 'Aucun moniteur',
    mesures: [
      { cle: 'moniteurs', libelle: 'Moniteurs', valeur: moniteurs.length, unite: '', statut: moniteurs.length ? 'vert' : 'inconnu', detail: 'Sondes configurées dans Uptime Kuma' },
      { cle: 'panne', libelle: 'En panne', valeur: enPanne, unite: '', statut: enPanne ? 'rouge' : 'vert', detail: 'Moniteurs qui échouent' },
      {
        cle: 'certificat',
        libelle: 'Certificat (le plus proche)',
        valeur: certMin,
        unite: 'j',
        statut: certMin === null ? 'inconnu' : certMin < 7 ? 'rouge' : certMin < 14 ? 'orange' : 'vert',
        detail: 'Jours avant expiration',
      },
    ],
    lignes: moniteurs.map((m) => {
      const s = STATUT_KUMA[m.statut] ?? { statut: 'inconnu' as Statut, libelle: `statut ${m.statut}` };
      return { libelle: m.nom, detail: `${m.url} · ${s.libelle}${m.reponseMs !== null ? ` · ${Math.round(m.reponseMs)} ms` : ''}`, statut: s.statut, lien: m.url || null, t: null };
    }),
    lien,
    verifie: actifs.length ? [{ cle: 'checklist:sonde-externe', statut: enPanne ? 'rouge' : 'vert', detail: `${actifs.length} sonde(s) Uptime Kuma active(s)` }] : [],
  };
}

export const uptimekuma: SourceSignal = {
  cle: 'uptimekuma',
  nom: 'Uptime Kuma',
  categorie: 'sondes',
  variables: 'UPTIMEKUMA_URL, UPTIMEKUMA_CLE',
  url: () => config.uptimekumaUrl || null,
  configure: () => !!(config.uptimekumaUrl && config.uptimekumaCle),
  async lire() {
    // Clé d'API en mot de passe, utilisateur vide (Uptime Kuma ≥ 1.21).
    const texte = await lireTexte(`${config.uptimekumaUrl}/metrics`, { headers: { authorization: `Basic ${Buffer.from(`:${config.uptimekumaCle}`).toString('base64')}` } });
    return lectureUptimeKuma(parserPrometheus(texte), config.uptimekumaUrl);
  },
  demo: () =>
    lectureUptimeKuma(
      parserPrometheus(
        [
          'monitor_status{monitor_name="Site officine",monitor_type="http",monitor_url="https://officina-libreville.ga/officine/"} 1',
          'monitor_response_time{monitor_name="Site officine",monitor_type="http",monitor_url="https://officina-libreville.ga/officine/"} 212',
          'monitor_cert_days_remaining{monitor_name="Site officine",monitor_type="http",monitor_url="https://officina-libreville.ga/officine/"} 19',
          'monitor_status{monitor_name="API /health",monitor_type="http",monitor_url="https://officina-libreville.ga/health"} 1',
          'monitor_response_time{monitor_name="API /health",monitor_type="http",monitor_url="https://officina-libreville.ga/health"} 148',
        ].join('\n'),
      ),
      null,
    ),
};
