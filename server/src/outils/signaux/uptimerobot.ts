import { config } from '../../config';
import { lireJson } from '../../fournisseurs/clients';
import type { LectureSignal } from '../../../../shared/outils';
import type { Statut } from '../../../../shared/types';
import type { SourceSignal } from './signal';

/** UptimeRobot : les moniteurs externes et leur disponibilité sur 30 jours (API v2, clé en lecture). */

export interface MoniteurUR {
  id: number;
  friendly_name: string;
  url: string;
  type: number;
  /** 0 pause, 1 non vérifié, 2 up, 8 semble down, 9 down. */
  status: number;
  custom_uptime_ratio?: string;
}

const STATUT_UR: Record<number, { statut: Statut; libelle: string }> = {
  0: { statut: 'inconnu', libelle: 'en pause' },
  1: { statut: 'inconnu', libelle: 'pas encore vérifié' },
  2: { statut: 'vert', libelle: 'en ligne' },
  8: { statut: 'orange', libelle: 'semble en panne' },
  9: { statut: 'rouge', libelle: 'en panne' },
};

export function lectureUptimeRobot(moniteurs: MoniteurUR[]): LectureSignal {
  const actifs = moniteurs.filter((m) => m.status !== 0);
  const enPanne = moniteurs.filter((m) => m.status === 9).length;
  const douteux = moniteurs.filter((m) => m.status === 8).length;
  const ratios = moniteurs.map((m) => Number(m.custom_uptime_ratio)).filter((r) => Number.isFinite(r));
  const dispo = ratios.length ? ratios.reduce((s, r) => s + r, 0) / ratios.length : null;
  const statut: Statut = enPanne ? 'rouge' : douteux ? 'orange' : moniteurs.length ? 'vert' : 'inconnu';
  return {
    statut,
    resume: moniteurs.length ? `${moniteurs.length} moniteur(s), ${enPanne} en panne` : 'Aucun moniteur',
    mesures: [
      { cle: 'moniteurs', libelle: 'Moniteurs', valeur: moniteurs.length, unite: '', statut: moniteurs.length ? 'vert' : 'inconnu', detail: 'Sondes externes configurées' },
      { cle: 'panne', libelle: 'En panne', valeur: enPanne, unite: '', statut: enPanne ? 'rouge' : 'vert', detail: 'Moniteurs qui échouent' },
      {
        cle: 'dispo',
        libelle: 'Disponibilité (30 j)',
        valeur: dispo,
        unite: '%',
        statut: dispo === null ? 'inconnu' : dispo < 99 ? 'orange' : 'vert',
        detail: 'Moyenne des moniteurs',
      },
    ],
    lignes: moniteurs.map((m) => {
      const s = STATUT_UR[m.status] ?? { statut: 'inconnu' as Statut, libelle: `statut ${m.status}` };
      return {
        libelle: m.friendly_name,
        detail: `${m.url} · ${s.libelle}${m.custom_uptime_ratio ? ` · ${m.custom_uptime_ratio} % sur 30 j` : ''}`,
        statut: s.statut,
        lien: m.url,
        t: null,
      };
    }),
    lien: 'https://dashboard.uptimerobot.com',
    verifie: actifs.length ? [{ cle: 'checklist:sonde-externe', statut: enPanne ? 'rouge' : 'vert', detail: `${actifs.length} sonde(s) externe(s) active(s)` }] : [],
  };
}

export const uptimerobot: SourceSignal = {
  cle: 'uptimerobot',
  nom: 'UptimeRobot',
  categorie: 'sondes',
  variables: 'UPTIMEROBOT_CLE',
  url: () => 'https://dashboard.uptimerobot.com',
  configure: () => !!config.uptimerobotCle,
  async lire() {
    const r = await lireJson<{ stat: string; monitors?: MoniteurUR[]; error?: { message?: string } }>('https://api.uptimerobot.com/v2/getMonitors', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ api_key: config.uptimerobotCle, format: 'json', custom_uptime_ratios: '30', logs: '0' }).toString(),
    });
    if (r.stat !== 'ok') throw new Error(`UptimeRobot : ${r.error?.message ?? 'réponse en erreur'}`);
    return lectureUptimeRobot(r.monitors ?? []);
  },
  demo: () =>
    lectureUptimeRobot([
      { id: 1, friendly_name: 'Site officine', url: 'https://officina-libreville.ga/officine/', type: 1, status: 2, custom_uptime_ratio: '99.98' },
      { id: 2, friendly_name: 'API /health', url: 'https://officina-libreville.ga/health', type: 1, status: 2, custom_uptime_ratio: '99.95' },
      { id: 3, friendly_name: 'Comptoir', url: 'https://officina-libreville.ga/comptoir/', type: 1, status: 2, custom_uptime_ratio: '99.91' },
    ]),
};
