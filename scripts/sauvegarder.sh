#!/bin/sh
# Lance la sauvegarde d'Officina (deploy/backup.sh du dépôt Pharmatech),
# montée en lecture seule dans /officina (voir docker-compose.yml).
set -eu
script="${OFFICINA_DIR:-/officina}/deploy/backup.sh"
[ -f "$script" ] || { echo "Introuvable : $script (montez le dossier d'Officina sur /officina)"; exit 2; }
exec bash "$script"
