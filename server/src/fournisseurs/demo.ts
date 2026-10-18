import { randomUUID } from 'node:crypto';
import type { Fournisseur } from './fournisseur';
import type {
  BrutAlerte,
  BrutApplication,
  BrutBdd,
  BrutConteneur,
  BrutMetier,
  BrutSauvegardes,
  BrutServeur,
  BrutServices,
  FiltreJournaux,
  LigneJournal,
  Point,
  Silence,
} from '../../../shared/types';

/**
 * Données de démonstration : une officine de Libreville un jour ordinaire.
 *
 * Les valeurs sont **déterministes** (fonction de l'heure) : deux
 * rafraîchissements successifs se suivent, les courbes sont continues.
 * Scénario mis en scène pour montrer chaque couleur :
 * - le disque « / » est à 86 % → orange, alerte « DisquePresquePlein » ;
 * - le certificat HTTPS expire dans 19 jours → orange (J-30) ;
 * - toutes les 3 heures, le service « notify » tombe 12 minutes → rouge,
 *   alerte critique, incident ouvert automatiquement puis résolu.
 */

export const SERVICES_OFFICINA = [
  'gateway',
  'identity',
  'catalog',
  'inventory',
  'syncd',
  'sales',
  'regulatory',
  'purchasing',
  'insurance',
  'billing',
  'ledger',
  'payments',
  'notify',
  'hr',
  'documents',
];

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** Bruit pseudo-aléatoire stable dans [-1, 1] pour (graine, instant). */
function bruit(graine: number, t: number, pas = MINUTE): number {
  let x = Math.floor(t / pas) * 374761393 + graine * 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 2000) / 1000 - 1;
}

/** Heure locale de Libreville (UTC+1), en heures décimales. */
function heureLocale(t: number): number {
  return ((((t + HEURE) % JOUR) + JOUR) % JOUR) / HEURE;
}

/** Activité de l'officine : 0 la nuit, 1 en pointe (10 h et 17 h). */
function affluence(t: number): number {
  const h = heureLocale(t);
  if (h < 7.5 || h > 21.5) return 0.04;
  const matin = Math.exp(-((h - 10) ** 2) / 3);
  const soir = Math.exp(-((h - 17.5) ** 2) / 4);
  return 0.15 + 0.85 * Math.max(matin, soir);
}

/** Panne simulée de « notify » : 12 minutes toutes les 3 heures. */
export function notifyEnPanne(t: number): boolean {
  return t % (3 * HEURE) < 12 * MINUTE;
}
function debutPanne(t: number): number {
  return t - (t % (3 * HEURE));
}

function serie(heures: number, pas: number, f: (t: number) => number): Point[] {
  const fin = Math.floor(Date.now() / pas) * pas;
  const points: Point[] = [];
  for (let t = fin - heures * HEURE; t <= fin; t += pas) points.push({ t, v: f(t) });
  return points;
}

const cpu = (t: number) => Math.min(99, 18 + 45 * affluence(t) + 6 * bruit(1, t));
const memoire = (t: number) => 61 + 9 * affluence(t) + 2 * bruit(2, t);
/** Le disque se remplit doucement : 0,9 point par jour. */
const disque = (t: number) => 86 - ((Date.now() - t) / JOUR) * 0.9 + 0.1 * bruit(3, t);
const debit = (t: number) => Math.max(0.05, 0.3 + 9 * affluence(t) * (1 + 0.15 * bruit(4, t)));
const debitJ7 = (t: number) => Math.max(0.05, 0.3 + 8.4 * affluence(t) * (1 + 0.15 * bruit(5, t)));
const ventesHeure = (t: number) => Math.round(Math.max(0, 62 * affluence(t) * (1 + 0.2 * bruit(6, t))));

export class FournisseurDemo implements Fournisseur {
  readonly mode = 'demo' as const;
  private silencesEnMemoire: Silence[] = [];
  private alerteTest: BrutAlerte | null = null;

