import { config } from './config';
import type { Fournisseur } from './fournisseurs/fournisseur';
import { FournisseurDemo } from './fournisseurs/demo';
import { FournisseurReel } from './fournisseurs/reel';
import { prometheus } from './fournisseurs/clients';
import {
  analyserApplication,
  analyserBdd,
  analyserConteneurs,
  analyserMetier,
  analyserSauvegardes,
  analyserServeur,
  analyserServices,
  enrichirAlertes,
  heureLocale,
} from './analyse';
import { Tickets } from './tickets';
import { Stockage } from './stockage';
import { AUTOMATISATIONS, CHECKLIST, CONTROLES_SECURITE, PHASES, PIPELINE } from './catalogues';
import { SEUILS, SLO_DISPONIBILITE, evaluer, pire } from '../../shared/seuils';
import { RUNBOOKS } from '../../shared/runbooks';
import { nombre, pourcent } from '../../shared/format';
import type {
  Alerte,
  Controle,
  Domaine,
  ElementChecklist,
  EtatSources,
  Kpi,
  Statut,
  VueAlertes,
  VueApplication,
  VueAutomatisations,
  VueBdd,
  VueConteneurs,
  VueEtat,
  VueFeuilleDeRoute,
  VueMetier,
  VueSauvegardes,
  VueSecurite,
  VueServeur,
  VueServices,
} from '../../shared/types';

/**
 * Le cœur : choisit la source (réelle ou démonstration), met les lectures en
 * cache quelques secondes, assemble les vues, et fait tourner la boucle de
 * fond (alertes → tickets d'incident → fil d'activité).
 */
export class Supervision {
  private readonly reel = new FournisseurReel();
  private readonly demo = new FournisseurDemo();
  private fournisseur: Fournisseur;
  private cache = new Map<string, { expire: number; valeur: Promise<unknown> }>();
  private boucle: NodeJS.Timeout | null = null;
  readonly tickets: Tickets;

  constructor(readonly stockage: Stockage) {
    this.fournisseur = config.mode === 'reel' ? this.reel : this.demo;
    this.tickets = new Tickets(stockage, {
      creerSilence: async (ci, debut, fin, commentaire, auteur) => {
        const id = await this.fournisseur.creerSilence({ correspondances: [{ nom: 'service', valeur: ci }], debut, fin, commentaire, auteur });
        this.invalider('silences');
        this.invalider('alertes');
        return id;
      },
      supprimerSilence: (id) => this.supprimerSilence(id),
    });
  }

  get mode() {
    return this.fournisseur.mode;
  }

  /** Mode auto : Prometheus s'il répond, sinon démonstration. */
  async choisirSource(): Promise<void> {
    if (config.mode !== 'auto') return;
    const joignable = await prometheus.joignable();
    const suivant = joignable ? this.reel : this.demo;
    if (suivant !== this.fournisseur) {
      this.fournisseur = suivant;
      this.cache.clear();
      console.log(`[supervision] source : ${joignable ? `Prometheus (${config.prometheusUrl})` : 'démonstration (Prometheus injoignable)'}`);
    }
  }

  demarrer(): void {
    const tour = async () => {
      try {
        await this.choisirSource();
        const alertes = await this.alertesEnrichies().catch(() => null);
        if (alertes) this.tickets.synchroniser(alertes);
        this.stockage.copieDuJour();
        await this.suivreSauvegardes();
      } catch (e) {
        console.error('[supervision] boucle :', (e as Error).message);
      }
    };
    void tour();
    this.boucle = setInterval(tour, 30_000);
  }

  arreter(): void {
    if (this.boucle) clearInterval(this.boucle);
    this.stockage.ecrireMaintenant();
  }

  private memo<T>(cle: string, ttlMs: number, f: () => Promise<T>): Promise<T> {
    const k = `${this.fournisseur.mode}:${cle}`;
    const actuel = this.cache.get(k);
    if (actuel && actuel.expire > Date.now()) return actuel.valeur as Promise<T>;
    const valeur = f();
    this.cache.set(k, { expire: Date.now() + ttlMs, valeur });
    valeur.catch(() => this.cache.delete(k));
    return valeur;
  }

