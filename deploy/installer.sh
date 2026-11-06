#!/usr/bin/env bash
# ============================================================================
# Installe la supervision d'Officina sur un serveur :
#   1. la pile de mesure (Prometheus, Alertmanager, Loki, exporteurs) ;
#   2. l'application (ce dépôt) ;
#   3. les outils optionnels demandés (--outils uptime-kuma,trivy,…).
# Idempotent : relancer après un changement du .env regénère les fichiers
# de deploy/supervision/genere/ et redémarre ce qui a changé.
#
#   bash deploy/installer.sh
#   bash deploy/installer.sh --outils uptime-kuma,trivy,crowdsec
#   bash deploy/installer.sh --sans-pile        # Officina a déjà sa supervision Pharmatech
# ============================================================================
set -euo pipefail

DEPOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$DEPOT"
PILE=deploy/docker-compose.supervision.yml
OUTILS_COMPOSE=deploy/docker-compose.outils.yml
GENERE=deploy/supervision/genere
PROFILS=""
AVEC_PILE=1

while [ $# -gt 0 ]; do
  case "$1" in
    --outils) PROFILS=${2:-}; shift ;;
    --outils=*) PROFILS=${1#*=} ;;
    --sans-pile) AVEC_PILE=0 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
  shift
done

echo "== Supervision Officina : installation dans $DEPOT"

# --- 1. Prérequis ---------------------------------------------------------
command -v docker >/dev/null || { echo "Docker manque : https://docs.docker.com/engine/install/" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Le plugin « docker compose » (v2) manque." >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Le démon Docker ne répond pas (droits ? sudo ?)." >&2; exit 1; }

if [ ! -f .env ]; then
  cp .env.exemple .env
  chmod 600 .env
  echo "Un fichier .env a été créé depuis .env.exemple."
  echo "Remplissez-le (SUPERVISION_CODE_INSTALLATION, POSTGRES_PASSWORD, URL_PUBLIQUE, Telegram…) puis relancez : bash deploy/installer.sh"
  exit 0
fi
# Lecture du .env comme docker compose le fait (valeurs littérales, guillemets
# englobants retirés) : pas de « source », qu'une apostrophe dans un mot de passe casserait.
command -v python3 >/dev/null || { echo "python3 manque (apt install python3)." >&2; exit 1; }
while IFS=$'\t' read -r cle valeur; do export "$cle=$valeur"; done < <(python3 - <<'PY'
import re
for ligne in open('.env', encoding='utf-8'):
    m = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$', ligne.rstrip('\n'))
    if not m:
        continue
    cle, v = m.group(1), m.group(2).strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in '\'"':
        v = v[1:-1]
    print(f"{cle}\t{v}")
PY
)

RESEAU=${RESEAU_OFFICINA:-officine-os_default}
PORT_SERVICES=${PORT_SERVICES:-3000}

# --- 2. Réseau Docker partagé avec Officina ----------------------------------
if ! docker network inspect "$RESEAU" >/dev/null 2>&1; then
  echo "Réseau $RESEAU absent : création (Officina devra le rejoindre, ou mettez RESEAU_OFFICINA au nom du sien : docker network ls)."
  docker network create "$RESEAU" >/dev/null
fi

# --- 3. Fichiers générés depuis les gabarits ---------------------------------
# Remplacement littéral (sans sed : les secrets peuvent contenir / & |).
remplacer() { # fichier motif valeur
  python3 - "$1" "$2" "$3" <<'PY'
import sys
f, motif, valeur = sys.argv[1:]
s = open(f, encoding='utf-8').read().replace(motif, valeur)
open(f, 'w', encoding='utf-8').write(s)
PY
}
mkdir -p "$GENERE"

URL_SONDES=${URL_PUBLIQUE:-}
if [ -z "$URL_SONDES" ]; then
  URL_SONDES="http://gateway:$PORT_SERVICES"
  echo "URL_PUBLIQUE vide : les sondes « site public » visent $URL_SONDES en attendant (pas de HTTPS ni de certificat mesuré)."
