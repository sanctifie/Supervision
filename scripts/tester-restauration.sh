#!/bin/bash
# Test de restauration : la dernière sauvegarde PostgreSQL est restaurée dans un
# conteneur jetable, puis on compte les tables et les lignes des plus grosses.
# Rien n'est écrit en production. Formats reconnus : .dump (pg_dump -Fc),
# .sql.gz, .sql. Une sauvegarde chiffrée (restic, .gpg, .age) doit d'abord être
# déchiffrée par Officina : ce script s'arrête alors avec une explication.
# Demande le client docker et /var/run/docker.sock (voir le README, « Tâches »).
set -euo pipefail
dossier="${SAUVEGARDES_DIR:-/officina/backups}"
image="${IMAGE_POSTGRES:-postgres:16-alpine}"
command -v docker >/dev/null || { echo "docker absent du conteneur : voir README, « Tâches »."; exit 2; }
[ -d "$dossier" ] || { echo "Dossier des sauvegardes introuvable : $dossier (montez-le, ou réglez SAUVEGARDES_DIR)"; exit 2; }

fichier=$(ls -t "$dossier"/*.dump "$dossier"/*.sql.gz "$dossier"/*.sql 2>/dev/null | head -1 || true)
if [ -z "$fichier" ]; then
  echo "Aucune sauvegarde .dump, .sql.gz ou .sql dans $dossier."
  ls -la "$dossier" | head -20
  ls "$dossier" | grep -qE '\.(gpg|age|enc)$|^(data|index|keys|snapshots)$' && echo "Ces sauvegardes semblent chiffrées : déchiffrez-en une d'abord."
  exit 2
fi
echo "Sauvegarde : $fichier ($(du -h "$fichier" | cut -f1), $(date -r "$fichier" '+%d/%m/%Y %H:%M'))"

nom="restauration-test-$$"
trap 'docker rm -f "$nom" >/dev/null 2>&1 || true' EXIT
echo "Base jetable : $image"
docker run -d --name "$nom" -e POSTGRES_PASSWORD=jetable -e POSTGRES_DB=restauration "$image" >/dev/null
# En TCP : le serveur temporaire de la première initialisation n'écoute que sur le socket local.
for i in $(seq 1 60); do docker exec "$nom" pg_isready -h 127.0.0.1 -U postgres -q && break; sleep 1; done
docker exec "$nom" pg_isready -h 127.0.0.1 -U postgres -q || { echo "La base jetable ne démarre pas."; exit 1; }

debut=$(date +%s)
echo "Restauration…"
case "$fichier" in
  *.dump)   docker exec -i "$nom" pg_restore -U postgres -d restauration --no-owner --no-acl --exit-on-error < "$fichier" ;;
  *.sql.gz) gunzip -c "$fichier" | docker exec -i "$nom" psql -U postgres -d restauration -q -v ON_ERROR_STOP=1 >/dev/null ;;
  *.sql)    docker exec -i "$nom" psql -U postgres -d restauration -q -v ON_ERROR_STOP=1 >/dev/null < "$fichier" ;;
esac
echo "Restaurée en $(( $(date +%s) - debut )) s."

requete() { docker exec "$nom" psql -U postgres -d restauration -tAc "$1"; }
tables=$(requete "select count(*) from pg_stat_user_tables")
echo "Tables : $tables"
[ "$tables" -gt 0 ] || { echo "ÉCHEC : la sauvegarde ne contient aucune table."; exit 1; }
requete "analyze" >/dev/null
echo
echo "Plus grosses tables (lignes estimées) :"
requete "select schemaname||'.'||relname||' : '||n_live_tup from pg_stat_user_tables order by n_live_tup desc limit 10"
lignes=$(requete "select coalesce(sum(n_live_tup),0) from pg_stat_user_tables")
[ "$lignes" -gt 0 ] || { echo "ÉCHEC : toutes les tables sont vides."; exit 1; }
echo
echo "RÉUSSI : $tables tables, ~$lignes lignes restaurées. La base jetable est supprimée."
