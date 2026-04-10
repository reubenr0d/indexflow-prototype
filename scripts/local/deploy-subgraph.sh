#!/usr/bin/env sh
set -eu

GRAPH_NODE_URL="${GRAPH_NODE_URL:-http://graph-node:8020}"
IPFS_URL="${IPFS_URL:-http://ipfs:5001}"
SUBGRAPH_NAME="${SUBGRAPH_NAME:-indexflow-prototype}"
NETWORK_NAME="${NETWORK_NAME:-anvil}"

wait_for_fetch() {
  URL="$1"
  NAME="$2"
  ATTEMPTS=0
  until node -e "fetch(process.argv[1]).then(() => process.exit(0)).catch(() => process.exit(1))" "$URL" >/dev/null 2>&1; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if [ "$ATTEMPTS" -ge 90 ]; then
      echo "[deploy-subgraph] $NAME not reachable after 90 attempts: $URL"
      exit 1
    fi
    sleep 1
  done
}

printf '[deploy-subgraph] waiting for graph-node and ipfs\n'
wait_for_fetch "$GRAPH_NODE_URL" "graph-node"
wait_for_fetch "$IPFS_URL/api/v0/version" "ipfs"

printf '[deploy-subgraph] installing subgraph dependencies\n'
npm --prefix apps/subgraph ci

printf '[deploy-subgraph] syncing and building manifest for %s\n' "$NETWORK_NAME"
npm --prefix apps/subgraph run sync:networks
NETWORK="$NETWORK_NAME" npm --prefix apps/subgraph run build

printf '[deploy-subgraph] ensuring subgraph exists: %s\n' "$SUBGRAPH_NAME"
npm --prefix apps/subgraph exec graph -- create --node "$GRAPH_NODE_URL" "$SUBGRAPH_NAME" || true

VERSION_LABEL="local-$(date +%Y%m%d-%H%M%S)"
printf '[deploy-subgraph] deploying %s with label %s\n' "$SUBGRAPH_NAME" "$VERSION_LABEL"
npm --prefix apps/subgraph exec graph -- deploy \
  --node "$GRAPH_NODE_URL" \
  --ipfs "$IPFS_URL" \
  -l "$VERSION_LABEL" \
  "$SUBGRAPH_NAME" \
  apps/subgraph/subgraph.yaml

printf '[deploy-subgraph] deployed endpoint: http://graph-node:8000/subgraphs/name/%s\n' "$SUBGRAPH_NAME"
