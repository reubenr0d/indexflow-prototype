#!/usr/bin/env sh
set -eu

RPC_URL="${ANVIL_RPC_URL:-http://anvil:8545}"
PRIVATE_KEY_VALUE="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

printf '[deploy-contracts] waiting for Anvil at %s\n' "$RPC_URL"
ATTEMPTS=0
until cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 60 ]; then
    echo "[deploy-contracts] anvil not reachable after 60 attempts"
    exit 1
  fi
  sleep 1
done

printf '[deploy-contracts] deploying contracts to %s\n' "$RPC_URL"
PRIVATE_KEY="$PRIVATE_KEY_VALUE" forge script script/DeployLocal.s.sol:DeployLocal \
  --root /workspace \
  --rpc-url "$RPC_URL" \
  --broadcast \
  -vvv

if [ ! -f /workspace/apps/web/src/config/local-deployment.json ]; then
  echo "[deploy-contracts] expected local deployment output missing"
  exit 1
fi

printf '[deploy-contracts] wrote apps/web/src/config/local-deployment.json\n'
