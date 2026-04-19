#!/usr/bin/env bash
# Resume a forge script broadcast with sleep/backoff on RPC failures.
# Usage (from repo root, after sourcing .env or exporting vars):
#   ./scripts/resume-forge-broadcast.sh <script_path:ContractName> <rpc_alias>
# Examples:
#   ./scripts/resume-forge-broadcast.sh script/Deploy.s.sol:Deploy sepolia
#   CHAIN=fuji ./scripts/resume-forge-broadcast.sh script/DeploySpoke.s.sol:DeploySpoke fuji
#
# If the RPC in foundry.toml keeps dropping receipts, point Forge at a full HTTP URL:
#   FORGE_RPC_OVERRIDE="https://..." CHAIN=sepolia ./scripts/resume-forge-broadcast.sh script/Deploy.s.sol:Deploy sepolia
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Prefer Foundry on PATH; common install location when not on PATH
export PATH="${PATH}:/Users/reuben/.foundry/bin"
FORGE="${FORGE:-forge}"
SCRIPT_SPEC="${1:?usage: $0 <script.sol:Contract> <rpc_alias>}"
RPC_ALIAS="${2:?usage: $0 <script.sol:Contract> <rpc_alias>}"
RPC_URL="${FORGE_RPC_OVERRIDE:-$RPC_ALIAS}"

if [ -f "$REPO_ROOT/.env" ]; then
  # shellcheck disable=SC1091
  set -a && source "$REPO_ROOT/.env" && set +a
fi

MAX_ATTEMPTS="${MAX_ATTEMPTS:-40}"
# Per-attempt: wait for receipts up to TIMEOUT seconds; --slow sends one tx at a time.
TIMEOUT="${BROADCAST_TIMEOUT:-1800}"

attempt=0
while [ "$attempt" -lt "$MAX_ATTEMPTS" ]; do
  attempt=$((attempt + 1))
  echo "=== Broadcast resume attempt ${attempt}/${MAX_ATTEMPTS} (${SCRIPT_SPEC} @ ${RPC_URL}${FORGE_RPC_OVERRIDE:+ override}) ==="
  if "$FORGE" script "$SCRIPT_SPEC" \
    --root "$REPO_ROOT" \
    --rpc-url "$RPC_URL" \
    --broadcast \
    --resume \
    --slow \
    --timeout "$TIMEOUT" \
    -vvv; then
    echo "=== Broadcast finished successfully ==="
    exit 0
  fi
  # Exponential backoff capped at 10 minutes
  sleep_sec=$((45 + attempt * 30))
  if [ "$sleep_sec" -gt 600 ]; then sleep_sec=600; fi
  echo "=== Attempt failed; sleeping ${sleep_sec}s before retry ==="
  sleep "$sleep_sec"
done

echo "=== Gave up after ${MAX_ATTEMPTS} attempts ===" >&2
exit 1
