#!/bin/sh
# Scanne les images TRIVY_IMAGES toutes les TRIVY_INTERVALLE secondes et fusionne
# les rapports en un seul fichier Trivy (/rapports/trivy.json), lu par l'application.
set -eu
apk add --no-cache jq >/dev/null 2>&1 || true
while true; do
  mkdir -p /rapports/trivy.d
  for image in $TRIVY_IMAGES; do
    nom=$(printf '%s' "$image" | tr '/:' '__')
    if ! trivy image --quiet --scanners vuln --format json --output "/rapports/trivy.d/$nom.json" "$image"; then
      echo "trivy : échec sur $image" >&2
    fi
  done
  if command -v jq >/dev/null; then
    jq -s '{SchemaVersion: 2, ArtifactName: "officina", CreatedAt: (now | todate), Results: (map(.Results // []) | add)}' /rapports/trivy.d/*.json > /rapports/trivy.json.tmp \
      && mv /rapports/trivy.json.tmp /rapports/trivy.json
  else
    # shortcut: sans jq (pas de réseau pour apk), on garde le dernier rapport seul ; à revoir si plusieurs images.
    cp "$(ls -t /rapports/trivy.d/*.json | head -1)" /rapports/trivy.json
  fi
  echo "trivy : rapport écrit $(date -Iseconds)"
  sleep "$TRIVY_INTERVALLE"
done