  private invalider(prefixe: string): void {
    for (const k of this.cache.keys()) if (k.includes(`:${prefixe}`)) this.cache.delete(k);
  }

  // --- Vues -----------------------------------------------------------------

  serveur = (): Promise<VueServeur> => this.memo('serveur', 10_000, async () => analyserServeur(await this.fournisseur.serveur()));
  conteneurs = (): Promise<VueConteneurs> => this.memo('conteneurs', 10_000, async () => analyserConteneurs(await this.fournisseur.conteneurs()));
  services = (): Promise<VueServices> => this.memo('services', 10_000, async () => analyserServices(await this.fournisseur.services()));
  application = (): Promise<VueApplication> => this.memo('application', 10_000, async () => analyserApplication(await this.fournisseur.application()));
  bdd = (): Promise<VueBdd> => this.memo('bdd', 10_000, async () => analyserBdd(await this.fournisseur.bdd()));
  metier = (): Promise<VueMetier> =>
    this.memo('metier', 10_000, async () =>
      analyserMetier(await this.fournisseur.metier(), { fuseau: config.fuseau, ouverture: config.ouverture, fermeture: config.fermeture }),
    );
  sauvegardes = (): Promise<VueSauvegardes> => this.memo('sauvegardes', 10_000, async () => analyserSauvegardes(await this.fournisseur.sauvegardes()));

  private alertesEnrichies = (): Promise<Alerte[]> => this.memo('alertes', 5_000, async () => enrichirAlertes(await this.fournisseur.alertes()));

  async alertes(): Promise<VueAlertes> {
    const [alertes, silences] = await Promise.all([
      this.alertesEnrichies().catch(() => [] as Alerte[]),
      this.memo('silences', 5_000, () => this.fournisseur.silences()).catch(() => []),
    ]);
    return { alertes, silences };
  }

  async creerSilence(correspondances: { nom: string; valeur: string }[], minutes: number, commentaire: string, auteur: string) {
    const debut = Date.now();
    const id = await this.fournisseur.creerSilence({ correspondances, debut, fin: debut + minutes * 60_000, commentaire, auteur });
    this.invalider('silences');
    this.invalider('alertes');
    this.stockage.ajouterEvenement({ t: debut, type: 'info', titre: `Silence posé par ${auteur}`, detail: `${commentaire} (${minutes} min)`, statut: 'vert' });
    return id;
  }

  async supprimerSilence(id: string) {
    await this.fournisseur.supprimerSilence(id);
    this.invalider('silences');
    this.invalider('alertes');
  }

