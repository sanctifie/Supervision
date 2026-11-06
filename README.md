# Supervision Officina

Une application web pour **voir d'un coup d'œil** si Officina (dépôt
[Pharmatech](https://github.com/sanctifie/Pharmatech)) va bien, pour **agir**
quand ce n'est pas le cas, et pour **suivre tout le travail d'exploitation**
comme dans un ITSM (type ServiceNow) : incidents, problèmes, changements et
demandes. Elle reprend le guide *Automatisation & Supervision* :
seuils, alertes, incidents, automatisations, sécurité et feuille de route.

L'état global (vert / orange / rouge) se lit en trois secondes. Chaque voyant
est cliquable et mène au détail.

> **Rien n'est modifié dans Officina.** L'application lit les outils déjà
> installés par `supervision/docker-compose.supervision.yml` (Pharmatech) :
> Prometheus, Alertmanager et Loki.

## Ce qu'on y trouve

| Vue | Contenu | Chapitre du guide |
|-----|---------|-------------------|
| **Tableau de bord** | État global vert/orange/rouge, disponibilité et SLO (budget d'erreur), trafic vs J-7, activité récente, un voyant par service métier | 1, 8 |
| **Serveur** | CPU (iowait, steal, charge), mémoire, swap, OOM, disques (espace, **inodes**, prédiction de remplissage), latence disque, descripteurs, uptime, redémarrage requis, dérive de l'horloge, réseau | 2.1, 2.2 |
| **Conteneurs** | CPU et mémoire par conteneur vs limites, redémarrages, conteneurs arrêtés | 2.4 |
| **Services et sondes** | `/health` des 15 services, sondes HTTPS du site, certificat (J-30 / J-14 / J-7), disponibilité heure par heure | 2.2, 2.3, 3.1 |
| **Base de données** | PostgreSQL : en marche, connexions vs max, cache, verrous, deadlocks, taille des bases | 2.5 |
| **Sauvegardes** | Âge de la dernière sauvegarde réussie (orange > 26 h, rouge > 48 h), taille | 4 |
| **API** | Métriques RED par service (débit, 5xx, refus, p50/p95/p99), chute de trafic vs J-7, runtime Node.js (event loop lag, heap, GC) | 3.1, 3.2 |
| **Métier** | Ventes par heure vs J-7, connexions refusées, **alerte « zéro vente » en heure d'ouverture** | 3.6 |
| **Journaux** | Journaux de tous les conteneurs (Loki), filtres par service / niveau / texte, en direct | 3.3 |
| **Alertes** | Alertes actives classées P1 → Info, **runbook** pour chaque alerte, silences, envoi d'une alerte de test, « déclarer un incident » | 7.1, 7.2 |
| **Orchestration** | **GitLab** ou **GitHub Actions** (pipelines, demandes de fusion, étapes du dernier pipeline), **AWX** (jobs Ansible, modèles de job) et **Control-M** (jobs planifiés) dans une seule chronologie ; **SonarQube** (porte qualité, bugs, vulnérabilités, couverture, duplication) ; lancer un pipeline ou un modèle AWX, relancer une exécution ; un voyant « Orchestration » sur le tableau de bord | 4, 5 |
| **Outils connectés** | **Sentry** (issues, résolution), **UptimeRobot / Uptime Kuma** (sondes externes), **Trivy / Grype** (CVE des images), **CrowdSec**, **Wazuh**, **Falco**, **Lynis**, **AIDE** (sécurité et durcissement), **Argo CD** (GitOps, synchronisation), **Hetzner Cloud** (inventaire, coûts), **Jaeger** (traces). Chacun se relie par ses variables `.env` et coche seul les contrôles de sécurité, la checklist et les automatisations qu'il couvre | 1, 2, 5, 6 |
| **Sécurité** | Contrôles par couche (accès, réseau, détection, durcissement, vulnérabilités, données), signaux mesurés | 2.6, 6 |
| **Automatisations** | Les 12 automatisations côté serveur et les 9 étapes du pipeline CI/CD | 4, 5 |
| **Feuille de route** | Les 5 phases et la checklist de mise en production, cochée automatiquement quand la supervision peut le vérifier | 10 |
| **`/statut`** | Page de statut **publique** (sans connexion, sans détail technique) pour informer pendant un incident | 3.7 |

## Comptes et rôles

Chacun a son compte (identifiant + mot de passe) : ses actions sont signées de son nom.

| Rôle | Peut |
|------|------|
| **Administrateur** | Tout, y compris créer, modifier et désactiver les comptes, et gérer les groupes |
| **Agent du service desk** | Traiter les incidents, problèmes, changements et demandes ; poser des silences ; cocher la feuille de route |
| **Demandeur** (personnel de l'officine, direction) | Consulter la supervision, déclarer des incidents et des demandes, commenter les siens. Ne voit pas les notes de travail internes |
| + **Approbateur (CAB)** | Case à cocher sur un compte : approuve ou rejette les changements |

- Un changement ne peut pas être approuvé par son demandeur (séparation des tâches).
- Un nouveau compte reçoit un mot de passe provisoire, affiché une seule fois à
  l'administrateur ; il doit être changé à la première connexion (10 caractères minimum).
- Les mots de passe sont hachés (scrypt) ; les sessions durent `SUPERVISION_SESSION_HEURES`
  et survivent aux redémarrages. Changer son mot de passe ferme ses autres sessions ;
  désactiver un compte ou réinitialiser son mot de passe ferme toutes les siennes.
- 10 essais de connexion par quart d'heure, par adresse et par identifiant.
- Il reste toujours au moins un administrateur actif.
- **Mot de passe administrateur perdu** : sur l'écran de connexion, « Secours
  administrateur », avec le code d'installation : un mot de passe provisoire est donné.

## Notifications

Chaque notification arrive dans la **cloche** de l'application ; elle part aussi sur
**Telegram** et par **e-mail** si le serveur est configuré (`.env`) et selon les choix de
chacun dans **Mon profil** (avec un bouton « M'envoyer un test »). On n'est jamais prévenu
de sa propre action.

| Événement | Qui est prévenu |
|-----------|-----------------|
| Incident P1/P2 ouvert | Tous les agents + la conversation Telegram de l'équipe |
| Incident P3/P4 ou demande ouverts | L'assigné, sinon les agents de son groupe, sinon tous les agents |
| Ticket assigné | La personne assignée |
| Changement soumis au CAB | Les approbateurs |
| Changement approuvé / rejeté | Le demandeur et l'auteur du changement |
| Réponse de l'équipe (commentaire) | Le demandeur |
| Message du demandeur | L'assigné (ou son groupe) |
| Note de travail d'un collègue | L'assigné |
| Incident ou demande résolu | Le demandeur |
| Ticket rouvert | L'assigné (ou son groupe) |
| SLA à risque (75 % du délai écoulé) | L'assigné (ou son groupe) |
| SLA dépassé | L'assigné, les administrateurs, et l'équipe pour un P1/P2 |

Les variables reprennent celles de la supervision d'Officina : `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `SMTP_HOTE`, `SMTP_UTILISATEUR`, `SMTP_MOT_DE_PASSE` (voir `.env.exemple`),
plus `URL_PUBLIQUE` pour mettre un lien vers le ticket dans chaque message.

## Service desk (ITSM)

L'outil de travail principal de l'équipe, inspiré d'ITIL / ServiceNow.

| Ticket | Numéro | Cycle de vie | Règles |
|--------|--------|--------------|--------|
| **Incident** | `INC0001001` | Nouveau → En cours → En attente → Résolu → Clos | Priorité = impact × urgence (P1 à P4) ; SLA de prise en charge et de résolution ; résolution avec code + notes obligatoires ; post-mortem pour P1/P2 |
| **Problème** | `PRB0001001` | Nouveau → Analyse → Erreur connue → Résolu → Clos | Erreur connue = contournement documenté ; résolu = cause racine écrite |
| **Changement** | `CHG0001001` | Brouillon → Évaluation → Approuvé → Planifié → En cours → Revue → Clos | Standard (pré-approuvé), normal (CAB), urgent ; justification, plan de mise en œuvre, plan de retour arrière ; approbation tracée ; fenêtre obligatoire ; résultat (réussi / échoué / retour arrière) |
| **Demande** | `REQ0001001` | Nouvelle → En cours → En attente → Traitée → Close | SLA comme les incidents |

- **Accueil service desk** : mes tickets, non assignés, incidents majeurs en cours,
  SLA dépassés / à risque, changements à approuver et à venir, MTTA, MTTR, taux de SLA tenus.
- **Fiche ticket** : barre d'étapes, actions possibles (avec la raison quand c'est bloqué),
  champs modifiables, notes de travail (internes) et commentaires, historique complet de
  chaque modification, tickets liés (incident → problème → changement, en un clic).
- **SLA** en **heures ouvrées** (calendrier de service : lundi-samedi 8 h-20 h, jours fériés du
  Gabon ; modifiable dans **Service desk → Paramètres**). Les P1 courent 24 h/24.
  Un ticket « En attente » met son délai en pause ; à la reprise, les échéances sont repoussées.

  | Priorité | Incident : prise en charge | Incident : résolution | Demande : prise en charge | Demande : résolution |
  |----------|------|------|------|------|
  | P1 (24 h/24) | 15 min | 4 h | 1 h | 8 h |
  | P2 | 1 h | 8 h | 4 h | 12 h |
  | P3 | 4 h | 36 h (≈ 3 jours) | 8 h | 36 h |
  | P4 | 12 h | 60 h (≈ 5 jours) | 12 h | 60 h |

- **Lien avec la supervision** :
  - une alerte P1 ou P2 ouvre un incident automatiquement (avec son CI) ; s'il n'a pas été
    pris en charge quand l'alerte disparaît, il se résout seul, sinon une note le signale ;
  - un changement « En cours » met en silence les alertes de son CI pendant la fenêtre ;
  - avant un changement, l'application avertit si le budget d'erreur est entamé (gel
    recommandé au-delà de 100 %), si la fenêtre chevauche un autre changement sur le même
    élément, ou si elle tombe pendant les heures d'ouverture.
- **Pièces jointes** : captures d'écran, PDF, journaux… (10 Mo, 20 par ticket) par
  glisser-déposer, sélection ou collage direct d'une capture (Ctrl+V). Un demandeur peut
  joindre des fichiers à ses tickets. Les fichiers sont servis sans jamais s'exécuter dans
  la page (bac à sable, types non affichables téléchargés).
- **Catalogue de demandes** : des demandes prêtes à commander, chacune avec son formulaire
  (créer un compte Officina, désactiver un compte au départ, réinitialiser un PIN, installer un
  poste comptoir, réparer un matériel, ajouter ou corriger un produit, export de données,
  formation). Les réponses sont contrôlées (champs requis, listes, dates, nombres) ; la demande
  arrive avec un titre clair, sa priorité et le bon groupe. Les administrateurs ajoutent,
  modifient ou masquent les articles et leurs champs (**Catalogue → Gérer le catalogue**).
- **Base de connaissances** (`KB0001001`) : articles en Markdown simple (brouillon → publié →
  retiré, versions gardées), visibles par l'équipe seulement ou par tout le monde ; recherche
  sans accents (titre, mots-clés, texte) ; avis « utile / pas utile » (un par personne).
  Un article se rédige **depuis un incident résolu ou un problème** (pré-rempli : symptômes,
  cause, contournement ou solution) et reste lié au ticket. En ouvrant un incident ou une
  demande, les articles qui correspondent au titre sont **proposés tout de suite** ; sur la
  fiche d'un ticket ouvert, les agents voient les articles qui peuvent aider.
- **Calendrier des changements** : deux semaines, couleur selon le risque.
- **Équipe** : personnes assignables et groupes d'affectation (Exploitation, Développement,
  Support officine…). Toute personne qui agit est ajoutée automatiquement.
- Un ticket résolu se clôt seul après 3 jours.

### Où sont les tickets, et comment les sauvegarder

Tout est dans le volume Docker `donnees` (monté sur `/donnees`) : `etat.json` pour les
tickets, comptes et paramètres, `pieces/` pour les pièces jointes.
L'application en garde **une copie par jour** dans `donnees/copies/` (30 jours). Si le
fichier devient illisible, il est mis de côté (`etat.json.illisible-…`), jamais écrasé.

C'est désormais l'outil de travail : **incluez ce volume dans les sauvegardes hors site**
(par exemple `docker run --rm -v supervision_donnees:/d alpine tar czf - /d > supervision.tgz`
dans la tâche de sauvegarde nocturne).

## Essayer tout de suite (démonstration)

Sans Prometheus joignable, l'application passe en **mode démonstration** : une
officine fictive de Libreville, avec un disque à 86 % (orange), un certificat
qui expire dans 19 jours, et une panne simulée du service `notify` toutes les
3 heures (rouge, incident ouvert puis résolu automatiquement).

```bash
npm install
npm run build
npm start            # http://localhost:8080
```

En développement (rechargement à chaud) : `npm run dev` puis http://localhost:5173.

## Installer sur un serveur

Deux cas. Dans les deux, l'application est le dépôt cloné dans `/opt/supervision`,
et tout se règle dans `.env` (copié depuis `.env.exemple`).

### Serveur neuf : tout installer d'un coup

`deploy/installer.sh` installe la pile de mesure que l'application lit, puis
l'application, puis les outils optionnels demandés. Il est idempotent : relancez-le
après chaque modification du `.env`.

```bash
git clone https://github.com/sanctifie/Supervision.git /opt/supervision
cd /opt/supervision
bash deploy/installer.sh      # 1er passage : crée .env et s'arrête
nano .env                     # SUPERVISION_CODE_INSTALLATION, POSTGRES_PASSWORD, URL_PUBLIQUE, Telegram…
bash deploy/installer.sh      # installe et démarre tout
bash deploy/installer.sh --outils uptime-kuma,trivy     # plus tard, des outils en plus
```

Ce que la pile contient (`deploy/docker-compose.supervision.yml`, réseau Docker
d'Officina, aucun port publié, images épinglées) :

| Service | Rôle | Fichier |
|---------|------|---------|
| Prometheus | Mesures, règles d'alerte (une par runbook) | `deploy/supervision/prometheus.yml.gabarit`, `alertes.yml` |
| Alertmanager | Envoi Telegram / e-mail, silences | `alertmanager.yml.gabarit` (récepteurs insérés depuis le `.env`) |
| Loki + Alloy | Journaux de tous les conteneurs, étiquette `service` | `loki.yml`, `alloy.alloy` |
| node-exporter, cAdvisor | Serveur et conteneurs | |
| blackbox | `/health` des 15 services (`PORT_SERVICES`), site public (`URL_PUBLIQUE`) | `blackbox.yml` |
| postgres-exporter | PostgreSQL d'Officina (`POSTGRES_*`) | |

Les fichiers générés vont dans `deploy/supervision/genere/` (ignoré par Git : ils
contiennent les secrets). Les sauvegardes déposent leurs mesures (`officine_sauvegarde_*`,
fichier `.prom`) dans `DOSSIER_MESURES` (`deploy/mesures/` par défaut), lu par node-exporter.

Outils optionnels, chacun derrière un profil de `deploy/docker-compose.outils.yml` :

| Profil | Outil | Puis dans `.env` |
|--------|-------|------------------|
| `uptime-kuma` | Sondes externes (interface sur 127.0.0.1:3001) | `UPTIMEKUMA_URL=http://uptime-kuma:3001`, `UPTIMEKUMA_CLE` (clé API) |
| `sonarqube` | Qualité du code (127.0.0.1:9000 ; `sysctl -w vm.max_map_count=524288`) | `SONAR_URL=http://sonarqube:9000`, `SONAR_JETON`, `SONAR_PROJET` |
| `jaeger` | Traces OpenTelemetry (127.0.0.1:16686, OTLP sur `jaeger:4317`) | `JAEGER_URL=http://jaeger:16686` |
| `crowdsec` | Détection SSH / Caddy ; clé : `docker compose -f deploy/docker-compose.outils.yml exec crowdsec cscli bouncers add supervision` | `CROWDSEC_URL=http://crowdsec:8080`, `CROWDSEC_CLE` |
| `trivy` | Scan quotidien des images `TRIVY_IMAGES` → `/donnees/rapports/trivy.json` | `TRIVY_RAPPORT=/donnees/rapports/trivy.json` (défaut) |
| `falco` | Comportements anormaux dans les conteneurs (privilégié, eBPF) | `FALCO_METRICS_URL=http://falco:8765` |

Lynis et AIDE tournent sur l'hôte et écrivent un rapport ; copiez-le dans le volume
des rapports, l'application le lit :

```bash
# /etc/cron.daily/supervision-rapports
lynis audit system --quiet && cp /var/log/lynis-report.dat /var/lib/docker/volumes/supervision_rapports/_data/
aide --check > /var/lib/docker/volumes/supervision_rapports/_data/aide.txt || true
```

avec `LYNIS_RAPPORT=/donnees/rapports/lynis-report.dat` et `AIDE_RAPPORT=/donnees/rapports/aide.txt`.

### Officina a déjà sa supervision (dépôt Pharmatech)

Prometheus, Alertmanager et Loki existent déjà (`supervision/docker-compose.supervision.yml`) :
n'installez que l'application.

```bash
git clone https://github.com/sanctifie/Supervision.git /opt/supervision
cd /opt/supervision
cp .env.exemple .env
nano .env                     # SUPERVISION_CODE_INSTALLATION au minimum
docker network ls             # vérifier le nom du réseau d'Officina (officine-os_default)
bash deploy/installer.sh --sans-pile     # ou : docker compose up -d --build
```

### Après l'installation

À la première ouverture, l'interface demande de **créer le compte administrateur**
(avec le code d'installation). L'administrateur crée ensuite les comptes de
l'équipe dans **Service desk → Équipe**.

L'interface écoute sur `127.0.0.1:8080`. Pour l'ouvrir depuis un poste :

```bash
ssh -L 8080:127.0.0.1:8080 utilisateur@serveur
# puis http://localhost:8080
```

Pour la publier en HTTPS, ajouter un bloc dans le Caddyfile du serveur, par
exemple sur un sous-domaine, et mettre `COOKIE_SECURISE=true` :

```
supervision.mon-officine.ga {
	reverse_proxy 127.0.0.1:8080
}
```

## Configuration (`.env`)

| Variable | Défaut | Rôle |
|----------|--------|------|
| `SUPERVISION_CODE_INSTALLATION` | *(vide)* | Crée le premier administrateur et sert de secours. Vide : l'installation n'est possible que depuis la machine elle-même. |
| `SUPERVISION_SESSION_HEURES` | `12` | Durée d'une session |
| `SUPERVISION_MODE` | `auto` | `auto` (Prometheus s'il répond, sinon démo), `reel`, `demo` |
| `PROMETHEUS_URL` | `http://prometheus:9090` | |
| `ALERTMANAGER_URL` | `http://alertmanager:9093` | Alertes, silences, alerte de test |
| `LOKI_URL` | `http://loki:3100` | Journaux |
| `GRAFANA_URL` | *(vide)* | Lien « Ouvrir Grafana » |
| `GITLAB_URL`, `GITLAB_JETON`, `GITLAB_PROJET` | *(vides)* | Pipelines et demandes de fusion du projet (identifiant ou `groupe/projet`) ; jeton avec l'accès API |
| `AWX_URL`, `AWX_JETON` | *(vides)* | Jobs et modèles de job AWX ; jeton personnel (portée « write » pour lancer) |
| `CONTROLM_URL`, `CONTROLM_JETON` | *(vides)* | Statut des jobs Control-M (Automation API) et relance ; jeton d'API |
| `SONAR_URL`, `SONAR_JETON`, `SONAR_PROJET` | *(vides)* | Porte qualité et mesures SonarQube / SonarCloud du projet ; jeton utilisateur |
| `NOM_PRODUIT` | `Officina` | |
| `FUSEAU`, `HEURE_OUVERTURE`, `HEURE_FERMETURE` | `Africa/Libreville`, `8`, `20` | Pour l'alerte « zéro vente » |
| `COOKIE_SECURISE` | `false` | `true` derrière HTTPS |
| `RESEAU_OFFICINA` | `officine-os_default` | Réseau Docker d'Officina |
| `DOSSIER_DONNEES` | `./donnees` | Tickets, équipe, checklist, fil d'activité (`etat.json` + copies quotidiennes) |
| `PORT_SERVICES` | `3000` | Port `/health` et `/metrics` des services Officina (pile `deploy/`) |
| `DOSSIER_MESURES` | `deploy/mesures` | Dossier des mesures textfile (sauvegardes) lu par node-exporter (pile `deploy/`) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOTE` | `officine`, *(requis)*, `postgres`, `postgres` | Accès de postgres-exporter à la base d'Officina (pile `deploy/`) |
| `ALERTES_EMAIL` | *(vide)* | Destinataire des alertes Alertmanager par e-mail (pile `deploy/`) |
| `TRIVY_IMAGES` | images Officina | Images scannées chaque jour par le profil `trivy` |

## Architecture

Deux familles de sources, chacune avec une version réelle et une version de démonstration :

| Famille | Outils | Interface | Choix réel / démo |
|---------|--------|-----------|-------------------|
| **Observabilité** | Prometheus, Alertmanager, Loki | `Fournisseur` (`server/src/fournisseurs/`) | Prometheus répond → réel, sinon démo (`SUPERVISION_MODE`) |
| **Orchestration** | GitLab, AWX, Control-M | `Outil` (`server/src/outils/`) | Outil configuré dans `.env` → réel ; sinon simulé quand la supervision est en démo ; sinon « non configuré » |

SonarQube s'y ajoute en lecture (`outils/sonar.ts`) : porte qualité et mesures du projet.

Les autres outils sont des **signaux** (`server/src/outils/signaux/`, un fichier par outil,
interface `SourceSignal`) : un état, un résumé, des mesures, des lignes avec leurs actions
réelles (résoudre une issue Sentry, synchroniser une application Argo CD), et les cases que
l'outil vérifie seul (`securite:cve`, `checklist:sentry`, `automatisation:inventaire`…).
Ajouter un outil = un fichier et une ligne dans `signaux/index.ts`. La page **Outils connectés**
les affiche tous de la même façon ; un voyant « Outils connectés » les résume sur le tableau
de bord.

Les trois outils d'orchestration livrent leurs exécutions dans **un même modèle**
(`shared/outils.ts` : nom, contexte, état `succes / echec / en-cours / attente / annule`,
début, fin, auteur, lien). Le serveur n'en fait qu'une vue (`/api/outils`), un voyant
(« Orchestration » : orange si la dernière exécution terminée d'un job a échoué ou si un
outil configuré ne répond pas) et des événements (chaque échec, une seule fois ; chaque
lancement, signé). Les jetons restent côté serveur ; lancer et relancer demandent le rôle
agent.

### Comment tout est relié

| De | Vers | Lien |
|----|------|------|
| Changement « En cours » | GitLab / AWX | Bouton **Lancer** sur la fiche : le pipeline ou le job est rattaché au changement, son résultat y est tracé ; l'assigné est prévenu (cloche, Telegram, e-mail) |
| Job échoué (GitLab, AWX, Control-M) | Incident | Un incident **P3 automatique** par job (catégorie Automatisation), lié au changement qui l'a lancé ; résolu de lui-même quand le job réussit, s'il n'a pas été pris en charge |
| Déploiement réussi (AWX, pipeline de `main`) | Tableau de bord | Repère ▲ sur la courbe de trafic, pour voir l'effet d'une mise en production |
| GitLab, AWX, SonarQube | Feuille de route, Automatisations | « Pipeline CI » coché par le dernier pipeline de `main` ; « Configuration (Ansible) » par le dernier job AWX ; étapes Qualité / Tests / Build du pipeline par SonarQube et GitLab |
| Changement « En cours » | Alertmanager | Silence des alertes du CI pendant la fenêtre (déjà en place) |
| Orchestration | Fil d'activité | Chaque échec une fois, chaque lancement signé |

## Comment c'est calculé

- **Seuils** : tous dans [`shared/seuils.ts`](shared/seuils.ts), repris du guide
  (CPU 80/95 %, mémoire 85/95 %, disque 80/90 %, inodes 80/90 %, horloge
  100 ms / 1 s, 5xx 1 %, p95 800 ms…).
- **État global** (guide, chapitre 8) : **rouge** dès qu'une alerte P1 est active,
  qu'une sonde HTTPS échoue, qu'aucune vente n'est enregistrée en heure d'ouverture
  ou que Prometheus est injoignable. **Orange** dès qu'une alerte est active,
  que le budget d'erreur dépasse 50 % ou qu'un domaine est dégradé. Sinon **vert**.
- **Priorités** : la gravité Officina `critique` donne P1 ; `attention` donne P2
  (erreurs, lenteur, connexions) ou P3 (disque, mémoire, sauvegarde). Une
  étiquette `priorite: P1|P2|P3|Info` sur une règle Prometheus l'emporte.
- **Une mesure absente** (exporteur non installé) s'affiche « Non mesuré » : elle
  n'est jamais inventée.

## Structure

```
server/src/        API Express (TypeScript)
  fournisseurs/    reel.ts (Prometheus, Alertmanager, Loki) et demo.ts
  analyse.ts       valeurs brutes → vues colorées selon les seuils
  supervision.ts   choix de la source, cache, état global, boucle de fond
  tickets.ts       moteur ITSM : cycle de vie, règles, SLA, liens, approbations
  comptes.ts       comptes, mots de passe, sessions ; acces.ts : contrôle d'accès
  notifications.ts qui prévenir ; canaux.ts : Telegram et e-mail
  pieces.ts        pièces jointes
  connaissances.ts base de connaissances ; catalogue.ts : catalogue de demandes
  catalogues.ts    contenu du guide : checklist, phases, sécurité, automatisations
  outils/          orchestration : gitlab.ts, github.ts, awx.ts, controlm.ts, sonar.ts (clients),
                   demo.ts, etapes.ts (jobs → étapes du pipeline), outils.ts (vue unifiée,
                   voyant, fil d'activité), api.ts (/api/outils)
    signaux/       un fichier par outil relié (Sentry, UptimeRobot, Uptime Kuma, Trivy, CrowdSec,
                   Wazuh, Falco, Lynis, AIDE, Argo CD, Hetzner, Jaeger) ; index.ts les liste
deploy/            pile de supervision et outils optionnels pour un serveur neuf (installer.sh)
web/src/           interface React (Vite, Recharts) ; pages/itsm/ pour le service desk
shared/            types, seuils, runbooks, modèle ITSM (itsm.ts), mise en forme
```

Tests : `npm test`. Vérification des types : `npm run typecheck`.

## Sessions Claude Code dans le cloud

`.claude/hooks/session-start.sh` prépare chaque session cloud : `npm install`, puis
trois outils pour l'agent, à versions figées :

- **Graphify** (carte du code : `/graphify .`) ;
- **Ponytail** (extension : code minimal et testé) ;
- **REA** (serveur MCP de rétro-ingénierie).

Le script est idempotent et ne s'exécute que dans le cloud (`CLAUDE_CODE_REMOTE`).
