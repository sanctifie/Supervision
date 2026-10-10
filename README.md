# Supervision Officina

Une application web pour **voir d'un coup d'œil** si Officina (dépôt
[Pharmatech](https://github.com/sanctifie/Pharmatech)) va bien, et pour **agir**
quand ce n'est pas le cas. Elle reprend le guide *Automatisation & Supervision* :
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
| **Alertes** | Alertes actives classées P1 → Info, **runbook** pour chaque alerte, silences, envoi d'une alerte de test | 7.1, 7.2 |
| **Incidents** | Ouverture automatique sur P1/P2, acquittement, résolution, notes, **post-mortem** (modèle fourni), MTTA / MTTR | 7.3 |
| **Sécurité** | Contrôles par couche (accès, réseau, détection, durcissement, vulnérabilités, données), signaux mesurés | 2.6, 6 |
| **Automatisations** | Les 12 automatisations côté serveur et les 9 étapes du pipeline CI/CD | 4, 5 |
| **Feuille de route** | Les 5 phases et la checklist de mise en production, cochée automatiquement quand la supervision peut le vérifier | 10 |
| **`/statut`** | Page de statut **publique** (sans connexion, sans détail technique) pour informer pendant un incident | 3.7 |

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
nano .env                     # SUPERVISION_MOT_DE_PASSE au minimum
docker network ls             # vérifier le nom du réseau d'Officina (officine-os_default)
docker compose up -d --build
```

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
| `SUPERVISION_MOT_DE_PASSE` | *(vide)* | Mot de passe de l'interface. Vide : seul le nom est demandé (à éviter en production). |
| `SUPERVISION_MODE` | `auto` | `auto` (Prometheus s'il répond, sinon démo), `reel`, `demo` |
| `PROMETHEUS_URL` | `http://prometheus:9090` | |
| `ALERTMANAGER_URL` | `http://alertmanager:9093` | Alertes, silences, alerte de test |
| `LOKI_URL` | `http://loki:3100` | Journaux |
| `GRAFANA_URL` | *(vide)* | Lien « Ouvrir Grafana » |
| `NOM_PRODUIT` | `Officina` | |
| `FUSEAU`, `HEURE_OUVERTURE`, `HEURE_FERMETURE` | `Africa/Libreville`, `8`, `20` | Pour l'alerte « zéro vente » |
| `COOKIE_SECURISE` | `false` | `true` derrière HTTPS |
| `RESEAU_OFFICINA` | `officine-os_default` | Réseau Docker d'Officina |
| `DOSSIER_DONNEES` | `./donnees` | Incidents, checklist, fil d'activité (`etat.json`) |

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
  incidents.ts     cycle d'incident, MTTA / MTTR
  catalogues.ts    contenu du guide : checklist, phases, sécurité, automatisations
web/src/           interface React (Vite, Recharts)
shared/            types, seuils, runbooks, mise en forme (communs)
```

Tests : `npm test`. Vérification des types : `npm run typecheck`.
