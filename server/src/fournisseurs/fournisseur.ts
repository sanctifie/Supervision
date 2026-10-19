import type { ImageEnMarche } from '../../../shared/deploiements';
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
  Mode,
  Silence,
} from '../../../shared/types';

/**
 * Ce que la supervision sait lire. Deux implémentations :
 * - `FournisseurReel` interroge Prometheus, Alertmanager et Loki ;
 * - `FournisseurDemo` fabrique des valeurs réalistes pour voir l'interface
 *   sans serveur.
 */
export interface Fournisseur {
  readonly mode: Mode;
  serveur(): Promise<BrutServeur>;
  conteneurs(): Promise<BrutConteneur[]>;
  /** L'image qui tourne pour chaque service : { sales: 'officina/sales:1.8.3' }. */
  images(): Promise<Record<string, ImageEnMarche>>;
  services(): Promise<BrutServices>;
  application(): Promise<BrutApplication>;
  bdd(): Promise<BrutBdd>;
  metier(): Promise<BrutMetier>;
  sauvegardes(): Promise<BrutSauvegardes>;
  alertes(): Promise<BrutAlerte[]>;
  silences(): Promise<Silence[]>;
  creerSilence(s: Omit<Silence, 'id'>): Promise<string>;
  supprimerSilence(id: string): Promise<void>;
  /** Envoie une alerte « TestSupervision » (5 min) pour vérifier le canal Telegram / e-mail. */
  envoyerAlerteTest(auteur: string): Promise<void>;
  journaux(filtre: FiltreJournaux): Promise<LigneJournal[]>;
  /** Les sources joignables, pour l'en-tête de l'interface. */
  disponibilite(): Promise<{ prometheus: boolean; alertmanager: boolean; loki: boolean }>;
}
