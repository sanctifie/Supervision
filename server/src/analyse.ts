import { SEUILS, evaluer, pire, type Seuil } from '../../shared/seuils';
import { runbookDe } from '../../shared/runbooks';
import type {
  Alerte,
  BrutAlerte,
  BrutApplication,
  BrutBdd,
  BrutConteneur,
  BrutMetier,
  BrutSauvegardes,
  BrutServeur,
  BrutServices,
  Mesure,
  Priorite,
  Statut,
  VueApplication,
  VueBdd,
  VueConteneurs,
  VueMetier,
  VueSauvegardes,
  VueServeur,
  VueServices,
} from '../../shared/types';

/**
 * Transforme les valeurs brutes en vues colorées, selon les seuils du guide.
 * Fonctions pures : testées sans serveur.
 */

function mesure(cle: string, libelle: string, valeur: number | null, unite: string, seuil?: Seuil, detail?: string, statutForce?: Statut): Mesure {
  return {
    cle,
    libelle,
    valeur,
    unite,
    statut: statutForce ?? (seuil ? evaluer(valeur, seuil) : valeur === null ? 'inconnu' : 'vert'),
    detail,
    seuilWarning: seuil?.libelleWarning,
    seuilCritique: seuil?.libelleCritique,
  };
}

const statutGlobal = (mesures: { statut: Statut }[]) => pire('vert', ...mesures.map((m) => m.statut));

export function analyserServeur(b: BrutServeur): VueServeur {
  const partitions = b.partitions.map((p) => ({
    ...p,
    statut: pire(evaluer(p.utilisePct, SEUILS.disque), evaluer(p.inodesPct, SEUILS.inodes), p.joursAvantPlein !== null && p.joursAvantPlein < 1 ? 'rouge' : 'vert'),
  }));

  const oom = b.oom1h === null ? 'inconnu' : b.oom1h > 0 ? 'rouge' : 'vert';
  const groupes = [
    {
      titre: 'Processeur et mémoire',
      mesures: [
        mesure('cpu', 'Processeur', b.cpuPct, '%', SEUILS.cpu, 'Utilisation moyenne de tous les cœurs (5 min)'),
        mesure(
          'iowait',
          'Attente disque (iowait)',
          b.iowaitPct,
          '%',
          { ...SEUILS.cpu, warning: 20, critique: 40, libelleWarning: '> 20 %', libelleCritique: '> 40 %' },
          'Temps passé à attendre le disque',
        ),
        mesure(
          'steal',
          'Vol de CPU (steal)',
          b.stealPct,
          '%',
          { ...SEUILS.cpu, warning: 10, critique: 25, libelleWarning: '> 10 %', libelleCritique: '> 25 %' },
          'Temps pris par l’hébergeur (machine virtuelle)',
        ),
        mesure('charge', 'Charge par cœur', b.chargeParCoeur, '', SEUILS.charge, 'Load average 5 min / nombre de cœurs'),
        mesure('memoire', 'Mémoire utilisée', b.memoirePct, '%', SEUILS.memoire, 'RAM hors cache'),
        mesure('swap', 'Swap utilisé', b.swapPct, '%', SEUILS.swap),
        mesure('oom', 'Arrêts OOM (1 h)', b.oom1h, '', undefined, 'Processus tués faute de mémoire', oom),
      ],
    },
    {
      titre: 'Disques',
      mesures: [
        mesure('disque-latence', 'Latence disque', b.disqueLatenceMs, 'ms', SEUILS.disqueLatence, 'Temps moyen par opération de lecture/écriture'),
        mesure(
          'disque-occupe',
          'Disque occupé',
          b.disqueOccupePct,
          '%',
          { ...SEUILS.cpu, libelleWarning: '> 80 %', libelleCritique: '> 95 %' },
          'Part du temps où le disque travaille',
        ),
      ],
    },
    {
      titre: 'Système',
      mesures: [
        mesure('fd', 'Descripteurs de fichiers', b.descripteursPct, '%', SEUILS.descripteurs, 'Fichiers et sockets ouverts / limite'),
        mesure('processus', 'Processus', b.processus, ''),
        mesure('zombies', 'Processus zombies', b.zombies, '', undefined, undefined, b.zombies === null ? 'inconnu' : b.zombies > 5 ? 'orange' : 'vert'),
        mesure(
          'uptime',
          'Démarré depuis',
          b.uptimeSecondes,
          's',
          undefined,
          'Un redémarrage inattendu remet ce compteur à zéro',
          b.uptimeSecondes === null ? 'inconnu' : b.uptimeSecondes < 600 ? 'orange' : 'vert',
        ),
        mesure(
          'reboot',
          'Redémarrage requis',
          b.redemarrageRequis === null ? null : b.redemarrageRequis ? 1 : 0,
          'bool',
          undefined,
          'Noyau ou bibliothèques mis à jour',
          b.redemarrageRequis === null ? 'inconnu' : b.redemarrageRequis ? 'orange' : 'vert',
        ),
        mesure('horloge', 'Dérive de l’horloge', b.derivHorlogeSecondes, 's', SEUILS.horloge, 'Une horloge fausse casse les jetons, le HTTPS et les journaux'),
        mesure(
          'ntp',
          'Horloge synchronisée',
          b.horlogeSynchronisee === null ? null : b.horlogeSynchronisee ? 1 : 0,
          'bool',
          undefined,
          'NTP / chrony',
          b.horlogeSynchronisee === null ? 'inconnu' : b.horlogeSynchronisee ? 'vert' : 'orange',
        ),
      ],
    },
    {
      titre: 'Réseau',
      mesures: [
        mesure('entree', 'Trafic entrant', b.reseau.entreeOctetsS, 'o/s'),
        mesure('sortie', 'Trafic sortant', b.reseau.sortieOctetsS, 'o/s'),
        mesure(
          'erreurs-reseau',
          'Erreurs d’interface',
          b.reseau.erreursS,
          '/s',
          undefined,
          undefined,
          b.reseau.erreursS === null ? 'inconnu' : b.reseau.erreursS > 1 ? 'orange' : 'vert',
        ),
        mesure('pertes', 'Paquets perdus', b.reseau.pertesS, '/s', undefined, undefined, b.reseau.pertesS === null ? 'inconnu' : b.reseau.pertesS > 10 ? 'orange' : 'vert'),
        mesure('tcp', 'Connexions TCP établies', b.reseau.tcpEtablies, ''),
        mesure(
          'timewait',
          'TCP en TIME_WAIT',
          b.reseau.tcpTimeWait,
          '',
          undefined,
          undefined,
          b.reseau.tcpTimeWait === null ? 'inconnu' : b.reseau.tcpTimeWait > 20000 ? 'orange' : 'vert',
        ),
      ],
    },
  ];

  return {
    hote: b.hote,
    statut:
      b.cpuPct === null && b.memoirePct === null && !partitions.length ? 'inconnu' : pire(statutGlobal(groupes.flatMap((g) => g.mesures)), ...partitions.map((p) => p.statut)),
    groupes,
    partitions,
    series: b.series,
    memoireTotaleOctets: b.memoireTotaleOctets,
    coeurs: b.coeurs,
  };
}