  async serveur(): Promise<BrutServeur> {
    const t = Date.now();
    return {
      hote: 'officina-libreville-01',
      coeurs: 4,
      cpuPct: cpu(t),
      iowaitPct: 1.2 + bruit(7, t),
      stealPct: 0.4,
      chargeParCoeur: 0.2 + affluence(t) * 0.6,
      memoirePct: memoire(t),
      memoireTotaleOctets: 8 * 1024 ** 3,
      swapPct: 3.1,
      oom1h: 0,
      partitions: [
        { point: '/', utilisePct: disque(t), inodesPct: 22.4, tailleOctets: 80 * 1024 ** 3, joursAvantPlein: 15.5 },
        { point: '/boot', utilisePct: 31.2, inodesPct: 0.4, tailleOctets: 1024 ** 3, joursAvantPlein: null },
        { point: '/var/backups', utilisePct: 58.3, inodesPct: 1.1, tailleOctets: 200 * 1024 ** 3, joursAvantPlein: 64 },
      ],
      disqueLatenceMs: 2.4 + 1.5 * affluence(t),
      disqueOccupePct: 6 + 10 * affluence(t),
      descripteursPct: 3.2,
      processus: 214,
      zombies: 0,
      uptimeSecondes: 23 * 86400 + 4 * 3600,
      redemarrageRequis: false,
      derivHorlogeSecondes: 0.0021,
      horlogeSynchronisee: true,
      reseau: {
        entreeOctetsS: 40_000 + 900_000 * affluence(t),
        sortieOctetsS: 80_000 + 2_400_000 * affluence(t),
        erreursS: 0,
        pertesS: 0,
        tcpEtablies: Math.round(30 + 160 * affluence(t)),
        tcpTimeWait: Math.round(12 + 80 * affluence(t)),
      },
      series: {
        cpu: serie(6, 3 * MINUTE, cpu),
        memoire: serie(6, 3 * MINUTE, memoire),
        disque: serie(24, 12 * MINUTE, disque),
        reseauEntree: serie(6, 3 * MINUTE, (x) => 40_000 + 900_000 * affluence(x) * (1 + 0.2 * bruit(8, x))),
        reseauSortie: serie(6, 3 * MINUTE, (x) => 80_000 + 2_400_000 * affluence(x) * (1 + 0.2 * bruit(9, x))),
      },
    };
  }

  async images(): Promise<Record<string, string>> {
    const tiers: Record<string, string> = { postgres: 'postgres:16.4', redis: 'redis:7.4', nats: 'nats:2.10', caddy: 'caddy:2.8' };
    return { ...Object.fromEntries(SERVICES_OFFICINA.map((s) => [s, `officina/${s}:1.8.3`])), ...tiers };
  }

  async conteneurs(): Promise<BrutConteneur[]> {
    const t = Date.now();
    const panne = notifyEnPanne(t);
    const memoires: Record<string, number> = {
      postgres: 620,
      redis: 48,
      nats: 34,
      caddy: 42,
      syncd: 38,
      prometheus: 410,
      grafana: 160,
      loki: 290,
      alloy: 120,
    };
    const noms = [...SERVICES_OFFICINA, 'postgres', 'redis', 'nats', 'caddy', 'prometheus', 'alertmanager', 'grafana', 'loki', 'alloy'];
    return noms.sort().map((nom, i) => {
      const enPanne = nom === 'notify' && panne;
      const mo = memoires[nom] ?? 95 + ((i * 37) % 80);
      return {
        nom,
        cpuPct: enPanne ? 0 : Math.max(0.1, (nom === 'gateway' || nom === 'sales' ? 9 : 2) * affluence(t) + bruit(10 + i, t)),
        memoireOctets: enPanne ? 0 : (mo + 8 * bruit(30 + i, t)) * 1024 ** 2,
        limiteOctets: nom === 'prometheus' ? 768 * 1024 ** 2 : nom === 'loki' ? 512 * 1024 ** 2 : nom === 'grafana' ? 384 * 1024 ** 2 : null,
        redemarrages1h: enPanne ? 3 : 0,
        enMarche: !enPanne,
      };
    });
  }

