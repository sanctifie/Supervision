#!/bin/bash
# Démarrage d'une session Claude Code dans le cloud :
#  1. dépendances du projet (tests, lint, build) ;
#  2. outils pour l'agent : Graphify (carte du code), Ponytail (code minimal
#     et testé), REA (rétro-ingénierie, serveur MCP).
# Idempotent : ne réinstalle que ce qui manque. Versions figées.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

GRAPHIFY_VERSION="0.9.92"
REA_VERSION="6.5.0"
PONYTAIL_DEPOT="https://github.com/DietrichGebert/ponytail"
PONYTAIL_DOSSIER="$HOME/.cache/agent-outils/ponytail"
PONYTAIL_VERSION="16352ac"

# 1. Dépendances du projet.
npm install --no-audit --no-fund

# 2a. Graphify (CLI Python) et sa compétence Claude Code.
export PATH="$HOME/.local/bin:$PATH"
echo "export PATH=\"$HOME/.local/bin:\$PATH\"" >> "${CLAUDE_ENV_FILE:-/dev/null}"
if ! graphify --version 2>/dev/null | grep -q "$GRAPHIFY_VERSION"; then
  uv tool install --force "graphifyy==$GRAPHIFY_VERSION"
fi
if [ ! -f "$HOME/.claude/skills/graphify/SKILL.md" ]; then
  graphify install --platform claude
fi

# 2b. Ponytail (extension Claude Code), depuis une copie locale à la version figée.
if [ ! -d "$PONYTAIL_DOSSIER/.git" ]; then
  mkdir -p "$(dirname "$PONYTAIL_DOSSIER")"
  git clone --quiet "$PONYTAIL_DEPOT" "$PONYTAIL_DOSSIER"
fi
git -C "$PONYTAIL_DOSSIER" checkout --quiet "$PONYTAIL_VERSION" 2>/dev/null \
  || { git -C "$PONYTAIL_DOSSIER" fetch --quiet origin && git -C "$PONYTAIL_DOSSIER" checkout --quiet "$PONYTAIL_VERSION"; }
if ! claude plugin list 2>/dev/null | grep -q "ponytail@ponytail"; then
  claude plugin marketplace add "$PONYTAIL_DOSSIER" >/dev/null
  claude plugin install ponytail@ponytail >/dev/null
fi

# 2c. REA : serveur MCP et compétence pour Claude Code.
if ! grep -q "rea-agents@$REA_VERSION" "$HOME/.claude.json" 2>/dev/null || [ ! -d "$HOME/.claude/skills/reverse-engineer-anything" ]; then
  npx -y "rea-agents@$REA_VERSION" setup --client claude_code --yes --json >/dev/null
fi

echo "Session prête : dépendances npm, Graphify $GRAPHIFY_VERSION, Ponytail $PONYTAIL_VERSION, REA $REA_VERSION."
