import type { Fournisseur } from './fournisseur';
import { alertmanager, loki, prometheus } from './clients';
import type {
  BrutAlerte,
  BrutApplication,
  BrutBdd,
  BrutConteneur,
  BrutMetier,
  BrutPartition,
  BrutSauvegardes,
  BrutServeur,
  BrutServices,
  FiltreJournaux,
  LigneJournal,
  Silence,
} from '../../../shared/types';

/**
 * Lit la supervision d'Officina telle qu'elle est installée par
 * `supervision/docker-compose.supervision.yml` (dépôt Pharmatech) :
 * node-exporter (job « machine »), cAdvisor (« conteneurs »), postgres-exporter,
 * blackbox (« sondes-internes », « site-public ») et les mesures du gateway
 * (`officine_*`).
 *
 * Une mesure absente (exporteur non installé) donne `null` : l'interface
 * l'affiche « Non mesuré » au lieu d'inventer une valeur.
 */

const p = prometheus;
const FS = 'fstype!~"tmpfs|overlay|squashfs|ramfs|nsfs|devtmpfs"';
const IFACES = 'device!~"lo|veth.*|br-.*|docker.*|virbr.*"';
const SERVICE_CONTENEUR = 'container_label_com_docker_compose_service';

const ms = (v: number | null) => (v === null ? null : v * 1000);

export class FournisseurReel implements Fournisseur {
  readonly mode = 'reel' as const;