fi
cp deploy/supervision/prometheus.yml.gabarit "$GENERE/prometheus.yml"
remplacer "$GENERE/prometheus.yml" __PORT_SERVICES__ "$PORT_SERVICES"
remplacer "$GENERE/prometheus.yml" __URL_PUBLIQUE__ "${URL_SONDES%/}"

TELEGRAM=""
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  TELEGRAM="    telegram_configs:
      - bot_token: '${TELEGRAM_BOT_TOKEN//\'/\'\'}'
        chat_id: ${TELEGRAM_CHAT_ID}
        parse_mode: HTML
        send_resolved: true"
fi
EMAIL=""
if [ -n "${SMTP_HOTE:-}" ] && [ -n "${ALERTES_EMAIL:-}" ]; then
  HOTE_PORT=$SMTP_HOTE; case "$HOTE_PORT" in *:*) ;; *) HOTE_PORT="$HOTE_PORT:587" ;; esac
  EMAIL="    email_configs:
      - to: '${ALERTES_EMAIL//\'/\'\'}'
        from: '${SMTP_EXPEDITEUR:-${SMTP_UTILISATEUR:-}}'
        smarthost: '$HOTE_PORT'
        auth_username: '${SMTP_UTILISATEUR:-}'
        auth_password: '${SMTP_MOT_DE_PASSE//\'/\'\'}'
        require_tls: $([ "${HOTE_PORT##*:}" = 465 ] && echo false || echo true)
        send_resolved: true"
fi
[ -n "$TELEGRAM$EMAIL" ] || echo "Ni Telegram ni e-mail configurés : les alertes resteront dans l'interface (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID, SMTP_HOTE + ALERTES_EMAIL)."
cp deploy/supervision/alertmanager.yml.gabarit "$GENERE/alertmanager.yml"
remplacer "$GENERE/alertmanager.yml" __TELEGRAM__ "$TELEGRAM"
remplacer "$GENERE/alertmanager.yml" __EMAIL__ "$EMAIL"
chmod 600 "$GENERE/alertmanager.yml"
mkdir -p "${DOSSIER_MESURES:-deploy/mesures}"

# --- 4. Démarrage ---------------------------------------------------------------
if [ "$AVEC_PILE" = 1 ]; then
  echo "== Pile de supervision"
  docker compose --env-file .env -f "$PILE" up -d --remove-orphans
  # Prometheus et Alertmanager relisent leur configuration sans redémarrer.
  docker compose --env-file .env -f "$PILE" kill -s HUP prometheus alertmanager >/dev/null 2>&1 || true
fi
echo "== Application"
docker compose up -d --build

if [ -n "$PROFILS" ]; then
  echo "== Outils optionnels : $PROFILS"
  ARGS=()
  for p in ${PROFILS//,/ }; do ARGS+=(--profile "$p"); done
  docker compose --env-file .env -f "$OUTILS_COMPOSE" "${ARGS[@]}" up -d
fi

# --- 5. Suite ----------------------------------------------------------------------
PORT=${PORT_PUBLIE:-8080}
cat <<FIN

Terminé. L'interface écoute sur 127.0.0.1:$PORT (depuis votre poste :
  ssh -L $PORT:127.0.0.1:$PORT utilisateur@serveur   puis http://localhost:$PORT).
Première ouverture : créer le compte administrateur avec SUPERVISION_CODE_INSTALLATION.

Les sauvegardes doivent déposer leurs mesures dans ${DOSSIER_MESURES:-deploy/mesures}/ (fichier .prom :
  officine_sauvegarde_derniere_reussite_secondes, officine_sauvegarde_taille_octets).

Outils reliés via .env puis « docker compose up -d » :
  GitLab / GitHub / AWX / Control-M / SonarQube  → GITLAB_*, GITHUB_*, AWX_*, CONTROLM_*, SONAR_*
  Sentry, UptimeRobot / Uptime Kuma, CrowdSec, Wazuh, Falco, Trivy, Lynis, AIDE, Argo CD, Hetzner, Jaeger
  → voir .env.exemple ; outils auto-hébergés : bash deploy/installer.sh --outils uptime-kuma,sonarqube,jaeger,crowdsec,trivy,falco
FIN
