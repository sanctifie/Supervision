import type { Priorite } from './types';

/**
 * Un runbook par alerte d'Officina (supervision/prometheus/alertes.yml du
 * dépôt Pharmatech) : quoi vérifier, quoi faire. Règle du guide (7.2) :
 * chaque alerte doit être actionnable.
 */
export interface Runbook {
  alerte: string;
  titre: string;
  priorite: Priorite;
  verifier: string[];
  agir: string[];
}

export const RUNBOOKS: Runbook[] = [
  {
    alerte: 'ServiceInjoignable',
    titre: 'Un service ne répond plus',
    priorite: 'P1',
    verifier: [
      "Lequel ? L'étiquette « service » de l'alerte (sales, payments…).",
      'docker compose ps : le conteneur est-il « Up » ou « Restarting » ?',
      'docker compose logs --tail=100 <service> : dernière erreur avant l’arrêt.',
    ],
    agir: [
      'docker compose up -d <service>',
      'Si la base est en cause (ECONNREFUSED postgres) : voir le runbook PostgresArrete.',
      'Si le service redémarre en boucle après un déploiement : revenir à la version précédente (deploy/deployer.sh).',
    ],
  },
  {
    alerte: 'SiteInjoignable',
    titre: 'Le site ne répond plus en HTTPS',
    priorite: 'P1',
    verifier: [
      "Depuis un téléphone en 4G : l'adresse s'ouvre-t-elle ?",
      'docker compose logs --tail=100 caddy',
      'Le nom de domaine pointe-t-il toujours vers le serveur (dig +short) ?',
    ],
    agir: ['docker compose up -d caddy', 'Si le certificat est en cause : voir CertificatBientotExpire.'],
  },
  {
    alerte: 'CertificatBientotExpire',
    titre: 'Le certificat HTTPS expire bientôt',
    priorite: 'P3',
    verifier: ['docker compose logs caddy | grep -i certificate', 'Le port 80 est-il ouvert (Let’s Encrypt en a besoin) ?'],
    agir: ['Caddy renouvelle seul : corriger la cause (port 80, DNS) puis docker compose restart caddy.'],
  },
  {
    alerte: 'ErreursServeur',
    titre: "Trop d'erreurs serveur (5xx)",
    priorite: 'P2',
    verifier: [
      'Supervision → Journaux, filtrer sur le service et le niveau « erreur ».',
      'Un déploiement récent ? Comparer avec l’heure du début de l’alerte.',
    ],
    agir: ['Corriger ou revenir à la version précédente.', 'Si une dépendance externe est en cause (paiement, SMS) : prévenir l’opérateur.'],
  },
  {
    alerte: 'ApiLente',
    titre: "L'API répond lentement",
    priorite: 'P2',
    verifier: ['Supervision → Serveur : processeur, mémoire, disque.', 'Supervision → Base de données : connexions, verrous.'],
    agir: ['Redémarrer le service lent si la mémoire grimpe sans redescendre.', 'Repérer la requête lente dans les journaux PostgreSQL.'],
  },
  {
    alerte: 'ConnexionsRefuseesNombreuses',
    titre: 'Beaucoup de connexions refusées',
    priorite: 'P2',
    verifier: ['Supervision → Journaux, service identity : quel poste, quel compte ?'],
    agir: ['Suspendre le compte visé si l’essai de PIN continue.', 'Prévenir le titulaire.'],
  },
  {
    alerte: 'DisquePresquePlein',
    titre: 'Le disque se remplit',
    priorite: 'P3',
    verifier: ['df -h et du -sh /var/lib/docker backups/*', 'La rétention des sauvegardes est-elle respectée ?'],
    agir: ['docker system prune -f', 'Supprimer les vieilles sauvegardes au-delà de la rétention.', 'Agrandir le disque si la tendance continue.'],
  },
  {
    alerte: 'DisquePlein',
    titre: 'Disque presque plein',
    priorite: 'P1',
    verifier: ['df -h : quelle partition ?'],
    agir: ['docker system prune -af', 'journalctl --vacuum-size=200M', 'Agrandir le disque chez l’hébergeur.'],
  },
  {
    alerte: 'MemoireFaible',
    titre: 'Mémoire faible',
    priorite: 'P3',
    verifier: ['Supervision → Conteneurs : lequel consomme ?'],
    agir: ['Redémarrer le conteneur qui fuit.', 'Augmenter la mémoire du serveur si c’est durable.'],
  },
  {
    alerte: 'ProcesseurSature',
    titre: 'Processeur saturé',
    priorite: 'P3',
    verifier: ['Supervision → Conteneurs : lequel consomme ?', 'Une importation ou un rapport lourd en cours ?'],
    agir: ['Attendre la fin du traitement, ou le décaler la nuit.'],
  },
  {
    alerte: 'ConteneurRedemarreEnBoucle',
    titre: 'Un conteneur redémarre en boucle',
    priorite: 'P1',
    verifier: ['docker compose logs --tail=100 <service>'],
    agir: ['Corriger la configuration ou revenir à l’image précédente.'],
  },
  {
    alerte: 'PostgresArrete',
    titre: 'PostgreSQL ne répond plus',
    priorite: 'P1',
    verifier: ['docker compose logs --tail=100 postgres', 'Disque plein ? (df -h)'],
    agir: ['docker compose up -d postgres', 'En dernier recours : restaurer la dernière sauvegarde (docs/EXPLOITATION.md).'],
  },
  {
    alerte: 'PostgresConnexionsSaturees',
    titre: 'Connexions PostgreSQL saturées',
    priorite: 'P2',
    verifier: ['Supervision → Base de données : qui ouvre les connexions ?'],
    agir: ['Redémarrer le service qui garde des connexions ouvertes.'],
  },
  {
    alerte: 'SauvegardeEnRetard',
    titre: 'La sauvegarde est en retard',
    priorite: 'P3',
    verifier: ['crontab -l : la ligne de deploy/backup.sh est-elle là ?'],
    agir: ['bash deploy/backup.sh et lire ses messages.'],
  },
  {
    alerte: 'AucuneSauvegardeConnue',
    titre: 'Aucune sauvegarde enregistrée',
    priorite: 'P3',
    verifier: ['crontab -l', 'Le dossier supervision/mesures est-il monté dans node-exporter ?'],
    agir: ['bash deploy/backup.sh'],
  },
  {
    alerte: 'CibleDeSupervisionEnPanne',
    titre: 'Un exporteur ne répond plus',
    priorite: 'P3',
    verifier: ['docker compose ps : l’exporteur tourne-t-il ?'],
    agir: ['docker compose up -d <exporteur>'],
  },
  {
    alerte: 'TestSupervision',
    titre: 'Alerte de test',
    priorite: 'Info',
    verifier: ['Le message est-il arrivé sur Telegram / e-mail ?'],
    agir: ['Rien : elle disparaît seule après 5 minutes.'],
  },
];

export function runbookDe(alerte: string): Runbook | undefined {
  return RUNBOOKS.find((r) => r.alerte === alerte);
}