  async services(): Promise<BrutServices> {
    const t = Date.now();
    const panne = notifyEnPanne(t);
    return {
      internes: SERVICES_OFFICINA.map((service, i) => ({
        service,
        ok: !(service === 'notify' && panne),
        dureeMs: service === 'notify' && panne ? 5000 : 4 + ((i * 7) % 18) + 3 * bruit(40 + i, t),
      })),
      publiques: ['/health', '/officine/', '/comptoir/'].map((chemin, i) => ({
        url: `https://officina-libreville.ga${chemin}`,
        ok: true,
        code: 200,
        dureeMs: 140 + 40 * i + 25 * bruit(50 + i, t),
        joursCertificat: 19.4,
      })),
      disponibilite30j: 0.9987,
      serieDisponibilite: serie(24 * 7, HEURE, (x) => (x % (3 * HEURE) < HEURE && bruit(60, x) > 0.85 ? 0.97 : 1)),
    };
  }

  async application(): Promise<BrutApplication> {
    const t = Date.now();
    const a = affluence(t);
    const poids: Record<string, number> = {
      sales: 0.24,
      catalog: 0.18,
      inventory: 0.14,
      syncd: 0.16,
      identity: 0.06,
      regulatory: 0.04,
      purchasing: 0.03,
      insurance: 0.04,
      billing: 0.03,
      ledger: 0.02,
      payments: 0.03,
      notify: 0.01,
      hr: 0.01,
      documents: 0.01,
    };
    const total = debit(t);
    return {
      routes: Object.entries(poids).map(([service, w], i) => {
        const base = service === 'documents' ? 190 : service === 'ledger' ? 160 : service === 'syncd' ? 90 : 35 + 12 * (i % 4);
        const lent = service === 'notify' && notifyEnPanne(t);
        return {
          service,
          debitRps: total * w,
          erreurs5xx: lent ? 0.42 : service === 'payments' ? 0.004 : 0.0008 * (1 + bruit(70 + i, t)),
          refus4xx: service === 'identity' ? 0.018 : 0.002,
          p50: base * (1 + 0.3 * a),
          p95: lent ? 5000 : base * 3.1 * (1 + 0.4 * a),
          p99: lent ? 5000 : base * 5.4 * (1 + 0.5 * a),
        };
      }),
      debitTotalRps: total,
      debitJ7Rps: debitJ7(t),
      runtime: {
        eventLoopLagS: 0.012 + 0.02 * a,
        heapOctets: (92 + 30 * a) * 1024 ** 2,
        memoireOctets: (168 + 40 * a) * 1024 ** 2,
        handles: Math.round(40 + 60 * a),
        gcSecondesParS: 0.004 + 0.01 * a,
        redemarrages24h: 0,
      },
      series: {
        debit: serie(24, 15 * MINUTE, debit),
        debitJ7: serie(24, 15 * MINUTE, debitJ7),
        erreurs: serie(24, 15 * MINUTE, (x) => (notifyEnPanne(x) ? 2.6 : 0.08 + 0.06 * bruit(80, x))),
        p95: serie(24, 15 * MINUTE, (x) => 120 + 220 * affluence(x) + 30 * bruit(81, x)),
      },
    };
  }