export function analyserConteneurs(liste: BrutConteneur[]): VueConteneurs {
  const conteneurs = liste.map((c) => {
    const memoirePctLimite = c.limiteOctets && c.memoireOctets !== null ? (100 * c.memoireOctets) / c.limiteOctets : null;
    const redemarrages: Statut = c.redemarrages1h === null ? 'vert' : c.redemarrages1h > 2 ? 'rouge' : c.redemarrages1h > 0 ? 'orange' : 'vert';
    return {
      ...c,
      memoirePctLimite,
      statut: c.enMarche ? pire('vert', redemarrages, evaluer(memoirePctLimite, SEUILS.memoireConteneur)) : ('rouge' as Statut),
    };
  });
  return { statut: liste.length ? statutGlobal(conteneurs) : 'inconnu', conteneurs };
}

export function analyserServices(b: BrutServices): VueServices {
  const internes = b.internes.map((s) => ({
    ...s,
    statut: (s.ok === null ? 'inconnu' : s.ok ? (s.dureeMs !== null && s.dureeMs > 2000 ? 'orange' : 'vert') : 'rouge') as Statut,
  }));
  const publiques = b.publiques.map((s) => {
    const statutCertificat = evaluer(s.joursCertificat, SEUILS.certificat);
    const statut: Statut = s.ok === null ? 'inconnu' : s.ok ? (s.dureeMs !== null && s.dureeMs > 3000 ? 'orange' : 'vert') : 'rouge';
    return { ...s, statut, statutCertificat };
  });
  const tous = [...internes, ...publiques, ...publiques.map((p) => ({ statut: p.statutCertificat }))];
  return {
    statut: tous.length ? statutGlobal(tous) : 'inconnu',
    internes,
    publiques,
    disponibilite30j: b.disponibilite30j,
    serieDisponibilite: b.serieDisponibilite,
  };
}