  async serveur(): Promise<BrutServeur> {
    const [
      hote,
      coeurs,
      cpu,
      iowait,
      steal,
      charge,
      memoire,
      memTotale,
      swap,
      oom,
      latence,
      occupe,
      fd,
      processus,
      zombies,
      uptime,
      reboot,
      derive,
      synchro,
      entree,
      sortie,
      erreurs,
      pertes,
      tcp,
      tw,
    ] = await Promise.all([
      p.requete('node_uname_info').then((r) => r[0]?.metric.nodename ?? 'serveur').catch(() => 'serveur'),
      p.valeur('count(count by (cpu) (node_cpu_seconds_total))'),
      p.valeur('100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))'),
      p.valeur('100 * avg(rate(node_cpu_seconds_total{mode="iowait"}[5m]))'),
      p.valeur('100 * avg(rate(node_cpu_seconds_total{mode="steal"}[5m]))'),
      p.valeur('node_load5 / count(count by (cpu) (node_cpu_seconds_total))'),
      p.valeur('100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)'),
      p.valeur('node_memory_MemTotal_bytes'),
      p.valeur('100 * (1 - node_memory_SwapFree_bytes / (node_memory_SwapTotal_bytes > 0))'),
      p.valeur('increase(node_vmstat_oom_kill[1h])'),
      p.valeur(
        '1000 * max((rate(node_disk_read_time_seconds_total[5m]) + rate(node_disk_write_time_seconds_total[5m])) / ' +
          '((rate(node_disk_reads_completed_total[5m]) + rate(node_disk_writes_completed_total[5m])) > 0))',
      ),
      p.valeur('100 * max(rate(node_disk_io_time_seconds_total[5m]))'),
      p.valeur('100 * node_filefd_allocated / node_filefd_maximum'),
      p.valeur('sum(node_processes_state)'),
      p.valeur('node_processes_state{state="Z"}'),
      p.valeur('time() - node_boot_time_seconds'),
      p.valeur('max(node_reboot_required)'),
      p.valeur('abs(node_timex_offset_seconds)'),
      p.valeur('node_timex_sync_status'),
      p.valeur(`sum(rate(node_network_receive_bytes_total{${IFACES}}[5m]))`),
      p.valeur(`sum(rate(node_network_transmit_bytes_total{${IFACES}}[5m]))`),
      p.valeur(`sum(rate(node_network_receive_errs_total{${IFACES}}[5m]) + rate(node_network_transmit_errs_total{${IFACES}}[5m]))`),
      p.valeur(`sum(rate(node_network_receive_drop_total{${IFACES}}[5m]) + rate(node_network_transmit_drop_total{${IFACES}}[5m]))`),
      p.valeur('node_netstat_Tcp_CurrEstab'),
      p.valeur('node_sockstat_TCP_tw'),
    ]);

    const [utilise, inodes, taille, remplissage] = await Promise.all([
      p.parEtiquette(`100 * (1 - node_filesystem_avail_bytes{${FS}} / node_filesystem_size_bytes{${FS}})`, 'mountpoint'),
      p.parEtiquette(`100 * (1 - node_filesystem_files_free{${FS}} / (node_filesystem_files{${FS}} > 0))`, 'mountpoint'),
      p.parEtiquette(`node_filesystem_size_bytes{${FS}}`, 'mountpoint'),
      // Pente sur 6 h : octets perdus par seconde (positif = se remplit).
      p.parEtiquette(`-deriv(node_filesystem_avail_bytes{${FS}}[6h])`, 'mountpoint'),
    ]);
    const libres = await p.parEtiquette(`node_filesystem_avail_bytes{${FS}}`, 'mountpoint');
    const partitions: BrutPartition[] = Object.keys(utilise)
      .sort()
      .map((point) => {
        const pente = remplissage[point];
        const jours = pente && pente > 0 && libres[point] !== undefined ? libres[point] / pente / 86400 : null;
        return {
          point,
          utilisePct: utilise[point] ?? null,
          inodesPct: inodes[point] ?? null,
          tailleOctets: taille[point] ?? null,
          joursAvantPlein: jours,
        };
      });

    const [sCpu, sMem, sDisque, sEntree, sSortie] = await Promise.all([
      p.serie('100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))'),
      p.serie('100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)'),
      p.serie('100 * (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})', 24),
      p.serie(`sum(rate(node_network_receive_bytes_total{${IFACES}}[5m]))`),
      p.serie(`sum(rate(node_network_transmit_bytes_total{${IFACES}}[5m]))`),
    ]);

    return {
      hote,
      coeurs,
      cpuPct: cpu,
      iowaitPct: iowait,
      stealPct: steal,
      chargeParCoeur: charge,
      memoirePct: memoire,
      memoireTotaleOctets: memTotale,
      swapPct: swap,
      oom1h: oom,
      partitions,
      disqueLatenceMs: latence,
      disqueOccupePct: occupe,
      descripteursPct: fd,
      processus,
      zombies,
      uptimeSecondes: uptime,
      redemarrageRequis: reboot === null ? null : reboot > 0,
      derivHorlogeSecondes: derive,
      horlogeSynchronisee: synchro === null ? null : synchro === 1,
      reseau: { entreeOctetsS: entree, sortieOctetsS: sortie, erreursS: erreurs, pertesS: pertes, tcpEtablies: tcp, tcpTimeWait: tw },
      series: { cpu: sCpu, memoire: sMem, disque: sDisque, reseauEntree: sEntree, reseauSortie: sSortie },
    };
  }

  async conteneurs(): Promise<BrutConteneur[]> {
    const filtre = `{${SERVICE_CONTENEUR}!=""}`;
    const [cpu, memoire, limite, redemarrages, vus] = await Promise.all([
      p.parEtiquette(`100 * sum by (${SERVICE_CONTENEUR}) (rate(container_cpu_usage_seconds_total${filtre}[5m]))`, SERVICE_CONTENEUR),
      p.parEtiquette(`sum by (${SERVICE_CONTENEUR}) (container_memory_working_set_bytes${filtre})`, SERVICE_CONTENEUR),
      p.parEtiquette(`max by (${SERVICE_CONTENEUR}) (container_spec_memory_limit_bytes${filtre} > 0)`, SERVICE_CONTENEUR),
      p.parEtiquette(`max by (${SERVICE_CONTENEUR}) (changes(container_start_time_seconds${filtre}[1h]))`, SERVICE_CONTENEUR),
      p.parEtiquette(`max by (${SERVICE_CONTENEUR}) (time() - container_last_seen${filtre})`, SERVICE_CONTENEUR),
    ]);
    return Object.keys({ ...memoire, ...vus })
      .filter(Boolean)
      .sort()
      .map((nom) => ({
        nom,
        cpuPct: cpu[nom] ?? null,
        memoireOctets: memoire[nom] ?? null,
        limiteOctets: limite[nom] ?? null,
        redemarrages1h: redemarrages[nom] ?? null,
        enMarche: (vus[nom] ?? 0) < 120,
      }));
  }

