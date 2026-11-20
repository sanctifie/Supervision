#!/bin/sh
# Libère le disque : images non utilisées depuis 7 jours et cache de construction.
# Ne touche ni aux conteneurs ni aux volumes (les données restent).
set -eu
command -v docker >/dev/null || { echo "docker absent du conteneur : voir README, « Tâches »."; exit 2; }
docker system df
echo
docker image prune -af --filter "until=168h"
docker builder prune -f --filter "until=168h"
echo
docker system df
