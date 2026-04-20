#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────
# deploy-chain.sh — Deploy hub/spoke stacks + StateRelay wiring
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
  echo "Deploys stack to <chain-name> and wires StateRelay to vaults."
  echo "If --peer is specified, also wires peer chain vaults and optional spoke trusted sender."
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
CHAIN_ROLE=$(jq -r ".[\"$CHAIN\"].role" "$CHAINS_FILE")

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

echo ""
echo "[2/3] Wiring StateRelay on $CHAIN..."
CHAIN="$CHAIN" "$FORGE" script script/WireStateRelay.s.sol:WireStateRelay \
  --root "$REPO_ROOT" \
  --rpc-url "$RPC_ALIAS" \
  $FORGE_FLAGS
echo "[2/3] StateRelay wiring complete on $CHAIN."

# ── Step 3: Wire peer StateRelay/trusted sender (if --peer specified) ─
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

  PEER_ROLE=$(jq -r ".[\"$PEER_CHAIN\"].role" "$CHAINS_FILE")
  THIS_SELECTOR=$(jq -r ".[\"$CHAIN\"].ccipChainSelector" "$CHAINS_FILE")
  PEER_SELECTOR=$(jq -r ".[\"$PEER_CHAIN\"].ccipChainSelector" "$CHAINS_FILE")

  HUB_CHAIN=""
  HUB_SELECTOR=""
  SPOKE_CHAIN=""
  SPOKE_RPC=""
  if [ "$CHAIN_ROLE" = "hub" ] && [ "$PEER_ROLE" = "spoke" ]; then
    HUB_CHAIN="$CHAIN"
    HUB_SELECTOR="$THIS_SELECTOR"
    SPOKE_CHAIN="$PEER_CHAIN"
    SPOKE_RPC="$PEER_RPC_ALIAS"
  elif [ "$CHAIN_ROLE" = "spoke" ] && [ "$PEER_ROLE" = "hub" ]; then
    HUB_CHAIN="$PEER_CHAIN"
    HUB_SELECTOR="$PEER_SELECTOR"
    SPOKE_CHAIN="$CHAIN"
    SPOKE_RPC="$RPC_ALIAS"
  fi

  HUB_SENDER_VALUE="${HUB_SENDER:-}"
  if [ -z "$HUB_SENDER_VALUE" ] && [ -n "${PRIVATE_KEY:-}" ]; then
    HUB_SENDER_VALUE=$(cast wallet address "$PRIVATE_KEY" 2>/dev/null || true)
  fi

  echo ""
  echo "[3/3] Wiring StateRelay on peer chain: $PEER_CHAIN"
  CHAIN="$PEER_CHAIN" "$FORGE" script script/WireStateRelay.s.sol:WireStateRelay \
    --root "$REPO_ROOT" \
    --rpc-url "$PEER_RPC_ALIAS" \
    $FORGE_FLAGS

  if [ -n "$SPOKE_CHAIN" ] && [ -n "$HUB_SELECTOR" ] && [ -n "$HUB_SENDER_VALUE" ]; then
    echo "  Wiring spoke RedemptionReceiver trusted sender ($SPOKE_CHAIN <- $HUB_CHAIN)"
    CHAIN="$SPOKE_CHAIN" HUB_CHAIN_SELECTOR="$HUB_SELECTOR" HUB_SENDER="$HUB_SENDER_VALUE" \
      "$FORGE" script script/WireStateRelay.s.sol:WireStateRelay \
      --root "$REPO_ROOT" \
      --rpc-url "$SPOKE_RPC" \
      $FORGE_FLAGS
  fi

  echo "[3/3] Peer wiring complete."
else
  echo ""
  echo "[3/3] No --peer specified, skipping peer wiring."
fi

if [ "$CHAIN" != "local" ]; then
  echo ""
  echo "[keeper] Running one StateRelay epoch (bootstrap subgraph /chains data)..."
  sh "$REPO_ROOT/scripts/run-keeper-once.sh" || echo "Warning: keeper-once failed — run: npm run keeper:once (or set SKIP_KEEPER_ONCE=1 to skip next time)"
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  Deployment complete: $CHAIN"
if [ -n "$PEER_CHAIN" ]; then
  echo "  Peers wired: $CHAIN <-> $PEER_CHAIN"
fi
echo "  Config: $DEPLOY_JSON"
echo "═══════════════════════════════════════════════"
