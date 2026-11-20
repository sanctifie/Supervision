#!/bin/sh
# Redémarre le conteneur d'un service d'Officina (étiquette Docker Compose).
# Usage : redemarrer-service.sh <service>   (la valeur vient d'une liste fermée)
# Demande le client docker et /var/run/docker.sock monté (voir le README).
set -eu
service="$1"
command -v docker >/dev/null || { echo "docker absent du conteneur : voir README, « Tâches »."; exit 2; }
ids=$(docker ps -q --filter "label=com.docker.compose.service=$service")
[ -n "$ids" ] || { echo "Aucun conteneur pour le service $service"; exit 1; }
echo "Redémarrage de $service…"
docker restart $ids
sleep 5
docker ps --filter "label=com.docker.compose.service=$service" --format '{{.Names}} : {{.Status}}'