  async bdd(): Promise<BrutBdd> {
    const t = Date.now();
    const bases = [
      'identity_db',
      'catalog_db',
      'inventory_db',
      'sales_db',
      'regulatory_db',
      'purchasing_db',
      'insurance_db',
      'billing_db',
      'ledger_db',
      'payments_db',
      'notify_db',
      'hr_db',
      'documents_db',
    ];
    const tailles = [38, 412, 286, 1240, 96, 74, 61, 88, 530, 44, 120, 27, 690];
    return {
      enMarche: true,
      connexions: Math.round(26 + 34 * affluence(t)),
      connexionsMax: 200,
      deadlocksParMin: 0,
      cacheHit: 0.993,
      verrous: Math.round(8 + 20 * affluence(t)),
      bases: bases.map((nom, i) => ({ nom, tailleOctets: tailles[i] * 1024 ** 2 })).sort((a, b) => b.tailleOctets - a.tailleOctets),
      serieConnexions: serie(24, 15 * MINUTE, (x) => Math.round(26 + 34 * affluence(x) + 3 * bruit(90, x))),
    };
  }

  async metier(): Promise<BrutMetier> {
    const t = Date.now();
    const debutJour = t - ((((t + HEURE) % JOUR) + JOUR) % JOUR);
    let jour = 0;
    for (let x = debutJour; x < t; x += HEURE) jour += ventesHeure(x);
    return {
      ventesHeure: ventesHeure(t),
      ventesJour: jour,
      ventesJ7MemeHeure: Math.round(58 * affluence(t)),
      connexionsRefusees1h: Math.round(3 + 4 * affluence(t)),
      serieVentes: serie(24, 30 * MINUTE, ventesHeure),
      serieVentesJ7: serie(24, 30 * MINUTE, (x) => Math.round(58 * affluence(x))),
    };
  }

  async sauvegardes(): Promise<BrutSauvegardes> {
    // Sauvegarde chaque nuit à 2 h 30 (heure de Libreville).
    const t = Date.now();
    const h = heureLocale(t);
    const depuis = h >= 2.5 ? h - 2.5 : h + 21.5;
    return { derniereReussite: t - depuis * HEURE, tailleOctets: 3.7 * 1024 ** 3 };
  }

  async alertes(): Promise<BrutAlerte[]> {
    const t = Date.now();
    const alertes: BrutAlerte[] = [
      {
        id: 'demo-disque',
        nom: 'DisquePresquePlein',
        gravite: 'attention',
        resume: 'Il reste 14 % du disque',
        action: 'docker system prune ; vérifier backups/ et la rétention des sauvegardes',
        debut: t - 5 * HEURE - 12 * MINUTE,
        labels: { alertname: 'DisquePresquePlein', gravite: 'attention', instance: 'node-exporter:9100', job: 'machine' },
        silencieuse: false,
      },
    ];
    if (notifyEnPanne(t) && t - debutPanne(t) > 2 * MINUTE) {
      alertes.push({
        id: `demo-notify-${debutPanne(t)}`,
        nom: 'ServiceInjoignable',
        gravite: 'critique',
        resume: 'Le service notify ne répond plus',
        action: 'docker compose logs --tail=100 notify puis docker compose up -d notify',
        debut: debutPanne(t) + 2 * MINUTE,
        labels: { alertname: 'ServiceInjoignable', gravite: 'critique', service: 'notify', job: 'sondes-internes' },
        silencieuse: false,
      });
    }
    const maintenant = Date.now();
    if (this.alerteTest && maintenant - this.alerteTest.debut < 5 * MINUTE) alertes.push(this.alerteTest);
    this.silencesEnMemoire = this.silencesEnMemoire.filter((s) => s.fin > maintenant);
    return alertes.map((a) => ({
      ...a,
      silencieuse: this.silencesEnMemoire.some((s) => s.correspondances.every((c) => a.labels[c.nom] === c.valeur)),
    }));
  }

  async silences(): Promise<Silence[]> {
    const maintenant = Date.now();
    return this.silencesEnMemoire.filter((s) => s.fin > maintenant);
  }

  async creerSilence(s: Omit<Silence, 'id'>): Promise<string> {
    const id = randomUUID();
    this.silencesEnMemoire.push({ ...s, id });
    return id;
  }

  async supprimerSilence(id: string): Promise<void> {
    this.silencesEnMemoire = this.silencesEnMemoire.filter((s) => s.id !== id);
  }

