import type { Phase } from '../../shared/types';

/**
 * Le contenu du guide « Automatisation & Supervision », chapitres 4, 5, 6 et
 * 10. Chaque élément est soit vérifié automatiquement par la supervision
 * (voir `vues.ts`), soit confirmé à la main dans l'interface.
 */

export const PHASES: Phase[] = [
  {
    numero: 1,
    titre: 'Fondations',
    periode: 'Semaines 1-2',
    objectif: 'Ne plus être aveugle',
    livrables: ['Sondes externes + SSL', 'Métriques système', 'Sentry backend/mobile', 'Alertes Telegram', 'Sauvegardes automatiques'],
  },
  {
    numero: 2,
    titre: 'Application',
    periode: 'Semaines 3-4',
    objectif: "Voir ce que vit l'utilisateur",
    livrables: ['Endpoints /health', 'Métriques RED', 'Logs JSON centralisés', 'Métriques métier (paiements, inscriptions)'],
  },
  {
    numero: 3,
    titre: 'Automatisation',
    periode: 'Semaines 5-6',
    objectif: 'Réduire le travail manuel',
    livrables: ['Pipeline CI/CD complet avec scans', 'IaC Terraform, Ansible', 'Certificats auto', 'Tests de restauration'],
  },
  {
    numero: 4,
    titre: 'Maturité',
    periode: 'Semaines 7-8',
    objectif: 'Anticiper plutôt que réagir',
    livrables: ['Traces OpenTelemetry', "SLO et budget d'erreur", 'GitOps ArgoCD', 'Canary + rollback auto', 'Runbooks', 'Tableau vert/orange/rouge'],
  },
  {
    numero: 5,
    titre: 'Continu',
    periode: 'En continu',
    objectif: "S'améliorer",
    livrables: ['Post-mortems', 'Revue des alertes', 'Tests de charge', 'Audits de sécurité', 'Suivi des coûts'],
  },
];

/** Checklist minimale avant une mise en production (chapitre 10). */
export const CHECKLIST: { id: string; libelle: string; phase: number }[] = [
  { id: 'sonde-externe', libelle: "Sonde externe HTTP sur l'API et le site, depuis au moins 2 régions", phase: 1 },
  { id: 'alerte-ssl', libelle: 'Alerte d’expiration des certificats SSL et du nom de domaine', phase: 1 },
  { id: 'alertes-systeme', libelle: 'Alertes CPU, RAM, disque (espace + inodes) sur chaque serveur', phase: 1 },
  { id: 'health', libelle: 'Endpoints /health/live et /health/ready branchés sur les sondes', phase: 2 },
  { id: 'red', libelle: 'Taux d’erreur 5xx et latence p95 surveillés avec alerte', phase: 2 },
  { id: 'sentry', libelle: 'Sentry actif sur le backend et l’app mobile, avec sourcemaps', phase: 1 },
  { id: 'logs', libelle: 'Logs structurés centralisés, sans données sensibles', phase: 2 },
  { id: 'sauvegarde', libelle: 'Sauvegarde automatique chiffrée hors site + une restauration testée', phase: 1 },
  { id: 'pipeline', libelle: 'Pipeline CI avec tests, lint, scan de dépendances et d’image', phase: 3 },
  { id: 'rollback', libelle: 'Rollback d’un déploiement documenté et testé', phase: 4 },
  { id: 'secrets', libelle: 'Secrets hors du dépôt Git', phase: 3 },
  { id: 'paiements', libelle: 'Suivi du taux de succès des paiements par opérateur', phase: 2 },
  { id: 'canal-alerte', libelle: 'Canal d’alerte fonctionnel et testé (message de test reçu)', phase: 1 },
  { id: 'runbooks', libelle: 'Runbook pour chaque alerte critique', phase: 4 },
  { id: 'page-statut', libelle: 'Page de statut prête à être utilisée', phase: 4 },
];

/** Sécurité : serveur (2.6) et sécurité automatisée (6). */
export const CONTROLES_SECURITE: { cle: string; couche: string; libelle: string; outil: string }[] = [
  { cle: 'ssh-cles', couche: 'Accès', libelle: 'SSH par clés uniquement, root désactivé', outil: 'sshd_config : PasswordAuthentication no, PermitRootLogin no' },
  { cle: 'mfa', couche: 'Accès', libelle: 'MFA sur les consoles cloud et GitHub/GitLab', outil: 'Hetzner, GitHub' },
  { cle: 'acces-inactifs', couche: 'Accès', libelle: 'Révocation automatique des accès inactifs', outil: 'Revue mensuelle des comptes' },
  { cle: 'ssh-echecs', couche: 'Détection', libelle: 'Tentatives SSH échouées, connexions root, nouvelles clés authorized_keys', outil: 'Fail2ban / CrowdSec, Wazuh' },
  { cle: 'pin', couche: 'Détection', libelle: "Tentatives de PIN refusées sur l'application", outil: 'officine_connexions_refusees_total' },
  { cle: 'pare-feu', couche: 'Réseau', libelle: 'Pare-feu en code, seuls 22/80/443 ouverts', outil: 'ufw / nftables' },
  { cle: 'rate-limit', couche: 'Réseau', libelle: "Rate limiting et WAF devant l'API", outil: 'Gateway Officina, Cloudflare' },
  { cle: 'https', couche: 'Réseau', libelle: 'HTTPS valide sur toutes les adresses publiques', outil: 'Caddy + Let’s Encrypt' },
  { cle: 'durcissement', couche: 'Durcissement', libelle: 'Audit CIS automatisé', outil: 'Lynis' },
  { cle: 'integrite', couche: 'Durcissement', libelle: 'Intégrité des fichiers système, nouveaux utilisateurs, sudoers', outil: 'AIDE, Wazuh FIM' },
  { cle: 'cve', couche: 'Vulnérabilités', libelle: 'Paquets et images scannés (CVE), mises à jour de sécurité appliquées', outil: 'Trivy, unattended-upgrades' },
  { cle: 'runtime', couche: 'Détection', libelle: 'Comportements anormaux dans les conteneurs', outil: 'Falco' },
  { cle: 'chiffrement', couche: 'Données', libelle: 'Chiffrement au repos et en transit, sauvegardes chiffrées', outil: 'AES-256-GCM (Officina), restic' },
  { cle: 'audit', couche: 'Conformité', libelle: "Journal d'audit des accès aux données sensibles, rétention adaptée", outil: 'Audit signé Officina (identity)' },
];

