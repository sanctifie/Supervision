import { config } from '../../config';
import { lireJson } from '../../fournisseurs/clients';
import type { LectureSignal } from '../../../../shared/outils';
import type { SourceSignal } from './signal';

/** CrowdSec : décisions actives (bannissements) de l'API locale, avec une clé de bouncer. */

export interface DecisionCS {
  id: number;
  origin: string;
  scenario: string;
  scope: string;
  value: string;
  type: string;
  duration: string;
  until?: string;
}

export function lectureCrowdsec(decisions: DecisionCS[], lien: string | null): LectureSignal {
  const bans = decisions.filter((d) => d.type === 'ban');
  const scenarios = new Set(decisions.map((d) => d.scenario));
  return {
    statut: 'vert',
    resume: decisions.length ? `${decisions.length} décision(s) active(s), ${bans.length} bannissement(s)` : 'Aucune décision active',
    mesures: [
      { cle: 'decisions', libelle: 'Décisions actives', valeur: decisions.length, unite: '', statut: 'vert', detail: 'Toutes origines (crowdsec, CAPI, cscli)' },
      { cle: 'bans', libelle: 'Bannissements', valeur: bans.length, unite: '', statut: 'vert', detail: 'Adresses bloquées en ce moment' },
      { cle: 'scenarios', libelle: 'Scénarios distincts', valeur: scenarios.size, unite: '', statut: 'vert', detail: 'ssh-bf, http-probing…' },
    ],
    lignes: [...decisions]
      .sort((a, b) => b.id - a.id)
      .slice(0, 15)
      .map((d) => ({
        libelle: d.value,
        detail: `${d.scenario} · ${d.type} ${d.duration} · ${d.origin}`,
        statut: 'vert',
        lien: null,
        t: d.until ? Date.parse(d.until) || null : null,
      })),
    lien,
    verifie: [{ cle: 'securite:ssh-echecs', statut: 'vert', detail: `CrowdSec actif, ${decisions.length} décision(s)` }],
  };
}

export const crowdsec: SourceSignal = {
  cle: 'crowdsec',
  nom: 'CrowdSec',
  categorie: 'securite',
  variables: 'CROWDSEC_URL, CROWDSEC_CLE',
  url: () => config.crowdsecUrl || null,
  configure: () => !!(config.crowdsecUrl && config.crowdsecCle),
  async lire() {
    // L'API renvoie `null` (corps vide) quand il n'y a aucune décision.
    const d = await lireJson<DecisionCS[] | null>(`${config.crowdsecUrl}/v1/decisions`, { headers: { 'x-api-key': config.crowdsecCle } });
    return lectureCrowdsec(d ?? [], config.crowdsecUrl);
  },
  demo: () =>
    lectureCrowdsec(
      [
        {
          id: 3812,
          origin: 'crowdsec',
          scenario: 'crowdsecurity/ssh-bf',
          scope: 'Ip',
          value: '45.142.212.61',
          type: 'ban',
          duration: '3h42m',
          until: new Date(Date.now() + 3.7 * 3_600_000).toISOString(),
        },
        { id: 3811, origin: 'CAPI', scenario: 'crowdsecurity/http-probing', scope: 'Ip', value: '185.220.101.7', type: 'ban', duration: '23h59m' },
        { id: 3790, origin: 'crowdsec', scenario: 'crowdsecurity/http-bad-user-agent', scope: 'Ip', value: '103.21.244.15', type: 'ban', duration: '1h10m' },
      ],
      null,
    ),
};