  async envoyerAlerteTest(auteur: string) {
    await this.fournisseur.envoyerAlerteTest(auteur);
    this.invalider('alertes');
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: 'Alerte de test envoyée', detail: `Par ${auteur} — vérifier Telegram / e-mail`, statut: 'vert' });
  }

  journaux(filtre: Parameters<Fournisseur['journaux']>[0]) {
    return this.fournisseur.journaux(filtre);
  }

  async sources(): Promise<EtatSources> {
    const d = await this.memo('sources', 30_000, () => this.fournisseur.disponibilite());
    return { mode: this.fournisseur.mode, ...d, grafanaUrl: config.grafanaUrl };
  }

  private async suivreSauvegardes() {
    const s = await this.fournisseur.sauvegardes().catch(() => null);
    if (!s?.derniereReussite) return;
    const vue = this.stockage.donnees.vus.derniereSauvegarde;
    if (vue && Math.abs(vue - s.derniereReussite) < 60_000) return;
    this.stockage.modifier((e) => {
      e.vus.derniereSauvegarde = s.derniereReussite;
    });
    if (vue) {
      this.stockage.ajouterEvenement({ t: s.derniereReussite, type: 'sauvegarde', titre: 'Sauvegarde réussie', detail: 'deploy/backup.sh', statut: 'vert' });
    }
  }

  /** Vue direction (guide, chapitre 8) : l'état global lisible en 3 secondes. */
  async etat(): Promise<VueEtat> {
    const securite = () => this.securite();
    const [sources, serveur, conteneurs, services, application, bdd, metier, sauvegardes, alertes, secu] = await Promise.all([
      this.sources(),
      this.serveur().catch(() => null),
      this.conteneurs().catch(() => null),
      this.services().catch(() => null),
      this.application().catch(() => null),
      this.bdd().catch(() => null),
      this.metier().catch(() => null),
      this.sauvegardes().catch(() => null),
      this.alertes(),
      securite().catch(() => null),
    ]);

    const actives = alertes.alertes.filter((a) => !a.silencieuse && a.priorite !== 'Info');
    const p1 = actives.filter((a) => a.priorite === 'P1');
    const sondePubliqueKo = services?.publiques.some((p) => p.ok === false) ?? false;
    const disponibilite = services?.disponibilite30j ?? null;
    const budget = disponibilite === null ? null : Math.max(0, (1 - disponibilite) / (1 - SLO_DISPONIBILITE));

    const st = (v: { statut: Statut } | null) => v?.statut ?? 'inconnu';
    const domaines: Domaine[] = [
      { cle: 'serveur', libelle: 'Serveur', statut: st(serveur), resume: serveur ? `CPU ${pourcent(serveur.groupes[0].mesures[0].valeur, 0)} · RAM ${pourcent(serveur.groupes[0].mesures[4].valeur, 0)}` : 'Non mesuré', lien: '/serveur' },
      { cle: 'conteneurs', libelle: 'Conteneurs', statut: st(conteneurs), resume: conteneurs ? `${conteneurs.conteneurs.filter((c) => c.enMarche).length}/${conteneurs.conteneurs.length} en marche` : 'Non mesuré', lien: '/conteneurs' },
      { cle: 'services', libelle: 'Services et sondes', statut: st(services), resume: services ? `${services.internes.filter((s) => s.ok).length}/${services.internes.length} services répondent` : 'Non mesuré', lien: '/services' },
      { cle: 'application', libelle: 'API', statut: st(application), resume: application ? `${nombre(application.resume[0].valeur, 1)} req/s · p95 ${nombre(application.resume[3].valeur)} ms` : 'Non mesuré', lien: '/application' },
      { cle: 'bdd', libelle: 'Base de données', statut: st(bdd), resume: bdd ? `Connexions ${pourcent(bdd.mesures[1].valeur, 0)}` : 'Non mesuré', lien: '/bdd' },
      { cle: 'metier', libelle: 'Métier', statut: st(metier), resume: metier ? metier.anomalie ?? `${nombre(metier.mesures[0].valeur)} ventes la dernière heure` : 'Non mesuré', lien: '/metier' },
      { cle: 'sauvegardes', libelle: 'Sauvegardes', statut: st(sauvegardes), resume: sauvegardes ? (sauvegardes.mesures[0].valeur === null ? 'Aucune connue' : `Il y a ${nombre(sauvegardes.mesures[0].valeur, 0)} h`) : 'Non mesuré', lien: '/sauvegardes' },
      { cle: 'securite', libelle: 'Sécurité', statut: st(secu), resume: secu ? `${secu.controles.filter((c) => c.statut === 'vert').length}/${secu.controles.length} contrôles en place` : 'Non mesuré', lien: '/securite' },
    ];

    // Règle de calcul du guide (chapitre 8).
    let statut: Statut = 'vert';
    let raison = 'Tout est nominal : aucune alerte active, SLO respectés.';
    const orangeDomaines = domaines.filter((d) => d.statut === 'orange' || d.statut === 'rouge');
    if (p1.length || sondePubliqueKo || metier?.anomalie) {
      statut = 'rouge';
      raison = p1.length
        ? `Incident en cours : ${p1.map((a) => a.resume || a.nom).join(' · ')}`
        : sondePubliqueKo
          ? 'Un parcours externe (sonde HTTPS) est en échec.'
          : (metier?.anomalie as string);
    } else if (actives.length || (budget !== null && budget > 0.5) || orangeDomaines.length) {
      statut = 'orange';
      raison = actives.length
        ? `Alerte active : ${actives.map((a) => a.resume || a.nom).join(' · ')}`
        : budget !== null && budget > 0.5
          ? `Budget d'erreur consommé à ${pourcent(budget * 100, 0)}`
          : `À surveiller : ${orangeDomaines.map((d) => d.libelle).join(', ')}`;
    }
    // Une supervision aveugle est elle-même un incident.
    if (sources.mode === 'reel' && !sources.prometheus) {
      statut = 'rouge';
      raison = `La supervision ne voit plus rien : Prometheus est injoignable (${config.prometheusUrl}).`;
    }

    const debitServeur = application?.series.debit ?? [];
    // Variation du débit vs la même heure il y a 7 jours (derniers points des deux séries).
    const dernier = (pts: { v: number }[] = []) => (pts.length ? pts[pts.length - 1].v : null);
    const actuel = dernier(application?.series.debit);
    const j7 = dernier(application?.series.debitJ7);
    const variation = actuel !== null && j7 !== null && j7 > 0.5 ? (100 * (actuel - j7)) / j7 : null;
    const kpis: Kpi[] = [
      {
        cle: 'disponibilite',
        libelle: 'Disponibilité (30 j)',
        valeur: disponibilite === null ? '—' : pourcent(disponibilite * 100, 2),
        sousTexte: `Objectif ${pourcent(SLO_DISPONIBILITE * 100, 1)}`,
        statut: disponibilite === null ? 'inconnu' : disponibilite >= SLO_DISPONIBILITE ? 'vert' : 'rouge',
        tendance: [],
      },
      {
        cle: 'debit',
        libelle: 'Requêtes / seconde',
        valeur: nombre(application?.resume[0].valeur ?? null, 1),
        sousTexte: variation !== null ? `${variation >= 0 ? '+' : '−'}${pourcent(Math.abs(variation), 0)} vs J-7` : 'API Officina',
        statut: application?.resume[1].statut === 'inconnu' ? 'vert' : (application?.resume[1].statut ?? 'inconnu'),
        tendance: debitServeur,
      },
      {
        cle: 'alertes',
        libelle: 'Alertes actives',
        valeur: String(actives.length),
        sousTexte: p1.length ? `dont ${p1.length} critique${p1.length > 1 ? 's' : ''}` : actives.length ? 'aucune critique' : 'rien à signaler',
        statut: p1.length ? 'rouge' : actives.length ? 'orange' : 'vert',
        tendance: [],
      },
      {
        cle: 'ventes',
        libelle: 'Ventes (24 h)',
        valeur: nombre(metier?.mesures[1].valeur ?? null),
        sousTexte: metier ? `${nombre(metier.mesures[0].valeur)} la dernière heure` : 'Non mesuré',
        statut: metier?.mesures[0].statut ?? 'inconnu',
        tendance: metier?.serieVentes ?? [],
      },
    ];

    // Vue direction : un voyant par produit / service métier.
    const sonde = (nom: string) => services?.internes.find((s) => s.service === nom);
    const pub = (chemin: string) => services?.publiques.find((p) => p.url.includes(chemin));
    const route = (nom: string) => application?.routes.find((r) => r.service === nom);
    const voyant = (nom: string, statuts: Statut[], detail: string) => ({ nom, statut: pire(...statuts), detail });
    const produits = [
      voyant('API Officina', [sonde('gateway')?.statut ?? 'inconnu', application?.resume[2].statut ?? 'inconnu', application?.resume[3].statut ?? 'inconnu'], application ? `${pourcent(application.resume[2].valeur, 2)} d’erreurs · p95 ${nombre(application.resume[3].valeur)} ms` : 'Non mesuré'),
      voyant('Comptoir (caisse)', [pub('/comptoir')?.statut ?? 'inconnu', sonde('sales')?.statut ?? 'inconnu', route('sales')?.statut ?? 'inconnu'], pub('/comptoir') ? `HTTPS ${pub('/comptoir')?.code ?? '—'} en ${nombre(pub('/comptoir')?.dureeMs ?? null)} ms` : 'Non sondé'),
      voyant('Application de l’officine', [pub('/officine')?.statut ?? 'inconnu'], pub('/officine') ? `HTTPS ${pub('/officine')?.code ?? '—'} en ${nombre(pub('/officine')?.dureeMs ?? null)} ms` : 'Non sondé'),
      voyant('Paiements mobile money', [sonde('payments')?.statut ?? 'inconnu', route('payments')?.statut ?? 'inconnu'], route('payments') ? `${pourcent((route('payments')?.erreurs5xx ?? 0) * 100, 2)} d’erreurs` : 'Non mesuré'),
      voyant('Synchronisation hors ligne', [sonde('syncd')?.statut ?? 'inconnu'], sonde('syncd')?.ok === false ? 'Les postes ne se synchronisent plus' : 'Les postes se synchronisent'),
      voyant('Notifications SMS / WhatsApp', [sonde('notify')?.statut ?? 'inconnu'], sonde('notify')?.ok === false ? 'Service injoignable' : 'Envois opérationnels'),
      voyant('Base de données', [bdd?.statut ?? 'inconnu'], bdd ? `${bdd.bases.length} bases · cache ${pourcent(bdd.mesures[2].valeur, 1)}` : 'Non mesuré'),
    ];

    return {
      majLe: Date.now(),
      sources,
      statut,
      raison,
      kpis,
      domaines,
      trafic: { debit: application?.series.debit ?? [], debitJ7: application?.series.debitJ7 ?? [] },
      activite: this.stockage.donnees.evenements.slice(0, 12),
      services: produits,
      slo: { objectif: SLO_DISPONIBILITE, disponibilite, budgetConsomme: budget },
    };
  }

  private confirme(cle: string) {
    const c = this.stockage.confirmation(cle);
    return c?.fait ? c : null;
  }

  async securite(): Promise<VueSecurite> {
    return this.memo('securite', 10_000, async () => {
      const [services, metier, application] = await Promise.all([
        this.services().catch(() => null),
        this.metier().catch(() => null),
        this.application().catch(() => null),
      ]);
      const refus = metier?.mesures.find((m) => m.cle === 'refus') ?? null;
      const jours = services?.publiques.map((p) => p.joursCertificat).filter((j): j is number => j !== null) ?? [];
      const joursMin = jours.length ? Math.min(...jours) : null;
      const identity = application?.routes.find((r) => r.service === 'identity');

      const auto: Record<string, { statut: Statut; detail: string } | undefined> = {
        pin: refus && refus.valeur !== null ? { statut: refus.statut, detail: `${nombre(refus.valeur)} connexion(s) refusée(s) la dernière heure` } : undefined,
        https: joursMin !== null ? { statut: pire(evaluer(joursMin, SEUILS.certificat), services?.publiques.some((p) => p.ok === false) ? 'rouge' : 'vert'), detail: `Certificat valide encore ${nombre(joursMin)} jours` } : undefined,
        'rate-limit': identity ? { statut: 'vert', detail: `Gateway : ${pourcent((identity.refus4xx ?? 0) * 100, 1)} de réponses 401/403/429 sur identity` } : undefined,
      };

      const controles: Controle[] = CONTROLES_SECURITE.map((c) => {
        const a = auto[c.cle];
        const conf = this.confirme(`securite:${c.cle}`);
        if (a) return { ...c, statut: a.statut, detail: a.detail };
        if (conf) return { ...c, statut: 'vert', detail: `Confirmé par ${conf.par}${conf.note ? ` — ${conf.note}` : ''}` };
        return { ...c, statut: 'inconnu', detail: 'À mettre en place ou à confirmer' };
      });
      const mesures = [
        ...(refus ? [refus] : []),
        {
          cle: 'certificat',
          libelle: 'Certificat HTTPS',
          valeur: joursMin,
          unite: 'j',
          statut: evaluer(joursMin, SEUILS.certificat),
          detail: 'Jours avant expiration (alerte à J-30, J-14, J-7)',
          seuilWarning: SEUILS.certificat.libelleWarning,
          seuilCritique: SEUILS.certificat.libelleCritique,
        },
      ];
      const mesurables = controles.filter((c) => c.statut !== 'inconnu');
      return { statut: mesurables.length ? pire('vert', ...mesurables.map((c) => c.statut)) : 'inconnu', mesures, controles };
    });
  }

  async automatisations(): Promise<VueAutomatisations> {
    const [sauvegardes, services, conteneurs, serveur] = await Promise.all([
      this.sauvegardes().catch(() => null),
      this.services().catch(() => null),
      this.conteneurs().catch(() => null),
      this.serveur().catch(() => null),
    ]);
    const jours = services?.publiques.map((p) => p.joursCertificat).filter((j): j is number => j !== null) ?? [];
    const disque = serveur?.partitions.find((p) => p.point === '/');
    const auto: Record<string, { statut: Statut; detail: string } | undefined> = {
      sauvegardes: sauvegardes ? { statut: sauvegardes.statut, detail: sauvegardes.mesures[0].valeur === null ? 'Aucune sauvegarde connue' : `Dernière réussite il y a ${nombre(sauvegardes.mesures[0].valeur, 0)} h` } : undefined,
      certificats: jours.length ? { statut: evaluer(Math.min(...jours), SEUILS.certificat), detail: `Renouvelé par Caddy — expire dans ${nombre(Math.min(...jours))} j` } : undefined,
      'auto-reparation': conteneurs?.conteneurs.length
        ? { statut: conteneurs.conteneurs.every((c) => c.enMarche) ? 'vert' : 'orange', detail: `${conteneurs.conteneurs.filter((c) => c.enMarche).length}/${conteneurs.conteneurs.length} conteneurs en marche (restart: unless-stopped)` }
        : undefined,
      nettoyage: disque ? { statut: disque.statut, detail: `Disque / à ${pourcent(disque.utilisePct, 0)}${disque.joursAvantPlein ? `, plein dans ~${nombre(disque.joursAvantPlein)} j` : ''}` } : undefined,
    };
    const statutManuel = (cle: string): { statut: Statut; detail: string } => {
      const c = this.confirme(cle);
      return c ? { statut: 'vert', detail: `Confirmé par ${c.par}${c.note ? ` — ${c.note}` : ''}` } : { statut: 'inconnu', detail: 'À mettre en place ou à confirmer' };
    };
    return {
      serveur: AUTOMATISATIONS.map((a) => ({ ...a, ...(auto[a.cle] ?? statutManuel(`automatisation:${a.cle}`)) })),
      pipeline: PIPELINE.map((p) => ({ etape: p.etape, contenu: p.contenu, bloquant: p.bloquant, cle: p.cle, statut: statutManuel(`pipeline:${p.cle}`).statut })),
    };
  }

  async feuilleDeRoute(): Promise<VueFeuilleDeRoute> {
    const [sources, services, serveur, application, sauvegardes] = await Promise.all([
      this.sources(),
      this.services().catch(() => null),
      this.serveur().catch(() => null),
      this.application().catch(() => null),
      this.sauvegardes().catch(() => null),
    ]);
    const a = (statut: Statut, detail: string) => ({ statut, detail });
    const auto: Record<string, { statut: Statut; detail: string } | null> = {
      'sonde-externe': services?.publiques.length
        ? a('orange', `${services.publiques.length} sonde(s) HTTPS depuis le serveur lui-même : ajouter une région externe (Uptime Kuma, UptimeRobot)`)
        : null,
      'alerte-ssl': services?.publiques.some((p) => p.joursCertificat !== null) ? a('vert', 'Expiration du certificat mesurée et alertée (CertificatBientotExpire)') : null,
      'alertes-systeme':
        serveur && serveur.partitions.some((p) => p.inodesPct !== null) && serveur.groupes[0].mesures[0].valeur !== null
          ? a('vert', 'CPU, mémoire, disque et inodes mesurés ; alertes Prometheus en place')
          : null,
      health: services?.internes.length ? a(services.internes.every((s) => s.ok !== null) ? 'vert' : 'orange', `${services.internes.length} services sondés sur /health`) : null,
      red: application?.routes.length ? a('vert', 'Débit, erreurs et latence par service ; alertes ErreursServeur et ApiLente') : null,
      logs: sources.loki ? a('vert', 'Loki joignable : journaux de tous les conteneurs centralisés') : a('rouge', 'Loki injoignable'),
      sauvegarde: sauvegardes ? a(sauvegardes.statut === 'vert' ? 'orange' : sauvegardes.statut, 'Sauvegarde mesurée ; confirmer le chiffrement hors site et une restauration testée') : null,
      'canal-alerte': sources.alertmanager ? a('orange', 'Alertmanager joignable : envoyer une alerte de test et confirmer sa réception') : a('rouge', 'Alertmanager injoignable'),
      runbooks: a('vert', `${RUNBOOKS.length} runbooks, un par alerte d’Officina (page Alertes)`),
      'page-statut': a('vert', 'Page de statut publique intégrée : /statut'),
    };
    const checklist: ElementChecklist[] = CHECKLIST.map((e) => {
      const c = this.stockage.confirmation(`checklist:${e.id}`);
      const x = auto[e.id];
      return {
        ...e,
        auto: x?.statut ?? null,
        autoDetail: x?.detail ?? null,
        coche: !!c?.fait,
        cocheLe: c?.le ?? null,
        note: c?.note ?? '',
      };
    });
    const faits = checklist.filter((e) => e.coche || e.auto === 'vert').length;
    return { phases: PHASES, checklist, avancement: faits / checklist.length };
  }

  /**
   * Avertissements avant de mener un changement (guide, 1 et 5.2) :
   * budget d'erreur consommé (gel recommandé) et chevauchements de fenêtres.
   */
  async avertissementsChangement(numero: string): Promise<string[]> {
    const t = this.tickets.trouver(numero);
    if (!t || t.type !== 'changement') return [];
    const avertissements: string[] = [];
    const services = await this.services().catch(() => null);
    const dispo = services?.disponibilite30j ?? null;
    if (dispo !== null) {
      const budget = (1 - dispo) / (1 - SLO_DISPONIBILITE);
      if (budget > 1 && t.typeChangement !== 'urgent') avertissements.push(`Budget d'erreur épuisé (${pourcent(budget * 100, 0)}) : gel des changements recommandé, sauf urgence.`);
      else if (budget > 0.5) avertissements.push(`Budget d'erreur consommé à ${pourcent(budget * 100, 0)} : prudence, prévoir le retour arrière.`);
    }
    for (const c of this.tickets.conflits(t)) {
      avertissements.push(`Chevauche ${c.numero} (${c.titre})${c.ci ? ` sur ${c.ci}` : ''}.`);
    }
    if (t.risque === 'eleve' && !t.planTest?.trim()) avertissements.push('Risque élevé sans plan de test.');
    if (t.debutPrevu && t.typeChangement !== 'urgent') {
      const h = heureLocale(t.debutPrevu, config.fuseau);
      if (h >= config.ouverture && h < config.fermeture) avertissements.push('La fenêtre tombe pendant les heures d’ouverture de l’officine.');
    }
    return avertissements;
  }

  /** Page de statut publique : seulement des voyants, aucun détail technique. */
  async statutPublic() {
    const e = await this.etat();
    return {
      majLe: e.majLe,
      statut: e.statut,
      nom: config.nomProduit,
      services: e.services.filter((s) => s.nom !== 'Base de données').map((s) => ({ nom: s.nom, statut: s.statut })),
      disponibilite: e.slo.disponibilite,
      incidents: this.tickets.incidentsPublics(),
    };
  }
}