/** Automatisations côté serveur (chapitre 4). */
export const AUTOMATISATIONS: { cle: string; domaine: string; libelle: string; outil: string; commande: string | null }[] = [
  { cle: 'iac', domaine: 'Provisioning (IaC)', libelle: 'VM, réseaux, pare-feu, DNS versionnés dans Git', outil: 'Terraform / OpenTofu', commande: null },
  { cle: 'configuration', domaine: 'Configuration', libelle: 'Utilisateurs, clés SSH, paquets, durcissement, agents', outil: 'Ansible, cloud-init', commande: null },
  {
    cle: 'mises-a-jour',
    domaine: 'Mises à jour',
    libelle: 'Patchs de sécurité automatiques, redémarrage en fenêtre de maintenance',
    outil: 'unattended-upgrades',
    commande: 'sudo apt install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades',
  },
  {
    cle: 'sauvegardes',
    domaine: 'Sauvegardes',
    libelle: 'Dumps BDD, volumes, configs ; chiffrées, hors site, règle 3-2-1',
    outil: 'deploy/backup.sh, restic',
    commande: 'bash deploy/backup.sh',
  },
  {
    cle: 'restauration',
    domaine: 'Tests de restauration',
    libelle: 'Restauration hebdomadaire dans un environnement jetable + vérification',
    outil: 'script + cron',
    commande: null,
  },
  {
    cle: 'certificats',
    domaine: 'Certificats',
    libelle: 'Émission et renouvellement automatiques',
    outil: 'Caddy (Let’s Encrypt)',
    commande: 'docker compose logs caddy | grep -i certificate',
  },
  {
    cle: 'nettoyage',
    domaine: 'Nettoyage',
    libelle: 'Rotation des logs, purge des vieilles images Docker',
    outil: 'logrotate, docker system prune, cron',
    commande: 'docker system prune -f',
  },
  { cle: 'scalabilite', domaine: 'Scalabilité', libelle: 'Ajout/retrait de ressources selon la charge', outil: 'Redimensionnement Hetzner', commande: null },
  {
    cle: 'auto-reparation',
    domaine: 'Auto-réparation',
    libelle: "Redémarrage d'un service planté",
    outil: 'restart: unless-stopped, sondes /health',
    commande: 'docker compose up -d',
  },
  { cle: 'reponse', domaine: 'Réponse automatique', libelle: 'Disque plein : purge des logs ; attaque : bannissement IP', outil: 'CrowdSec, Alertmanager webhook', commande: null },
  { cle: 'couts', domaine: 'Coûts', libelle: 'Arrêt des environnements de test la nuit, alertes de budget', outil: 'Console Hetzner', commande: null },
  { cle: 'inventaire', domaine: 'Inventaire', libelle: 'Liste à jour des serveurs, versions, IP, propriétaires', outil: 'Fiche officine, Ansible facts', commande: null },
];

/** Pipeline type (chapitre 5.1). */
export const PIPELINE: { cle: string; etape: string; contenu: string; bloquant: string }[] = [
  { cle: 'qualite', etape: '1. Qualité', contenu: 'ESLint, Prettier, vérification des types (tsc --noEmit)', bloquant: 'Oui' },
  { cle: 'tests', etape: '2. Tests', contenu: 'Tests unitaires et d’intégration, tests E2E sur les parcours clés', bloquant: 'Oui' },
  { cle: 'sast', etape: '3. Sécurité du code', contenu: 'SAST (Semgrep), détection de secrets (gitleaks)', bloquant: 'Oui si critique' },
  { cle: 'dependances', etape: '4. Dépendances', contenu: 'npm audit / Trivy fs ; mises à jour auto via Renovate', bloquant: 'Oui si critique' },
  { cle: 'build', etape: '5. Build', contenu: 'Image Docker multi-stage taguée avec le SHA du commit, SBOM', bloquant: 'Oui' },
  { cle: 'scan-image', etape: '6. Scan d’image', contenu: 'Trivy / Grype sur l’image finale, signature (cosign)', bloquant: 'Oui si critique' },
  { cle: 'staging', etape: '7. Déploiement staging', contenu: 'Automatique à chaque merge, migrations BDD, tests de fumée', bloquant: 'Oui' },
  { cle: 'production', etape: '8. Production', contenu: 'Validation manuelle ou automatique, canary / blue-green', bloquant: '—' },
  { cle: 'post-deploiement', etape: '9. Post-déploiement', contenu: 'Annotation, surveillance du taux d’erreur, rollback auto si dégradation', bloquant: '—' },
];