export function analyserApplication(b: BrutApplication): VueApplication {
  const routes = b.routes.map((r) => ({
    ...r,
    statut: pire('vert', (r.debitRps ?? 0) > 0.01 ? evaluer(r.erreurs5xx === null ? null : r.erreurs5xx * 100, SEUILS.erreurs5xx) : 'vert', evaluer(r.p95, SEUILS.latenceP95)),
  }));

  const debitTotal = routes.reduce((s, r) => s + (r.debitRps ?? 0), 0);
  const erreurs = debitTotal > 0 ? routes.reduce((s, r) => s + (r.debitRps ?? 0) * (r.erreurs5xx ?? 0), 0) / debitTotal : null;
  const actives = routes.filter((r) => (r.debitRps ?? 0) > 0.01 && r.p95 !== null);
  const p95 = actives.length ? Math.max(...actives.map((r) => r.p95 as number)) : null;
  // Chute de trafic : seulement si la même heure il y a 7 jours avait du monde.
  const chute = b.debitTotalRps !== null && b.debitJ7Rps !== null && b.debitJ7Rps > 0.5 ? Math.max(0, (100 * (b.debitJ7Rps - b.debitTotalRps)) / b.debitJ7Rps) : null;

  const resume = [
    mesure('debit', 'Débit', b.debitTotalRps, 'req/s', undefined, 'Requêtes par seconde, tous services'),
    mesure('chute', 'Chute vs J-7', chute, '%', SEUILS.chuteTrafic, 'Débit comparé à la même heure, 7 jours plus tôt'),
    mesure('erreurs', 'Erreurs 5xx', erreurs === null ? null : erreurs * 100, '%', SEUILS.erreurs5xx),
    mesure('p95', 'Latence p95 (pire service)', p95, 'ms', SEUILS.latenceP95, 'Jamais seulement la moyenne'),
  ];
  const r = b.runtime;
  const runtime = [
    mesure('eventloop', 'Event loop lag (p99)', r.eventLoopLagS === null ? null : r.eventLoopLagS * 1000, 'ms', SEUILS.eventLoop, 'Signal n°1 de saturation Node.js'),
    mesure('heap', 'Heap utilisé', r.heapOctets, 'o'),
    mesure('rss', 'Mémoire du processus', r.memoireOctets, 'o'),
    mesure('handles', 'Handles actifs', r.handles, ''),
    mesure(
      'gc',
      'Temps de GC',
      r.gcSecondesParS === null ? null : r.gcSecondesParS * 100,
      '%',
      { ...SEUILS.cpu, warning: 10, critique: 25, libelleWarning: '> 10 %', libelleCritique: '> 25 %' },
      'Part du temps passée à libérer la mémoire',
    ),
    mesure(
      'redemarrages',
      'Redémarrages (24 h)',
      r.redemarrages24h,
      '',
      undefined,
      undefined,
      r.redemarrages24h === null ? 'inconnu' : r.redemarrages24h > 2 ? 'rouge' : r.redemarrages24h > 0 ? 'orange' : 'vert',
    ),
  ];
  return {
    statut: routes.length ? pire(statutGlobal(routes), statutGlobal(resume), statutGlobal(runtime)) : 'inconnu',
    routes,
    resume,
    runtime,
    series: b.series,
  };
}

export function analyserBdd(b: BrutBdd): VueBdd {
  const pctConnexions = b.connexions !== null && b.connexionsMax ? (100 * b.connexions) / b.connexionsMax : null;
  const mesures = [
    mesure(
      'pg-up',
      'PostgreSQL',
      b.enMarche === null ? null : b.enMarche ? 1 : 0,
      'bool',
      undefined,
      'Sans lui, aucune vente ne s’enregistre au serveur',
      b.enMarche === null ? 'inconnu' : b.enMarche ? 'vert' : 'rouge',
    ),
    mesure('connexions', 'Connexions utilisées', pctConnexions, '%', SEUILS.connexionsBdd, `${b.connexions ?? '—'} sur ${b.connexionsMax ?? '—'} autorisées`),
    mesure('cache', 'Taux de cache', b.cacheHit === null ? null : b.cacheHit * 100, '%', SEUILS.cacheHit, 'Lectures servies par la mémoire'),
    mesure('deadlocks', 'Deadlocks', b.deadlocksParMin, '/min', undefined, undefined, b.deadlocksParMin === null ? 'inconnu' : b.deadlocksParMin > 0.1 ? 'orange' : 'vert'),
    mesure('verrous', 'Verrous', b.verrous, ''),
    mesure('taille', 'Taille totale', b.bases.length ? b.bases.reduce((s, x) => s + x.tailleOctets, 0) : null, 'o'),
  ];
  return { statut: b.enMarche === null ? 'inconnu' : statutGlobal(mesures), mesures, bases: b.bases, serieConnexions: b.serieConnexions };
}

