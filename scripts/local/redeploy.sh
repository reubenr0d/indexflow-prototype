#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
PRIVATE_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

# Placeholder explorer API keys so foundry's [etherscan] block in foundry.toml
# resolves to non-empty values when broadcasting against the local Anvil chain
# (chain id 31337 / "anvil-hardhat"). Without these, Foundry 1.5.x errors with
# "No known Etherscan API URL for chain `anvil-hardhat`" because the trace
# identifier walks every [etherscan] entry on -vvv broadcasts. Mirrors the
# `ETHERSCAN_API_KEY=ci-not-required` / `ARBISCAN_API_KEY=ci-not-required`
# workaround already used in .github/workflows/test.yml. Only applied when the
# caller hasn't already exported a real value.
export ETHERSCAN_API_KEY="${ETHERSCAN_API_KEY:-local-not-required}"
export ARBISCAN_API_KEY="${ARBISCAN_API_KEY:-local-not-required}"
export SNOWTRACE_API_KEY="${SNOWTRACE_API_KEY:-local-not-required}"

# ------------------------------------------------------------------
# 1. Wait for Anvil
# ------------------------------------------------------------------
printf '[redeploy] waiting for Anvil at %s\n' "$RPC_URL"
ATTEMPTS=0
until cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 60 ]; then
    echo "[redeploy] Anvil not reachable after 60s — is docker-compose running?"
    exit 1
  fi
  sleep 1
done
printf '[redeploy] Anvil ready (block %s)\n' "$(cast block-number --rpc-url "$RPC_URL")"

# ------------------------------------------------------------------
# 2. Deploy contracts
# ------------------------------------------------------------------
printf '[redeploy] deploying contracts\n'
CHAIN=local PRIVATE_KEY="$PRIVATE_KEY" forge script script/Deploy.s.sol:Deploy \
  --root "$REPO_ROOT" \
  --rpc-url "$RPC_URL" \
  --broadcast \
  -vvv

if [ ! -f "$REPO_ROOT/apps/web/src/config/local-deployment.json" ]; then
  echo "[redeploy] local-deployment.json not written — deploy may have failed"
  exit 1
fi
printf '[redeploy] contracts deployed; local-deployment.json updated\n'

# ------------------------------------------------------------------
# 3. Reminder: start Envio HyperIndex separately
# ------------------------------------------------------------------
cat <<'EOF'

[redeploy] done. Next steps:
  1. Start the Envio indexer (in a separate shell):
       npm run --prefix apps/envio dev:local
  2. Start the web app with the indexer URL:
       NEXT_PUBLIC_ENVIO_URL=http://127.0.0.1:8080/v1/graphql npm run local:dev

EOF