  async services(): Promise<BrutServices> {
    const [succes, duree, pubSucces, pubCode, pubDuree, certificat, dispo, serie] = await Promise.all([
      p.parEtiquette('probe_success{job="sondes-internes"}', 'service'),
      p.parEtiquette('probe_duration_seconds{job="sondes-internes"}', 'service'),
      p.parEtiquette('probe_success{job="site-public"}', 'instance'),
      p.parEtiquette('probe_http_status_code{job="site-public"}', 'instance'),
      p.parEtiquette('probe_duration_seconds{job="site-public"}', 'instance'),
      p.parEtiquette('(probe_ssl_earliest_cert_expiry{job="site-public"} - time()) / 86400', 'instance'),
      p.valeur('avg(avg_over_time(probe_success{job="site-public"}[30d]))'),
      p.serie('avg(avg_over_time(probe_success{job="site-public"}[1h]))', 24 * 7, 168),
    ]);
    return {
      internes: Object.keys(succes)
        .sort()
        .map((service) => ({ service, ok: succes[service] === 1, dureeMs: ms(duree[service] ?? null) })),
      publiques: Object.keys(pubSucces)
        .sort()
        .map((url) => ({
          url,
          ok: pubSucces[url] === 1,
          code: pubCode[url] ?? null,
          dureeMs: ms(pubDuree[url] ?? null),
          joursCertificat: certificat[url] ?? null,
        })),
      disponibilite30j: dispo,
      serieDisponibilite: serie,
    };
  }

  async application(): Promise<BrutApplication> {
    const R = 'officine_http_requetes_total';
    const H = 'officine_http_duree_secondes_bucket';
    const [debit, erreurs, refus, p50, p95, p99] = await Promise.all([
      p.parEtiquette(`sum by (service) (rate(${R}[5m]))`, 'service'),
      p.parEtiquette(`sum by (service) (rate(${R}{code=~"5.."}[5m])) / (sum by (service) (rate(${R}[5m])) > 0)`, 'service'),
      p.parEtiquette(`sum by (service) (rate(${R}{code=~"401|403|429"}[5m])) / (sum by (service) (rate(${R}[5m])) > 0)`, 'service'),
      p.parEtiquette(`histogram_quantile(0.5, sum by (le, service) (rate(${H}[5m])))`, 'service'),
      p.parEtiquette(`histogram_quantile(0.95, sum by (le, service) (rate(${H}[5m])))`, 'service'),
      p.parEtiquette(`histogram_quantile(0.99, sum by (le, service) (rate(${H}[5m])))`, 'service'),
    ]);
    const G = 'officine_gateway_';
    const [total, j7, lag, heap, rss, handles, gc, redemarrages] = await Promise.all([
      p.valeur(`sum(rate(${R}[5m]))`),
      p.valeur(`sum(rate(${R}[5m] offset 7d))`),
      p.valeur(`max(${G}nodejs_eventloop_lag_p99_seconds)`),
      p.valeur(`sum(${G}nodejs_heap_size_used_bytes)`),
      p.valeur(`sum(${G}process_resident_memory_bytes)`),
      p.valeur(`sum(${G}nodejs_active_handles_total)`),
      p.valeur(`sum(rate(${G}nodejs_gc_duration_seconds_sum[5m]))`),
      p.valeur(`sum(changes(${G}process_start_time_seconds[1d]))`),
    ]);
    const [sDebit, sJ7, sErreurs, sP95] = await Promise.all([
      p.serie(`sum(rate(${R}[5m]))`, 24),
      p.serie(`sum(rate(${R}[5m] offset 7d))`, 24),
      p.serie(`100 * sum(rate(${R}{code=~"5.."}[5m])) / (sum(rate(${R}[5m])) > 0)`, 24),
      p.serie(`1000 * histogram_quantile(0.95, sum by (le) (rate(${H}[5m])))`, 24),
    ]);
    return {
      routes: Object.keys(debit)
        .sort()
        .map((service) => ({
          service,
          debitRps: debit[service] ?? null,
          erreurs5xx: erreurs[service] ?? 0,
          refus4xx: refus[service] ?? 0,
          p50: ms(p50[service] ?? null),
          p95: ms(p95[service] ?? null),
          p99: ms(p99[service] ?? null),
        })),
      debitTotalRps: total,
      debitJ7Rps: j7,
      runtime: {
        eventLoopLagS: lag,
        heapOctets: heap,
        memoireOctets: rss,
        handles,
        gcSecondesParS: gc,
        redemarrages24h: redemarrages,
      },
      series: { debit: sDebit, debitJ7: sJ7, erreurs: sErreurs, p95: sP95 },
    };
  }