/** Heure locale de l'officine (fuseau configurable). */
export function heureLocale(t: number, fuseau: string): number {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(t));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return (h % 24) + m / 60;
}

export function analyserMetier(b: BrutMetier, options: { fuseau: string; ouverture: number; fermeture: number; maintenant?: number }): VueMetier {
  const h = heureLocale(options.maintenant ?? Date.now(), options.fuseau);
  const ouvert = h >= options.ouverture && h < options.fermeture;
  let anomalie: string | null = null;
  // Règle du guide (3.6) : zéro vente en heure d'ouverture = incident, même si tout est vert.
  if (ouvert && b.ventesHeure !== null && b.ventesHeure < 1 && (b.ventesJ7MemeHeure ?? 0) >= 5) {
    anomalie = `Aucune vente depuis une heure alors que l’officine est ouverte (${Math.round(b.ventesJ7MemeHeure ?? 0)} à la même heure il y a 7 jours).`;
  }
  const ecart = b.ventesHeure !== null && b.ventesJ7MemeHeure !== null && b.ventesJ7MemeHeure > 0 ? (100 * (b.ventesHeure - b.ventesJ7MemeHeure)) / b.ventesJ7MemeHeure : null;
  const mesures = [
    mesure('ventes-heure', 'Ventes (dernière heure)', b.ventesHeure, '', undefined, 'POST /v1/sales acceptées', anomalie ? 'rouge' : b.ventesHeure === null ? 'inconnu' : 'vert'),
    mesure('ventes-jour', 'Ventes (24 h)', b.ventesJour, ''),
    mesure('ecart-j7', 'Écart vs J-7', ecart, '%', undefined, 'Même heure, 7 jours plus tôt', ecart === null ? 'inconnu' : ouvert && ecart < -60 ? 'orange' : 'vert'),
    mesure('refus', 'Connexions refusées (1 h)', b.connexionsRefusees1h, '/h', SEUILS.connexionsRefusees, 'PIN faux, compte bloqué ou suspendu'),
  ];
  return {
    statut: b.ventesHeure === null && b.connexionsRefusees1h === null ? 'inconnu' : statutGlobal(mesures),
    mesures,
    anomalie,
    serieVentes: b.serieVentes,
    serieVentesJ7: b.serieVentesJ7,
  };
}

export function analyserSauvegardes(b: BrutSauvegardes, maintenant = Date.now()): VueSauvegardes {
  const age = b.derniereReussite === null ? null : (maintenant - b.derniereReussite) / 3_600_000;
  const mesures = [
    mesure('age', 'Dernière sauvegarde réussie', age, 'h', SEUILS.sauvegarde, 'Déposée par deploy/backup.sh après chaque sauvegarde complète', age === null ? 'rouge' : undefined),
    mesure('taille', 'Taille des sauvegardes', b.tailleOctets, 'o'),
  ];
  return { statut: statutGlobal(mesures), mesures, derniereReussite: b.derniereReussite };
}

const P2: string[] = ['ErreursServeur', 'ApiLente', 'ConnexionsRefuseesNombreuses', 'PostgresConnexionsSaturees'];

/** Gravité Officina (« critique » / « attention ») → niveau du guide (P1..Info). */
export function prioriteDe(a: Pick<BrutAlerte, 'nom' | 'gravite' | 'priorite'>): Priorite {
  if (a.priorite && ['P1', 'P2', 'P3', 'Info'].includes(a.priorite)) return a.priorite as Priorite;
  const g = a.gravite.toLowerCase();
  if (g === 'critique' || g === 'critical' || g === 'page') return 'P1';
  if (g === 'info' || g === 'none') return 'Info';
  return P2.includes(a.nom) ? 'P2' : 'P3';
}

export function enrichirAlertes(brutes: BrutAlerte[]): Alerte[] {
  const ordre: Record<Priorite, number> = { P1: 0, P2: 1, P3: 2, Info: 3 };
  return brutes
    .map((a) => ({ ...a, priorite: prioriteDe(a), runbook: runbookDe(a.nom) ? a.nom : null }))
    .sort((a, b) => ordre[a.priorite] - ordre[b.priorite] || b.debut - a.debut);
}

export const statutDeLaPriorite = (p: Priorite): Statut => (p === 'P1' ? 'rouge' : p === 'Info' ? 'vert' : 'orange');