  async envoyerAlerteTest(auteur: string): Promise<void> {
    this.alerteTest = {
      id: `demo-test-${Date.now()}`,
      nom: 'TestSupervision',
      gravite: 'info',
      priorite: 'Info',
      resume: `Message de test envoyé depuis la supervision par ${auteur}`,
      action: 'Vérifier la réception sur Telegram / e-mail.',
      debut: Date.now(),
      labels: { alertname: 'TestSupervision', gravite: 'info' },
      silencieuse: false,
    };
  }

  async journaux(f: FiltreJournaux): Promise<LigneJournal[]> {
    const t = Date.now();
    const lignes: LigneJournal[] = [];
    const minutes = f.minutes ?? 60;
    const modeles: [string, LigneJournal['niveau'], string][] = [
      ['sales', 'info', 'POST /v1/sales 201 — vente enregistrée ({n} lignes, {m} FCFA)'],
      ['catalog', 'info', 'GET /v1/catalog/products?q=para 200 — {d} ms'],
      ['inventory', 'info', 'Mouvement de stock FEFO appliqué (lot L{n}{m})'],
      ['syncd', 'info', 'Poste comptoir-{n} synchronisé : {m} événements poussés'],
      ['identity', 'warn', 'Connexion refusée : PIN incorrect (poste comptoir-{n})'],
      ['payments', 'info', 'Callback Airtel Money reçu et vérifié (signature OK)'],
      ['payments', 'warn', 'Transaction Moov Money en attente depuis {d} s'],
      ['gateway', 'info', 'GET /v1/inventory/alerts 200 — {d} ms'],
      ['insurance', 'info', 'Prise en charge CNAMGS calculée (taux {n}0 %)'],
      ['ledger', 'info', 'Écriture SYSCOHADA équilibrée — journal VT'],
      ['notify', 'info', 'SMS de rappel envoyé (fournisseur : réponse 200)'],
      ['caddy', 'info', 'handled request uri=/comptoir/ status=200 duration={d}ms'],
      ['postgres', 'info', 'checkpoint complete: wrote {n}{m} buffers'],
    ];
    for (let x = t; x > t - minutes * MINUTE && lignes.length < (f.limite ?? 200) * 3; x -= 17_000) {
      const i = Math.abs(Math.floor(bruit(100, x, 1000) * 1000)) % modeles.length;
      const [service, niveau, gabarit] = modeles[i];
      const panne = notifyEnPanne(x);
      const n = 1 + (Math.abs(Math.floor(bruit(101, x, 1000) * 9)) % 9);
      const m = Math.abs(Math.floor(bruit(102, x, 1000) * 90000)) % 90000;
      const d = 8 + (Math.abs(Math.floor(bruit(103, x, 1000) * 200)) % 200);
      if (panne && i % 3 === 0) {
        lignes.push({ t: x, service: 'notify', niveau: 'error', message: 'ECONNREFUSED nats:4222 — impossible de publier sur le bus, nouvel essai dans 5 s' });
        lignes.push({ t: x - 400, service: 'gateway', niveau: 'error', message: 'POST /v1/notify/sms 502 — upstream notify injoignable (timeout 5000 ms)' });
        continue;
      }
      lignes.push({
        t: x,
        service,
        niveau,
        message: gabarit.replace('{n}', String(n)).replace('{m}', String(m)).replace('{d}', String(d)),
      });
    }
    const ordre = { debug: 0, info: 1, warn: 2, error: 3 };
    return lignes
      .filter((l) => !f.service || l.service === f.service)
      .filter((l) => !f.niveau || ordre[l.niveau] >= ordre[f.niveau as keyof typeof ordre])
      .filter((l) => !f.texte || l.message.toLowerCase().includes(f.texte.toLowerCase()))
      .slice(0, f.limite ?? 200);
  }

  async disponibilite() {
    return { prometheus: true, alertmanager: true, loki: true };
  }
}