  async bdd(): Promise<BrutBdd> {
    const [up, connexions, max, deadlocks, cache, verrous, bases, serie] = await Promise.all([
      p.valeur('max(pg_up)'),
      p.valeur('sum(pg_stat_activity_count)'),
      p.valeur('max(pg_settings_max_connections)'),
      p.valeur('60 * sum(rate(pg_stat_database_deadlocks[5m]))'),
      p.valeur('sum(rate(pg_stat_database_blks_hit[10m])) / (sum(rate(pg_stat_database_blks_hit[10m])) + sum(rate(pg_stat_database_blks_read[10m])) > 0)'),
      p.valeur('sum(pg_locks_count)'),
      p.parEtiquette('pg_database_size_bytes{datname!~"template.*|postgres"}', 'datname'),
      p.serie('sum(pg_stat_activity_count)', 24),
    ]);
    return {
      enMarche: up === null ? null : up === 1,
      connexions,
      connexionsMax: max,
      deadlocksParMin: deadlocks,
      cacheHit: cache,
      verrous,
      bases: Object.entries(bases)
        .map(([nom, tailleOctets]) => ({ nom, tailleOctets }))
        .sort((a, b) => b.tailleOctets - a.tailleOctets),
      serieConnexions: serie,
    };
  }

  async metier(): Promise<BrutMetier> {
    const [heure, jour, j7, refus, serie, serieJ7] = await Promise.all([
      p.valeur('sum(increase(officine_ventes_total[1h]))'),
      p.valeur('sum(increase(officine_ventes_total[24h]))'),
      p.valeur('sum(increase(officine_ventes_total[1h] offset 7d))'),
      p.valeur('sum(increase(officine_connexions_refusees_total[1h]))'),
      p.serie('sum(increase(officine_ventes_total[1h]))', 24, 48),
      p.serie('sum(increase(officine_ventes_total[1h] offset 7d))', 24, 48),
    ]);
    return {
      ventesHeure: heure,
      ventesJour: jour,
      ventesJ7MemeHeure: j7,
      connexionsRefusees1h: refus,
      serieVentes: serie,
      serieVentesJ7: serieJ7,
    };
  }

  async sauvegardes(): Promise<BrutSauvegardes> {
    const [derniere, taille] = await Promise.all([
      p.valeur('max(officine_sauvegarde_derniere_reussite_secondes)'),
      p.valeur('max(officine_sauvegarde_taille_octets)'),
    ]);
    return { derniereReussite: derniere === null ? null : derniere * 1000, tailleOctets: taille };
  }

  async alertes(): Promise<BrutAlerte[]> {
    const brutes = await alertmanager.alertes();
    return brutes.map((a) => ({
      id: a.fingerprint,
      nom: a.labels.alertname ?? 'Alerte',
      gravite: a.labels.gravite ?? a.labels.severity ?? 'attention',
      priorite: a.labels.priorite,
      resume: a.annotations.resume ?? a.annotations.summary ?? a.annotations.description ?? '',
      action: a.annotations.action ?? a.annotations.runbook_url ?? '',
      debut: Date.parse(a.startsAt),
      labels: a.labels,
      silencieuse: a.status.state === 'suppressed' && a.status.silencedBy.length > 0,
    }));
  }

