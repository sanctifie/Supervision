import { config } from '../../config';
import { lireJson } from '../../fournisseurs/clients';
import type { LectureSignal } from '../../../../shared/outils';
import type { Statut } from '../../../../shared/types';
import type { SourceSignal } from './signal';

/**
 * Wazuh : état des agents, par l'API du manager (port 55000).
 * shortcut: TLS vérifié ; un certificat auto-signé exige NODE_EXTRA_CA_CERTS sur le conteneur, sinon « fetch failed ».
 */

export interface ResumeAgents {
  active: number;
  disconnected: number;
  never_connected: number;
  pending: number;
  total: number;
}
export interface AgentWazuh {
  id: string;
  name: string;
  ip?: string;
  lastKeepAlive?: string;
}

export function lectureWazuh(r: ResumeAgents, deconnectes: AgentWazuh[], lien: string | null): LectureSignal {
  const statut: Statut = !r.active ? 'rouge' : r.disconnected ? 'orange' : 'vert';
  return {
    statut,
    resume: `${r.active} agent(s) actif(s), ${r.disconnected} déconnecté(s)`,
    mesures: [
      { cle: 'actifs', libelle: 'Agents actifs', valeur: r.active, unite: '', statut: r.active ? 'vert' : 'rouge', detail: 'Remontent SSH, intégrité, vulnérabilités' },
      { cle: 'deconnectes', libelle: 'Déconnectés', valeur: r.disconnected, unite: '', statut: r.disconnected ? 'orange' : 'vert', detail: 'Plus de nouvelles depuis le délai' },
      { cle: 'jamais', libelle: 'Jamais connectés', valeur: r.never_connected, unite: '', statut: r.never_connected ? 'orange' : 'vert', detail: 'Enregistrés mais muets' },
    ],
    lignes: deconnectes.map((a) => ({
      libelle: a.name,
      detail: `${a.ip ?? ''} · déconnecté`,
      statut: 'orange',
      lien: null,
      t: a.lastKeepAlive ? Date.parse(a.lastKeepAlive) || null : null,
    })),
    lien,
    verifie: r.active
      ? [
          { cle: 'securite:ssh-echecs', statut: 'vert', detail: `${r.active} agent(s) Wazuh actif(s)` },
          { cle: 'securite:integrite', statut: 'vert', detail: `Intégrité des fichiers suivie par ${r.active} agent(s)` },
        ]
      : [],
  };
}

export const wazuh: SourceSignal = {
  cle: 'wazuh',
  nom: 'Wazuh',
  categorie: 'securite',
  variables: 'WAZUH_URL, WAZUH_UTILISATEUR, WAZUH_MOT_DE_PASSE',
  url: () => config.wazuhUrl || null,
  configure: () => !!(config.wazuhUrl && config.wazuhUtilisateur && config.wazuhMotDePasse),
  async lire() {
    const basic = Buffer.from(`${config.wazuhUtilisateur}:${config.wazuhMotDePasse}`).toString('base64');
    const auth = await lireJson<{ data: { token: string } }>(`${config.wazuhUrl}/security/user/authenticate`, { method: 'POST', headers: { authorization: `Basic ${basic}` } });
    const entetes = { authorization: `Bearer ${auth.data.token}` };
    const [resume, agents] = await Promise.all([
      lireJson<{ data: { connection: ResumeAgents } }>(`${config.wazuhUrl}/agents/summary/status`, { headers: entetes }),
      lireJson<{ data: { affected_items: AgentWazuh[] } }>(`${config.wazuhUrl}/agents?status=disconnected&limit=20&select=name,ip,lastKeepAlive`, { headers: entetes }),
    ]);
    return lectureWazuh(resume.data.connection, agents.data.affected_items ?? [], config.wazuhUrl);
  },
  demo: () => lectureWazuh({ active: 2, disconnected: 0, never_connected: 0, pending: 0, total: 2 }, [], null),
};
