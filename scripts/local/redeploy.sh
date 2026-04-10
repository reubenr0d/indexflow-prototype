#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
GRAPH_NODE_URL="${GRAPH_NODE_URL:-http://localhost:8020}"
IPFS_URL="${IPFS_URL:-http://localhost:5001}"
SUBGRAPH_NAME="${SUBGRAPH_NAME:-indexflow-prototype}"
PRIVATE_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

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
PRIVATE_KEY="$PRIVATE_KEY" forge script script/DeployLocal.s.sol:DeployLocal \
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
# 3. Wait for graph-node
# ------------------------------------------------------------------
GRAPH_QUERY_URL="${GRAPH_QUERY_URL:-http://localhost:8000}"
printf '[redeploy] waiting for graph-node at %s\n' "$GRAPH_QUERY_URL"
ATTEMPTS=0
until curl -sf "$GRAPH_QUERY_URL" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 90 ]; then
    echo "[redeploy] graph-node not reachable after 90s"
    exit 1
  fi
  sleep 1
done
printf '[redeploy] graph-node ready\n'

# ------------------------------------------------------------------
# 4. Sync subgraph networks, codegen, + build
# ------------------------------------------------------------------
SUBGRAPH_DIR="$REPO_ROOT/apps/subgraph"
GRAPH_BIN="$SUBGRAPH_DIR/node_modules/.bin/graph"

printf '[redeploy] syncing subgraph networks and building\n'
npm --prefix "$SUBGRAPH_DIR" run sync:networks
NETWORK=anvil npm --prefix "$SUBGRAPH_DIR" run codegen
NETWORK=anvil npm --prefix "$SUBGRAPH_DIR" run build

# ------------------------------------------------------------------
# 5. Deploy subgraph
# ------------------------------------------------------------------
printf '[redeploy] creating subgraph %s (if not exists)\n' "$SUBGRAPH_NAME"
(cd "$SUBGRAPH_DIR" && "$GRAPH_BIN" create --node "$GRAPH_NODE_URL" "$SUBGRAPH_NAME") 2>/dev/null || true

VERSION_LABEL="local-$(date +%Y%m%d-%H%M%S)"
printf '[redeploy] deploying subgraph %s (version %s)\n' "$SUBGRAPH_NAME" "$VERSION_LABEL"
(cd "$SUBGRAPH_DIR" && "$GRAPH_BIN" deploy \
  --node "$GRAPH_NODE_URL" \
  --ipfs "$IPFS_URL" \
  --version-label "$VERSION_LABEL" \
  "$SUBGRAPH_NAME" \
  subgraph.yaml)

printf '[redeploy] done — subgraph at http://localhost:8000/subgraphs/name/%s\n' "$SUBGRAPH_NAME"