  async silences(): Promise<Silence[]> {
    const brutes = await alertmanager.silences();
    return brutes
      .filter((s) => s.status.state !== 'expired')
      .map((s) => ({
        id: s.id,
        commentaire: s.comment,
        auteur: s.createdBy,
        debut: Date.parse(s.startsAt),
        fin: Date.parse(s.endsAt),
        correspondances: s.matchers.map((m) => ({ nom: m.name, valeur: m.value })),
      }));
  }

  creerSilence(s: Omit<Silence, 'id'>): Promise<string> {
    return alertmanager.creerSilence({
      matchers: s.correspondances.map((m) => ({ name: m.nom, value: m.valeur, isRegex: false, isEqual: true })),
      startsAt: new Date(s.debut).toISOString(),
      endsAt: new Date(s.fin).toISOString(),
      createdBy: s.auteur,
      comment: s.commentaire,
    });
  }

  supprimerSilence(id: string): Promise<void> {
    return alertmanager.supprimerSilence(id);
  }

  envoyerAlerteTest(auteur: string): Promise<void> {
    const maintenant = Date.now();
    return alertmanager.envoyer([
      {
        labels: { alertname: 'TestSupervision', gravite: 'info', priorite: 'Info' },
        annotations: {
          resume: `Message de test envoyé depuis la supervision par ${auteur}`,
          action: 'Vérifier la réception sur Telegram / e-mail, puis cocher « Canal d’alerte testé ».',
        },
        startsAt: new Date(maintenant).toISOString(),
        endsAt: new Date(maintenant + 5 * 60_000).toISOString(),
      },
    ]);
  }

  async journaux(f: FiltreJournaux): Promise<LigneJournal[]> {
    const selecteur = f.service ? `{service="${echapper(f.service)}"}` : '{service=~".+"}';
    let logql = selecteur;
    if (f.niveau === 'error') logql += ' |~ "(?i)(error|erreur|fatal)"';
    else if (f.niveau === 'warn') logql += ' |~ "(?i)(warn|avertissement|error|erreur|fatal)"';
    if (f.texte) logql += ` |~ "(?i)${echapper(f.texte)}"`;
    const flux = await loki.requete(logql, f.minutes ?? 60, f.limite ?? 200);
    const lignes: LigneJournal[] = [];
    for (const s of flux) {
      for (const [ns, message] of s.values) {
        lignes.push({ t: Number(BigInt(ns) / 1_000_000n), service: s.stream.service ?? '?', niveau: niveauDe(message), message });
      }
    }
    return lignes.sort((a, b) => b.t - a.t).slice(0, f.limite ?? 200);
  }

  async disponibilite() {
    const [prom, am, lk] = await Promise.all([prometheus.joignable(), alertmanager.joignable(), loki.joignable()]);
    return { prometheus: prom, alertmanager: am, loki: lk };
  }
}

/** Échappe une saisie pour une chaîne LogQL / expression régulière. */
function echapper(texte: string): string {
  return texte.replace(/[\\"]/g, '\\$&').replace(/[.*+?^${}()|[\]]/g, '\\\\$&');
}

export function niveauDe(message: string): LigneJournal['niveau'] {
  // Journaux JSON (pino : level 30 = info, 40 = warn, 50 = error).
  const json = /"level"\s*:\s*(\d+|"\w+")/.exec(message);
  if (json) {
    const v = json[1].replace(/"/g, '').toLowerCase();
    const n = Number(v);
    if (n >= 50 || v === 'error' || v === 'fatal') return 'error';
    if (n === 40 || v === 'warn') return 'warn';
    if ((n && n <= 20) || v === 'debug' || v === 'trace') return 'debug';
    return 'info';
  }
  if (/\b(error|erreur|fatal|exception)\b/i.test(message)) return 'error';
  if (/\b(warn|warning|avertissement)\b/i.test(message)) return 'warn';
  if (/\bdebug\b/i.test(message)) return 'debug';
  return 'info';
}
