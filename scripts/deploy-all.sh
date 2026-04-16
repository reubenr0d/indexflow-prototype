#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────
# deploy-all.sh — Deploy all chains defined in config/chains.json
#
# Usage:
#   ./scripts/deploy-all.sh                     # deploy every chain
#   ./scripts/deploy-all.sh --chain sepolia     # deploy one chain only
#   ./scripts/deploy-all.sh --dry-run           # preview without deploying
#   ./scripts/deploy-all.sh --chain fuji --dry-run
# ──────────────────────────────────────────────────────────────────────

export PATH="/Users/reuben/.foundry/bin:$PATH"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHAINS_FILE="$REPO_ROOT/config/chains.json"
FORGE="${FORGE:-forge}"
FORGE_FLAGS="--broadcast -vvv"

# ── Colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { printf "${CYAN}[info]${RESET}  %s\n" "$*"; }
success() { printf "${GREEN}[ok]${RESET}    %s\n" "$*"; }
warn()    { printf "${YELLOW}[warn]${RESET}  %s\n" "$*"; }
error()   { printf "${RED}[error]${RESET} %s\n" "$*" >&2; }

# ── Dependency check ─────────────────────────────────────────────────
for bin in jq "$FORGE"; do
  if ! command -v "$bin" &>/dev/null; then
    error "Required binary '$bin' not found in PATH"
    exit 1
  fi
done

if [ ! -f "$CHAINS_FILE" ]; then
  error "Chains config not found: $CHAINS_FILE"
  exit 1
fi

# ── Argument parsing ─────────────────────────────────────────────────
FILTER_CHAIN=""
DRY_RUN=false

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Options:
  --chain <name>   Deploy only the specified chain
  --dry-run        Print what would be deployed without executing
  -h, --help       Show this help message

Available chains: $(jq -r 'keys | join(", ")' "$CHAINS_FILE")
EOF
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --chain)
      [ $# -lt 2 ] && { error "--chain requires a value"; exit 1; }
      FILTER_CHAIN="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      error "Unknown argument: $1"
      usage
      ;;
  esac
done

# Validate --chain target exists
if [ -n "$FILTER_CHAIN" ]; then
  if ! jq -e ".[\"$FILTER_CHAIN\"]" "$CHAINS_FILE" > /dev/null 2>&1; then
    error "Chain '$FILTER_CHAIN' not found in $CHAINS_FILE"
    info "Available chains: $(jq -r 'keys | join(", ")' "$CHAINS_FILE")"
    exit 1
  fi
fi

# ── Build chain list ─────────────────────────────────────────────────
if [ -n "$FILTER_CHAIN" ]; then
  CHAINS="$FILTER_CHAIN"
else
  CHAINS=$(jq -r 'keys[]' "$CHAINS_FILE")
fi

TOTAL=$(echo "$CHAINS" | wc -l | tr -d ' ')

echo ""
printf "${BOLD}═══════════════════════════════════════════════${RESET}\n"
printf "${BOLD}  deploy-all — %s chain(s)${RESET}\n" "$TOTAL"
if $DRY_RUN; then
  printf "${YELLOW}  (dry-run — no transactions will be broadcast)${RESET}\n"
fi
printf "${BOLD}═══════════════════════════════════════════════${RESET}\n"

# ── Deploy loop ──────────────────────────────────────────────────────
HUB_COUNT=0
SPOKE_COUNT=0
FAILED_CHAINS=()
DEPLOYED_CHAINS=()
INDEX=0

for CHAIN_NAME in $CHAINS; do
  INDEX=$((INDEX + 1))

  ROLE=$(jq -r ".[\"$CHAIN_NAME\"].role // empty" "$CHAINS_FILE")
  RPC_ALIAS=$(jq -r ".[\"$CHAIN_NAME\"].rpcAlias" "$CHAINS_FILE")

  if [ -z "$ROLE" ]; then
    warn "[$INDEX/$TOTAL] Skipping '$CHAIN_NAME' — no role defined"
    continue
  fi

  case "$ROLE" in
    hub)
      SCRIPT_PATH="script/Deploy.s.sol:Deploy"
      LABEL="hub"
      ;;
    spoke)
      SCRIPT_PATH="script/DeploySpoke.s.sol:DeploySpoke"
      LABEL="spoke"
      ;;
    *)
      warn "[$INDEX/$TOTAL] Skipping '$CHAIN_NAME' — unknown role '$ROLE'"
      continue
      ;;
  esac

  echo ""
  printf "${BOLD}──────────────────────────────────────────────${RESET}\n"
  info "[$INDEX/$TOTAL] $CHAIN_NAME  (role: $LABEL, rpc: $RPC_ALIAS)"
  info "  Script: $SCRIPT_PATH"

  if $DRY_RUN; then
    printf "  ${YELLOW}→ would run:${RESET} CHAIN=$CHAIN_NAME $FORGE script $SCRIPT_PATH --root $REPO_ROOT --rpc-url $RPC_ALIAS $FORGE_FLAGS\n"
  else
    if CHAIN="$CHAIN_NAME" "$FORGE" script "$SCRIPT_PATH" \
        --root "$REPO_ROOT" \
        --rpc-url "$RPC_ALIAS" \
        $FORGE_FLAGS; then
      success "[$INDEX/$TOTAL] $CHAIN_NAME deployed successfully"
      DEPLOYED_CHAINS+=("$CHAIN_NAME")
    else
      error "[$INDEX/$TOTAL] $CHAIN_NAME deployment FAILED"
      FAILED_CHAINS+=("$CHAIN_NAME")
      continue
    fi
  fi

  case "$ROLE" in
    hub)   HUB_COUNT=$((HUB_COUNT + 1)) ;;
    spoke) SPOKE_COUNT=$((SPOKE_COUNT + 1)) ;;
  esac
done

# ── Summary ──────────────────────────────────────────────────────────
echo ""
printf "${BOLD}═══════════════════════════════════════════════${RESET}\n"
if $DRY_RUN; then
  printf "${BOLD}  Dry-run summary${RESET}\n"
else
  printf "${BOLD}  Deployment summary${RESET}\n"
fi
printf "${BOLD}═══════════════════════════════════════════════${RESET}\n"
printf "  Hubs:   %d\n" "$HUB_COUNT"
printf "  Spokes: %d\n" "$SPOKE_COUNT"
printf "  Total:  %d\n" "$((HUB_COUNT + SPOKE_COUNT))"

if [ ${#DEPLOYED_CHAINS[@]} -gt 0 ]; then
  printf "  ${GREEN}Succeeded:${RESET} %s\n" "${DEPLOYED_CHAINS[*]}"
fi
if [ ${#FAILED_CHAINS[@]} -gt 0 ]; then
  printf "  ${RED}Failed:${RESET}    %s\n" "${FAILED_CHAINS[*]}"
  echo ""
  error "Some deployments failed — review output above"
  exit 1
fi

echo ""
success "All deployments complete."
