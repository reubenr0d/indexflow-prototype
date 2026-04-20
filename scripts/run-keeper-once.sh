#!/usr/bin/env bash
# Post-deploy / post-seed: build the keeper and run one StateRelay epoch, then exit.
# Loads repo-root .env via DOTENV_CONFIG_PATH when the file exists. Set SKIP_KEEPER_ONCE=1 to skip.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "${SKIP_KEEPER_ONCE:-}" = "1" ]; then
  echo "[keeper-once] SKIP_KEEPER_ONCE=1 — skipping"
  exit 0
fi

if [ -f "$REPO_ROOT/.env" ]; then
  export DOTENV_CONFIG_PATH="${DOTENV_CONFIG_PATH:-$REPO_ROOT/.env}"
fi

echo "[keeper-once] Building keeper (services/keeper)..."
npm --prefix "$REPO_ROOT/services/keeper" run build

echo "[keeper-once] Running one keeper epoch (KEEPER_ONCE=1)..."
export KEEPER_ONCE=1
node "$REPO_ROOT/services/keeper/dist/index.js"
