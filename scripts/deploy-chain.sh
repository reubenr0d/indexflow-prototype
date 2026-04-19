#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────
# deploy-chain.sh — Deploy full stack + coordination + peer wiring
#
# Usage:
#   ./scripts/deploy-chain.sh <chain-name> [--peer <existing-chain>]
#
# Examples:
#   ./scripts/deploy-chain.sh sepolia
#   ./scripts/deploy-chain.sh fuji --peer sepolia
#   ./scripts/deploy-chain.sh local
# ──────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHAINS_FILE="$REPO_ROOT/config/chains.json"
FORGE="${FORGE:-forge}"
FORGE_FLAGS="--broadcast -vvv"

usage() {
  echo "Usage: $0 <chain-name> [--peer <existing-chain>]"
  echo ""
  echo "Deploys full stack + coordination layer to <chain-name>."
  echo "If --peer is specified, wires cross-chain peers in both directions."
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

CHAIN="$1"
shift

PEER_CHAIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --peer)
      PEER_CHAIN="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      ;;
  esac
done

# Validate chain exists in registry
if ! jq -e ".[\"$CHAIN\"]" "$CHAINS_FILE" > /dev/null 2>&1; then
  echo "Error: chain '$CHAIN' not found in $CHAINS_FILE"
  echo "Available chains: $(jq -r 'keys | join(", ")' "$CHAINS_FILE")"
  exit 1
fi

RPC_ALIAS=$(jq -r ".[\"$CHAIN\"].rpcAlias" "$CHAINS_FILE")
CCIP_ROUTER=$(jq -r ".[\"$CHAIN\"].ccipRouter" "$CHAINS_FILE")
CHAIN_ROLE=$(jq -r ".[\"$CHAIN\"].role" "$CHAINS_FILE")
ZERO_ADDR="0x0000000000000000000000000000000000000000"

echo "═══════════════════════════════════════════════"
echo "  Deploying to: $CHAIN (rpc: $RPC_ALIAS, role: $CHAIN_ROLE)"
echo "═══════════════════════════════════════════════"

# ── Step 1: Deploy base stack (use correct script based on role) ─────
echo ""
if [ "$CHAIN_ROLE" = "spoke" ]; then
  echo "[1/3] Deploying spoke stack (StateRelay + RedemptionReceiver + BasketFactory)..."
  CHAIN="$CHAIN" "$FORGE" script script/DeploySpoke.s.sol:DeploySpoke \
    --root "$REPO_ROOT" \
    --rpc-url "$RPC_ALIAS" \
    $FORGE_FLAGS
else
  echo "[1/3] Deploying hub stack (full perp + StateRelay)..."
  CHAIN="$CHAIN" "$FORGE" script script/Deploy.s.sol:Deploy \
    --root "$REPO_ROOT" \
    --rpc-url "$RPC_ALIAS" \
    $FORGE_FLAGS
fi

DEPLOY_JSON="$REPO_ROOT/apps/web/src/config/${CHAIN}-deployment.json"
if [ ! -f "$DEPLOY_JSON" ]; then
  echo "Error: $DEPLOY_JSON not written — deploy may have failed"
  exit 1
fi
echo "[1/3] Base stack deployed. Config: $DEPLOY_JSON"

# ── Step 2: Deploy coordination layer (hub only, if CCIP configured) ─
# Spoke chains get StateRelay + RedemptionReceiver from DeploySpoke.s.sol.
# Hub chains optionally deploy legacy coordination contracts (IntentRouter, etc.)
# which are now deprecated but kept for backward compatibility.
if [ "$CHAIN_ROLE" = "hub" ] && [ "$CCIP_ROUTER" != "$ZERO_ADDR" ]; then
  echo ""
  echo "[2/3] Deploying legacy coordination layer (hub only)..."

  if [ -z "${TREASURY:-}" ]; then
    TREASURY=$(jq -r '.basketFactory' "$DEPLOY_JSON")
    echo "  TREASURY not set, defaulting to deployer (basketFactory owner)"
  fi

  CHAIN="$CHAIN" TREASURY="$TREASURY" "$FORGE" script script/DeployCoordination.s.sol:DeployCoordination \
    --root "$REPO_ROOT" \
    --rpc-url "$RPC_ALIAS" \
    $FORGE_FLAGS

  echo "[2/3] Coordination layer deployed."
else
  echo ""
  echo "[2/3] Skipping legacy coordination (spoke chain or CCIP router is zero)"
fi

# ── Step 3: Wire peers (if --peer specified) ─────────────────────────
if [ -n "$PEER_CHAIN" ]; then
  if ! jq -e ".[\"$PEER_CHAIN\"]" "$CHAINS_FILE" > /dev/null 2>&1; then
    echo "Error: peer chain '$PEER_CHAIN' not found in $CHAINS_FILE"
    exit 1
  fi

  PEER_RPC_ALIAS=$(jq -r ".[\"$PEER_CHAIN\"].rpcAlias" "$CHAINS_FILE")
  PEER_JSON="$REPO_ROOT/apps/web/src/config/${PEER_CHAIN}-deployment.json"

  if [ ! -f "$PEER_JSON" ]; then
    echo "Error: $PEER_JSON not found — deploy peer chain first"
    exit 1
  fi

  echo ""
  echo "[3/3] Wiring peers: $CHAIN <-> $PEER_CHAIN"

  echo "  Wiring $CHAIN -> $PEER_CHAIN..."
  LOCAL_CHAIN="$CHAIN" REMOTE_CHAIN="$PEER_CHAIN" \
    "$FORGE" script script/WireCrossChainPeers.s.sol:WireCrossChainPeers \
    --root "$REPO_ROOT" \
    --rpc-url "$RPC_ALIAS" \
    $FORGE_FLAGS

  echo "  Wiring $PEER_CHAIN -> $CHAIN..."
  LOCAL_CHAIN="$PEER_CHAIN" REMOTE_CHAIN="$CHAIN" \
    "$FORGE" script script/WireCrossChainPeers.s.sol:WireCrossChainPeers \
    --root "$REPO_ROOT" \
    --rpc-url "$PEER_RPC_ALIAS" \
    $FORGE_FLAGS

  echo "[3/3] Peer wiring complete."
else
  echo ""
  echo "[3/3] No --peer specified, skipping peer wiring."
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  Deployment complete: $CHAIN"
if [ -n "$PEER_CHAIN" ]; then
  echo "  Peers wired: $CHAIN <-> $PEER_CHAIN"
fi
echo "  Config: $DEPLOY_JSON"
echo "═══════════════════════════════════════════════"
