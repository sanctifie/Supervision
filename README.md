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
| **Ressources** | Tous les hôtes et leurs contrôles, état OK / Avertissement / Critique / Inconnu, acquittement, arrêts planifiés, journal des événements, rapports de disponibilité (voir [Outils](#outils-dexploitation)) | 2, 7 |
| **Tableau de bord** | État global vert/orange/rouge, disponibilité et SLO (budget d'erreur), trafic vs J-7, activité récente, un voyant par service métier | 1, 8 |
| **Serveur** | CPU (iowait, steal, charge), mémoire, swap, OOM, disques (espace, **inodes**, prédiction de remplissage), latence disque, descripteurs, uptime, redémarrage requis, dérive de l'horloge, réseau | 2.1, 2.2 |
| **Conteneurs** | CPU et mémoire par conteneur vs limites, redémarrages, conteneurs arrêtés | 2.4 |
| **Services et sondes** | `/health` des 15 services, sondes HTTPS du site, certificat (J-30 / J-14 / J-7), disponibilité heure par heure | 2.2, 2.3, 3.1 |
| **Base de données** | PostgreSQL : en marche, connexions vs max, cache, verrous, deadlocks, taille des bases | 2.5 |
| **Sauvegardes** | Âge de la dernière sauvegarde réussie (orange > 26 h, rouge > 48 h), taille | 4 |
| **API** | Métriques RED par service (débit, 5xx, refus, p50/p95/p99), chute de trafic vs J-7, runtime Node.js (event loop lag, heap, GC) | 3.1, 3.2 |
| **Métier** | Ventes par heure vs J-7, connexions refusées, **alerte « zéro vente » en heure d'ouverture** | 3.6 |
| **Journaux** | Explorateur des journaux de tous les conteneurs (Loki) : recherche et exclusion, histogramme, champs, détail d'une ligne, export CSV, recherches enregistrées avec alertes, en direct | 3.3 |
| **Alertes** | Alertes actives classées P1 → Info, **runbook** pour chaque alerte, silences, envoi d'une alerte de test, « déclarer un incident » | 7.1, 7.2 |
| **Tâches** | Scripts d'exploitation lancés depuis l'interface : modèles, approbation, sortie en direct, historique, plannings | 4, 7 |
| **Analyse de code** | Défauts trouvés par les analyseurs du CI (SARIF) : nouveaux, à traiter, corrigés ; tri, CWE, politique de qualité, problème en un clic | 5.1, 6 |
| **Sécurité** | Contrôles par couche (accès, réseau, détection, durcissement, vulnérabilités, données), signaux mesurés | 2.6, 6 |
| **Automatisations** | Les 12 automatisations côté serveur et les 9 étapes du pipeline CI/CD | 4, 5 |
| **Feuille de route** | Les 5 phases et la checklist de mise en production, cochée automatiquement quand la supervision peut le vérifier | 10 |
| **`/statut`** | Page de statut **publique** (sans connexion, sans détail technique) pour informer pendant un incident | 3.7 |

## Outils d'exploitation

Quatre outils reprennent le fonctionnement de logiciels connus, **dans l'application** :
mêmes comptes, même cloche, mêmes tickets, rien à installer en plus.

### Ressources (à la manière de Centreon)

- **Ce que c'est** : la liste de tout ce qui est surveillé, rangée par **hôte** (le serveur,
  docker, officina, site public, api, postgresql, métier, sauvegardes) et par **contrôle**
  (CPU, disque /, conteneur `notify`, `/health` de `sales`, certificat…).
- **D'où viennent les états** : des mêmes mesures que les autres pages, relues toutes les 30 s
  et comparées aux mêmes seuils : vert = **OK**, orange = **Avertissement**, rouge = **Critique**,
  source muette = **Inconnu**. Une mesure absente (exporteur non installé) n'est pas un contrôle.
- **Confirmation** : un problème n'est confirmé qu'après **3 contrôles identiques** (≈ 1 min 30),
  pour éviter les fausses alertes ; le retour à OK est confirmé tout de suite. Un passage en
  critique confirmé s'inscrit dans le fil d'activité.
- **Acquitter** (« je m'en occupe », commentaire obligatoire) : le problème quitte la liste
  « à traiter » ; l'acquittement tombe tout seul au retour à OK.
- **Arrêt planifié** : sur des contrôles ou tout un hôte, pendant une maintenance (7 jours au plus).
- **Contrôler maintenant** : relit toutes les sources sans attendre.
- **Journal des événements** : chaque changement d'état confirmé, gardé 31 jours.
- **Disponibilité** : part du temps OK / avertissement / critique de chaque contrôle sur 24 h,
  7 ou 30 jours, et nombre de pannes.
- Les **alertes** (Telegram, e-mail) restent celles d'Alertmanager (page Alertes) : la page
  Ressources ne prévient pas une deuxième fois.

### Journaux (à la manière de Kibana « Discover »)

- Chercher un texte, **exclure** le bruit (« sauf healthcheck »), choisir service et période.
- **Histogramme** du volume (info, avertissements, erreurs) : on voit quand ça a commencé.
- **Champs** : les services et niveaux les plus présents ; un clic filtre.
- Un clic sur une ligne : son **détail** (les champs d'une ligne JSON sont séparés).
- **Export CSV** des lignes affichées (500 au plus).
- **Recherches enregistrées**, partagées avec l'équipe, avec en option une **alerte** :
  « au moins N lignes en M minutes → prévenir les agents » (une alerte par fenêtre).

### Tâches (à la manière d'AWX)

- Un **modèle de tâche** lance un **script du dossier `scripts/`**, jamais autre chose : pas de
  shell, un environnement réduit (aucun secret de la supervision), un délai maximum.
- Un **paramètre** (ex. le service à redémarrer) ne peut prendre **qu'une valeur de sa liste**.
- Un agent lance ; un modèle **sensible** attend l'accord d'un **approbateur autre que le
  demandeur**. La sortie s'affiche **en direct** ; un échec prévient les agents.
- **Plannings** : toutes les heures, chaque jour ou chaque semaine (heure de `FUSEAU`). Planifier
  un modèle sensible est réservé aux approbateurs.
- Deux tâches au plus en même temps, jamais deux fois le même modèle.
- Les administrateurs créent et modifient les modèles. Modèles fournis :

  | Modèle | Script | Sensible |
  |--------|--------|----------|
  | Vérifier les services (/health) | `verifier-services.mjs` (lit Prometheus) | non |
  | Sauvegarder maintenant | `sauvegarder.sh` (lance `deploy/backup.sh` d'Officina) | non |
  | Redémarrer un service | `redemarrer-service.sh <service>` | oui |
  | Nettoyer Docker | `nettoyer-docker.sh` (images et cache de plus de 7 jours) | oui |

- `verifier-services.mjs` marche tel quel. Les trois autres agissent sur Docker : il faut
  décommenter dans `docker-compose.yml` le socket Docker, le dossier d'Officina et `group_add`.
  **Le socket Docker donne l'équivalent d'un accès root au serveur** : ne l'ouvrez que si vous
  en avez besoin.
- En **démonstration**, les tâches sont simulées : aucun script n'est lancé.

### Analyse de code (à la manière de Coverity)

- Le **CI** lance un analyseur qui produit du **SARIF** (Semgrep, CodeQL, ESLint, Trivy…) et
  l'envoie à la supervision avec le jeton `SUPERVISION_JETON_CI` :

  ```bash
  semgrep scan --config auto --sarif -o rapport.sarif
  curl -fsS -X POST -H "Authorization: Bearer $SUPERVISION_JETON_CI" \
    -H "Content-Type: application/json" --data-binary @rapport.sarif \
    "https://supervision.mon-officine.ga/api/qualite/analyses?projet=officina&branche=main&commit=$COMMIT"
  ```

  Un agent peut aussi importer un fichier SARIF depuis la page.
- Chaque défaut reçoit un **CID** stable : son empreinte ne dépend pas du numéro de ligne, il
  reste le même quand le code bouge. D'une analyse à l'autre il est **nouveau**, **à traiter**,
  **corrigé** (absent de la dernière analyse) ou **réapparu**.
- **Impact** élevé / moyen / faible (score de sécurité ou niveau de l'analyseur), **catégorie**,
  **CWE** (lien vers la fiche MITRE).
- **Tri** par l'équipe : classement (bug, faux positif, intentionnel — ces deux derniers avec
  une raison obligatoire), action, gravité, propriétaire ; tout est tracé dans l'historique.
- **Ouvrir un problème** (`PRB…`) relié au défaut, assigné au propriétaire, groupe Développement.
- **Politique de qualité** : aucun nouveau défaut d'impact élevé. Sinon l'envoi répond
  **422** et le `curl -f` fait échouer le CI ; `&politique=ignorer` enregistre sans bloquer.
- Synthèse : à traiter par impact, corrigés sur 30 jours, tendance, répartition par catégorie,
  CWE et fichier.

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
tickets, comptes, paramètres, défauts de code, tâches, recherches et états des ressources, `pieces/` pour les pièces jointes.
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

## Installer à côté d'Officina (production)

Prérequis : Officina tourne avec sa supervision
(`docker compose -f docker-compose.prod.yml -f supervision/docker-compose.supervision.yml up -d`).

```bash
git clone https://github.com/sanctifie/Supervision.git /opt/supervision
cd /opt/supervision
cp .env.exemple .env
nano .env                     # SUPERVISION_CODE_INSTALLATION au minimum
docker network ls             # vérifier le nom du réseau d'Officina (officine-os_default)
docker compose up -d --build
```

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
| `NOM_PRODUIT` | `Officina` | |
| `FUSEAU`, `HEURE_OUVERTURE`, `HEURE_FERMETURE` | `Africa/Libreville`, `8`, `20` | Pour l'alerte « zéro vente » |
| `COOKIE_SECURISE` | `false` | `true` derrière HTTPS |
| `RESEAU_OFFICINA` | `officine-os_default` | Réseau Docker d'Officina |
| `SUPERVISION_JETON_CI` | *(vide)* | Jeton du CI pour envoyer les rapports d'analyse de code. Vide : import manuel seulement |
| `DOSSIER_SCRIPTS` | `./scripts` (`/app/scripts` dans l'image) | Les seuls scripts que les tâches peuvent lancer |
| `DOSSIER_DONNEES` | `./donnees` | Tickets, équipe, checklist, fil d'activité (`etat.json` + copies quotidiennes) |

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
  ressources.ts    hôtes et contrôles (Centreon) ; explorateur.ts : recherches et alertes journaux (Kibana)
  taches.ts        tâches automatisées (AWX) ; qualite.ts : analyse de code SARIF (Coverity)
scripts/           les scripts que les tâches ont le droit de lancer
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
