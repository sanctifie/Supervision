import { config } from '../../config';
import { lireJson } from '../../fournisseurs/clients';
import type { LectureSignal } from '../../../../shared/outils';
import { nombre } from '../../../../shared/format';
import type { SourceSignal } from './signal';

/** Hetzner Cloud : inventaire des serveurs et coût mensuel estimé (API, jeton de projet). Lecture seule. */

interface ServeurHetzner {
  id: number;
  name: string;
  status: string;
  public_net?: { ipv4?: { ip?: string } };
  datacenter?: { location?: { name?: string; city?: string } };
  server_type?: { name?: string; cores?: number; memory?: number; disk?: number; prices?: { location: string; price_monthly: { gross: string } }[] };
  created?: string;
}

export function prixMensuel(s: ServeurHetzner): number {
  const prix = s.server_type?.prices ?? [];
  const local = prix.find((p) => p.location === s.datacenter?.location?.name) ?? prix[0];
  return local ? Number(local.price_monthly.gross) || 0 : 0;
}

export function lectureHetzner(serveurs: ServeurHetzner[]): LectureSignal {
  const enMarche = serveurs.filter((s) => s.status === 'running').length;
  const cout = serveurs.reduce((x, s) => x + prixMensuel(s), 0);
  const coeurs = serveurs.reduce((x, s) => x + (s.server_type?.cores ?? 0), 0);
  const arretes = serveurs.length - enMarche;
  return {
    statut: serveurs.length ? (arretes ? 'orange' : 'vert') : 'inconnu',
    resume: serveurs.length ? `${enMarche}/${serveurs.length} serveur(s) en marche · ${nombre(cout, 2)} €/mois` : 'Aucun serveur',
    mesures: [
      { cle: 'serveurs', libelle: 'Serveurs', valeur: serveurs.length, unite: '', statut: serveurs.length ? 'vert' : 'inconnu', detail: 'Dans le projet Hetzner' },
      { cle: 'en-marche', libelle: 'En marche', valeur: enMarche, unite: '', statut: arretes ? 'orange' : 'vert', detail: 'Statut running' },
      { cle: 'cout', libelle: 'Coût mensuel estimé', valeur: cout, unite: '€', statut: 'vert', detail: 'Prix TTC des types de serveur' },
      { cle: 'coeurs', libelle: 'Cœurs', valeur: coeurs, unite: '', statut: 'vert', detail: 'Total des vCPU' },
    ],
    // Pas d'action : redémarrer ou éteindre un serveur depuis la supervision est trop risqué pour l'officine.
    lignes: serveurs.map((s) => ({
      libelle: s.name,
      detail: `${s.server_type?.name ?? '?'} · ${s.datacenter?.location?.city ?? '?'} · ${s.public_net?.ipv4?.ip ?? '—'} · ${s.status} · ${nombre(prixMensuel(s), 2)} €/mois`,
      statut: s.status === 'running' ? 'vert' : 'orange',
      lien: `https://console.hetzner.cloud/projects`,
      t: s.created ? Date.parse(s.created) || null : null,
    })),
    lien: 'https://console.hetzner.cloud',
    verifie: serveurs.length
      ? [
          { cle: 'automatisation:inventaire', statut: 'vert', detail: `${serveurs.length} serveur(s) inventorié(s)` },
          { cle: 'automatisation:couts', statut: 'vert', detail: `coût estimé ${nombre(cout, 2)} €/mois` },
          { cle: 'automatisation:scalabilite', statut: 'vert', detail: 'redimensionnement possible depuis la console' },
        ]
      : [],
  };
}

export const hetzner: SourceSignal = {
  cle: 'hetzner',
  nom: 'Hetzner Cloud',
  categorie: 'infrastructure',
  variables: 'HETZNER_JETON',
  url: () => 'https://console.hetzner.cloud',
  configure: () => !!config.hetznerJeton,
  async lire() {
    const r = await lireJson<{ servers?: ServeurHetzner[] }>('https://api.hetzner.cloud/v1/servers?per_page=50', { headers: { authorization: `Bearer ${config.hetznerJeton}` } });
    return lectureHetzner(r.servers ?? []);
  },
  demo() {
    return lectureHetzner([
      {
        id: 1,
        name: 'officina-libreville-01',
        status: 'running',
        public_net: { ipv4: { ip: '116.203.10.42' } },
        datacenter: { location: { name: 'fsn1', city: 'Falkenstein' } },
        server_type: { name: 'cx32', cores: 4, memory: 8, disk: 80, prices: [{ location: 'fsn1', price_monthly: { gross: '8.0920' } }] },
        created: '2026-02-10T09:00:00Z',
      },
    ]);
  },
};
