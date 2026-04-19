#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────
# deploy-coordination.sh — Deploy hub + spoke with StateRelay + RedemptionReceiver
#
# Usage:
#   ./scripts/deploy-coordination.sh
#
# Required env:
#   PRIVATE_KEY       - Deployer private key
#   SEPOLIA_RPC_URL   - Hub chain RPC
#   FUJI_RPC_URL      - Spoke chain RPC
#
# This script:
#   1. Deploys full hub stack to Sepolia (with StateRelay)
#   2. Deploys spoke stack to Fuji (with StateRelay + RedemptionReceiver)
#   3. Wires StateRelay to existing vaults on both chains
#   4. Wires RedemptionReceiver trusted sender on Fuji
# ──────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORGE="${FORGE:-forge}"
FORGE_FLAGS="--broadcast -vvv"

# Validate required env vars
if [ -z "${PRIVATE_KEY:-}" ]; then
  echo "Error: PRIVATE_KEY not set"
  exit 1
fi
if [ -z "${SEPOLIA_RPC_URL:-}" ]; then
  echo "Error: SEPOLIA_RPC_URL not set"
  exit 1
fi
if [ -z "${FUJI_RPC_URL:-}" ]; then
  echo "Error: FUJI_RPC_URL not set"
  exit 1
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  Cross-Chain Coordination Deployment"
echo "═══════════════════════════════════════════════════════════════"

# ── Step 1: Deploy Sepolia hub ───────────────────────────────────────
echo ""
echo "[1/4] Deploying Sepolia hub (full stack + StateRelay)..."
CHAIN=sepolia "$FORGE" script script/Deploy.s.sol:Deploy \
  --root "$REPO_ROOT" \
  --rpc-url sepolia \
  $FORGE_FLAGS

SEPOLIA_JSON="$REPO_ROOT/apps/web/src/config/sepolia-deployment.json"
if [ ! -f "$SEPOLIA_JSON" ]; then
  echo "Error: $SEPOLIA_JSON not written"
  exit 1
fi
echo "[1/4] Sepolia hub deployed."
echo "  Config: $SEPOLIA_JSON"

# ── Step 2: Deploy Fuji spoke ────────────────────────────────────────
echo ""
echo "[2/4] Deploying Fuji spoke (StateRelay + RedemptionReceiver)..."
CHAIN=fuji "$FORGE" script script/DeploySpoke.s.sol:DeploySpoke \
  --root "$REPO_ROOT" \
  --rpc-url fuji \
  $FORGE_FLAGS

FUJI_JSON="$REPO_ROOT/apps/web/src/config/fuji-deployment.json"
if [ ! -f "$FUJI_JSON" ]; then
  echo "Error: $FUJI_JSON not written"
  exit 1
fi
echo "[2/4] Fuji spoke deployed."
echo "  Config: $FUJI_JSON"

# ── Step 3: Wire StateRelay on Sepolia ───────────────────────────────
echo ""
echo "[3/4] Wiring StateRelay to Sepolia vaults..."
CHAIN=sepolia "$FORGE" script script/WireStateRelay.s.sol:WireStateRelay \
  --root "$REPO_ROOT" \
  --rpc-url sepolia \
  $FORGE_FLAGS

echo "[3/4] Sepolia wiring complete."

# ── Step 4: Wire StateRelay + RedemptionReceiver on Fuji ─────────────
echo ""
echo "[4/4] Wiring StateRelay + RedemptionReceiver on Fuji..."

# Get hub chain selector and a trusted sender address (the deployer or keeper)
HUB_CHAIN_SELECTOR="16015286601757825753"  # Sepolia CCIP selector
DEPLOYER=$(cast wallet address "$PRIVATE_KEY" 2>/dev/null || echo "")

if [ -z "$DEPLOYER" ]; then
  echo "Warning: Could not derive deployer address. Set HUB_SENDER manually if needed."
  HUB_SENDER="0x0000000000000000000000000000000000000000"
else
  HUB_SENDER="$DEPLOYER"
fi

CHAIN=fuji HUB_CHAIN_SELECTOR="$HUB_CHAIN_SELECTOR" HUB_SENDER="$HUB_SENDER" \
  "$FORGE" script script/WireStateRelay.s.sol:WireStateRelay \
  --root "$REPO_ROOT" \
  --rpc-url fuji \
  $FORGE_FLAGS

echo "[4/4] Fuji wiring complete."

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Deployment Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Hub (Sepolia):"
echo "  Config: $SEPOLIA_JSON"
jq -r '"\(.basketFactory) - basketFactory\n\(.stateRelay) - stateRelay"' "$SEPOLIA_JSON"
echo ""
echo "Spoke (Fuji):"
echo "  Config: $FUJI_JSON"
jq -r '"\(.basketFactory) - basketFactory\n\(.stateRelay) - stateRelay\n\(.redemptionReceiver) - redemptionReceiver"' "$FUJI_JSON"
echo ""
echo "Next steps:"
echo "  1. Start the keeper service: cd services/keeper && npm start"
echo "  2. Fund the keeper wallet on both chains"
echo "  3. Update the frontend if needed"
