# Perp Infrastructure (GMX v1 Fork)

[![CI](https://github.com/reubenr0d/indexflow-prototype/actions/workflows/test.yml/badge.svg)](https://github.com/reubenr0d/indexflow-prototype/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/reubenr0d/indexflow-prototype/graph/badge.svg)](https://codecov.io/gh/reubenr0d/indexflow-prototype)

Perp-driven basket vaults backed by a shared perpetual liquidity pool, built on a GMX v1 fork.

## Architecture

```
Investor ──deposit USDC──► BasketVault ──allocate──► VaultAccounting ──► GMX Vault Pool
                │                                        │
          mint shares                              position PnL
          (NAV-priced)                             (tracked per vault)
```

### Basket Layer (`src/vault/`)

- **BasketVault** -- GLP-style vault: deposit USDC, receive shares priced from vault NAV (including perp PnL)
- **BasketShareToken** -- ERC20 shares (6 decimals)
- **BasketFactory** -- Deploy new baskets (name + fees), then register assets explicitly

### Perp Layer (`src/perp/`)

- **OracleAdapter** -- Unified oracle for equities + commodities (Chainlink + custom relayer)
- **PricingEngine** -- Oracle price + deterministic size-based slippage
- **VaultAccounting** -- Per-vault capital tracking, PnL attribution, position management
- **FundingRateManager** -- Oracle-anchored, imbalance-based funding rates
- **PerpReader** -- Read-only aggregator for off-chain monitoring

### GMX Fork (`src/gmx/`)

Forked GMX v1 contracts (Solidity 0.6.12) providing the core position engine:
Vault, VaultUtils, Router, ShortsTracker, BasePositionManager.

## Tech Stack

- **Solidity** -- 0.6.12 (GMX fork) + ^0.8.24 (new contracts)
- **Foundry** -- Build, test, deploy
- **OpenZeppelin** 5.x -- ERC20, Ownable, ReentrancyGuard
- **Target chains** -- Arbitrum, Ethereum Sepolia (testnet)

## Setup

```bash
# Install dependencies
forge install
npm install

# Git hooks (Husky) are configured automatically by `npm install` via the `prepare` script.
# Pre-commit: forge fmt --check + ESLint (fast, reuses node_modules).
# Pre-push:   npm ci (root + apps/web) to verify lockfile integrity before pushing.

# Build
forge build

# Test
forge test -vv
```

## Configuration

Environment templates (all variables documented with comments):

- **Repo root:** copy [`.env.example`](.env.example) to `.env` for Foundry RPC URLs, explorer keys, deploy overrides, agents, and scripts that read the root `.env` / `.env.local`.
- **Web app:** copy [`apps/web/.env.example`](apps/web/.env.example) to `apps/web/.env.local` for `NEXT_PUBLIC_*` and Playwright/E2E vars.

Minimal root `.env` for Forge scripts:

```
SEPOLIA_RPC_URL=
ARBITRUM_RPC_URL=
ARBITRUM_SEPOLIA_RPC_URL=
ETHERSCAN_API_KEY=
ARBISCAN_API_KEY=
```

### Web App Environment

The Next.js web app reads `apps/web/.env.local` (or shell). Required and optional variables:

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes | Privy app ID from [dashboard.privy.io](https://dashboard.privy.io) |
| `NEXT_PUBLIC_SUBGRAPH_URL` | No | Subgraph endpoint (auto-set by `local:dev`) |
| `NEXT_PUBLIC_PUSH_SERVICE_URL` | No | Cloud Run push-worker base URL used by `/settings` for preferences/subscription APIs |
| `NEXT_PUBLIC_E2E_TEST_MODE` | No | Set to `1` for deterministic E2E mock wallet |

### Push Worker Environment (`apps/push-worker`)

The push worker service (Cloud Run) requires:

| Variable | Required | Description |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | Yes | Web Push VAPID public key (base64url) |
| `VAPID_PRIVATE_KEY` | Yes | Web Push VAPID private key (base64url) |
| `VAPID_CONTACT_EMAIL` | Yes | Contact identity passed to push services (for example `mailto:ops@indexflow.app`) |
| `SUBGRAPH_URL` | Yes | Subgraph endpoint for dispatch signal scans |
| `DISPATCH_AUTH_TOKEN` | Yes | Bearer token required by `POST /v1/push/dispatch` |
| `OPEN_INTEREST_NEAR_CAP_BPS` | No | Threshold for open-interest alerting (default `9000`) |
| `ORACLE_STALE_THRESHOLD_SECONDS` | No | Oracle staleness threshold in seconds (default `2700`) |
| `LARGE_PNL_THRESHOLD_USD` | No | Realized PnL threshold for large-PnL alerts (default `5000`) |
| `RESERVE_BREACH_COOLDOWN_MS` | No | Cooldown window for reserve-breach repeat alerts (default `1800000`) |
| `PORT` | No | HTTP listen port (default `8080`) |

## Deployment

Deploy scripts pull a live **Yahoo Finance** quote for `BHP.AX` (8-decimal USD raw) via Node (`scripts/fetch-yf-asset-price.js` and Foundry `ffi`). The script writes `cache/yf-seed-price.txt` (gitignored); Solidity reads it with `vm.readFile` so the seed is not passed through `ffi` stdout (which can mis-decode decimal ASCII). **Node** must be on `PATH`, and the machine needs **outbound network** access unless you pin a seed.

- **Offline / no Yahoo:** set `SEED_PRICE_RAW` to the 8-decimal raw integer (e.g. `4500000000` for \$45.00) so deploy skips FFI.

```bash
# Local (Anvil)
npm run deploy:local

# Ethereum Sepolia (writes apps/web/src/config/sepolia-deployment.json)
npm run deploy:sepolia
```

## Local Development (Docker Compose)

Docker Compose runs the infrastructure (Anvil chain, Postgres, IPFS, graph-node). The **UI and deploys run on the host** for native hot reload and fast iteration.

### Prerequisites

- Docker / Docker Compose
- Node.js (for the web app and subgraph tooling)
- Foundry (`forge`, `cast`) on `PATH`

### Quick start

```bash
# 1. Start infra + deploy contracts + deploy subgraph (one command)
npm run local:up

# 2. Start the UI dev server (separate terminal, hot reloads on file changes)
npm run local:dev
```

Open `http://localhost:3000`, log in via Privy (or connect MetaMask), and switch the deployment target to **Anvil**.

### Redeploying after code changes

After changing Solidity contracts, subgraph mappings, or schema:

```bash
npm run redeploy:local
```

This re-deploys contracts to the running Anvil, updates `local-deployment.json`, syncs the subgraph network config, rebuilds the manifest, and deploys the subgraph to graph-node. The Next.js dev server picks up the new contract addresses via HMR -- no restart needed.

### Other commands

```bash
# Stream Docker service logs
npm run local:logs

# Stop all services and wipe volumes (full reset)
npm run local:down
```

### Service endpoints

| Service | URL |
| --- | --- |
| Anvil RPC | `http://127.0.0.1:8545` |
| Graph query | `http://127.0.0.1:8000/subgraphs/name/indexflow-prototype` |
| Graph admin | `http://127.0.0.1:8020` |
| Graph status | `http://127.0.0.1:8030/graphql` |
| Web UI | `http://127.0.0.1:3000` |

### How it fits together

- `docker-compose.local.yml` runs only infra services (Anvil, Postgres, IPFS, graph-node).
- `scripts/local/redeploy.sh` deploys contracts and the subgraph from the host, targeting Docker services over localhost ports.
- The UI runs on the host via `npm run local:dev`, which sets `NEXT_PUBLIC_SUBGRAPH_URL` to the local graph-node so subgraph reads work on the Anvil target.
- `apps/web/src/config/local-deployment.json` is written by the deploy script and imported by the Next.js app at build/dev time. File changes trigger HMR.

### Web app runtime contract wiring

- Deployment target persists in `localStorage` and follows the network selector.
- `apps/web/src/config/sepolia-deployment.json` is used when target is `sepolia`.
- `apps/web/src/config/local-deployment.json` is used when target is `anvil`.
- Authentication uses **Privy** (email, Google, or external wallets like MetaMask). Set `NEXT_PUBLIC_PRIVY_APP_ID` from [dashboard.privy.io](https://dashboard.privy.io).
- The app is installable as a PWA (`/manifest.webmanifest`, `public/sw.js`). Notification preferences are managed in **Settings** (`/settings`).
- iOS install note: use **Safari → Share → Add to Home Screen**. iOS Web Push requires Home Screen install.
- For local Anvil testing, connect MetaMask through Privy with the pre-funded Anvil account (`0xf39Fd6...`).
- In E2E mode (`NEXT_PUBLIC_E2E_TEST_MODE=1`), deployment target is locked to `anvil` and the deterministic mock wallet connector remains enabled for CI-stable signing.
- When a wallet is connected on the wrong network, the app auto-requests a switch to the selected deployment chain.

## Subgraph Ops

`apps/subgraph` syncs network addresses from web deployment outputs before manifest generation.

Mappings that reuse shared basket refresh/snapshot helpers (`BasketFactory`, `VaultAccounting`, and `BasketVaultTemplate`) must declare the helper ABIs: `BasketVault`, `BasketShareToken`, `ERC20`, and `VaultAccounting`.

```bash
# optional manual sync
npm --prefix apps/subgraph run sync:networks

# generate + build for local indexing
NETWORK=anvil npm --prefix apps/subgraph run build

# generate + build for Ethereum Sepolia indexing
NETWORK=sepolia npm --prefix apps/subgraph run build
```

### Deploying to Subgraph Studio (Sepolia)

```bash
# authenticate (one-time, deploy key from https://thegraph.com/studio/)
npx graph auth <DEPLOY_KEY>

# deploy
NETWORK=sepolia SUBGRAPH_SLUG=<your-slug> npm --prefix apps/subgraph run deploy
```

Set `NEXT_PUBLIC_SUBGRAPH_URL` in Vercel (or `.env.local`) to the Studio query URL, e.g.
`https://api.studio.thegraph.com/query/<id>/<slug>/<version>`.

Runtime note:

- The web app enables subgraph reads for any deployment target (`sepolia` or `anvil`) when `NEXT_PUBLIC_SUBGRAPH_URL` is configured. `npm run local:dev` sets this automatically for local development.
- When `NEXT_PUBLIC_SUBGRAPH_URL` is unset, unavailable, or subgraph rows are unusable, affected views fall back to RPC data paths.

## Operations

The GMX vault reads prices from **SimplePriceFeed**, not from **OracleAdapter** directly. After deploy, wire **PriceSync** as a keeper on `SimplePriceFeed` (`setKeeper(address(priceSync), true)`) and add **PriceSync** mappings (`addMapping(assetId, gmxToken)`) for each asset the pool trades.

**Keeping perp prices aligned with the oracle**

- **Chainlink-backed assets** — `OracleAdapter.getPrice` reads the feed when called. Push that value into the vault feed by calling **`PriceSync.syncAll()`** or **`PriceSync.syncPrices(assetIds)`** on whatever cadence you need (anyone can send these txs).
- **Custom relayer assets** — A keeper must call **`OracleAdapter.submitPrice`** / **`submitPrices`** first (requires `setKeeper` on the adapter), then run **`PriceSync.sync*`** as above.

Basket configuration still validates asset ids through `OracleAdapter`, but share mint/redeem pricing is NAV-based and perp-driven. The perp path only updates GMX on-chain feed storage when **PriceSync** runs.

For basket/perp operator responsibilities (capital allocation, position management controls, and investor liquidity implications), see [docs/ASSET_MANAGER_FLOW.md](docs/ASSET_MANAGER_FLOW.md).

**Perp leverage risk**

- Effective leverage is approximately `size / collateral` for each opened leg.
- Example: `size = 10,000` and `collateral = 2,000` is about `5x`, so an approximately `10%` favorable/adverse move is about `+/-50%` on collateral before fees/funding and execution effects.
- For full mechanics and operator caveats, see [docs/SHARE_PRICE_AND_OPERATIONS.md](docs/SHARE_PRICE_AND_OPERATIONS.md) and [docs/ASSET_MANAGER_FLOW.md](docs/ASSET_MANAGER_FLOW.md).

**Funding** — Keepers authorized on **FundingRateManager** call **`updateFundingRate`** so the GMX vault’s funding parameters stay in line with your policy (often on a schedule tied to `fundingInterval`).

Automation (e.g. cron, Gelato, Chainlink Automation) is optional: it only replaces manually sending the same transactions.

**Reserve liquidity controls**

- Basket owners can set a reserve target via `setMinReserveBps` to keep idle USDC available for redemptions.
- `allocateToPerp` is reserve-aware and only allows allocations up to `getAvailableForPerpUsdc()`.
- Anyone can add non-dilutive reserve cash via `topUpReserve(amount)` (USDC transfer, no share mint).

**GMX `bufferAmounts` policy (this repo)**

- `bufferAmounts` remains in the fork for compatibility.
- This integration treats it as mostly unused and expects values to remain `0` unless you intentionally adopt swap-buffer constraints.
- Local deploy now seeds a USDC buffer (`200,000 USDC`) in `DeployLocal.s.sol` to keep explicit swap headroom during testing.
- Web admin exposes global pool controls in **Admin → Pool**:
  - `setBufferAmount` (gov-only, per whitelisted token)
  - direct pool funding via token `transfer(gmxVault, amount)` then `directPoolDeposit(token)` (per whitelisted token)

**Run one-shot sync for all supported assets (local deployment config)**

```bash
forge script script/SyncAllOraclePrices.s.sol:SyncAllOraclePrices --rpc-url local --broadcast
```

**Sepolia sync helpers (uses `apps/web/src/config/sepolia-deployment.json`)**

```bash
npm run sync:sepolia
npm run submit-sync:sepolia
```

**Default oracle profile (greenfield `DeployLocal` / `DeploySepolia`)**

- Only **`BHP.AX`** is registered, as `FeedType.CustomRelayer` (`stalenessThreshold=86400`, `deviationBps=2000`), for the Yahoo Finance relayer path.
- Add more symbols (including `FeedType.Chainlink` feeds such as Sepolia XAU/USD at `0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea`) via **Admin → Assets** or a customized deploy script.

**Yahoo Finance price relayer (config-free, on-chain driven)**

`scripts/update-yahoo-finance-prices.js` enumerates all active `CustomRelayer` assets from the `OracleAdapter` contract on-chain, reads their stored `assetSymbols`, fetches Yahoo Finance quotes, converts non-USD currencies via FX rates, and submits 8-decimal USD prices to `submitPrices` + `syncAll`. No local config file is needed.

```bash
# Dry-run (no tx broadcast)
npm run update-prices:sepolia:dry

# Broadcast submitPrices + syncAll (requires PRIVATE_KEY)
PRIVATE_KEY=0x... npm run update-prices:sepolia
```

**Local Anvil**

```bash
npm run update-prices:local:dry
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 npm run update-prices:local
```

Config/env overrides: `DEPLOYMENT_CONFIG`, `RPC_URL`.

**Registering new assets via admin UI**

The admin assets page (`/admin/oracle`) includes a Yahoo Finance search that lets operators discover any publicly-traded equity and register it on-chain as a `CustomRelayer` asset with an initial price seed. Ambiguous unsuffixed equities (for example `BHP`) are rejected and must be registered with an explicit exchange suffix (for example `BHP.AX`). Unique unsuffixed equities (for example `AAPL`) and non-equity symbols remain valid. Registered assets automatically appear in basket asset pickers.

**Multi-Agent Framework**

Agents are defined as markdown files in `agents/` -- each file is a system prompt + YAML config specifying which MCP servers to use. No JavaScript required to create a new agent.

```bash
# Install MCP server deps (one-time)
npm --prefix apps/vault-manager-mcp install

# Uses repo-root .env / .env.local if present (see Configuration above)

# Run the sample agent by name
LLM_API_KEY=sk-... npm run agent:run -- sample-vault-manager

# Dry-run mode
AGENT_DRY_RUN=1 LLM_API_KEY=sk-... npm run agent:run -- sample-vault-manager

# Interactive write approval mode (asks before on-chain writes)
AGENT_CONFIRM_WRITES=1 LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent:run -- sample-vault-manager

# Backward-compatible shortcuts for sample-vault-manager
LLM_API_KEY=sk-... npm run agent:dry
LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent
```

A GitHub Actions cron (`.github/workflows/vault-agent.yml`) runs agents on Sepolia with manual dispatch and an `agent_name` parameter. See [docs/AGENTS_FRAMEWORK.md](docs/AGENTS_FRAMEWORK.md) for the full guide: creating agents, MCP tool reference, vault lifecycle, and memory.

Agent run history is network-scoped to avoid cross-network context bleed: each agent writes/reads `agents/memory/<agent>/run-log.<network>.jsonl` (for example `run-log.sepolia.jsonl`, `run-log.local.jsonl`). Override with `AGENT_NETWORK` if needed. Dry runs (`AGENT_DRY_RUN=1`) do not update run logs.

Agent memory is deployment-aware: the runner fingerprints the active deployment context (network key + `DEPLOYMENT_CONFIG` content + `RPC_URL`). When that fingerprint changes (for example after redeploying contracts), it automatically invalidates stale memory for that network by rotating `state.json` and `run-log.<network>.jsonl` into `agents/memory/<agent>/archive/`, then starts from a fresh vault context.

## Documentation

- In-app wiki (web app):
  - `/docs` — searchable index sourced directly from repository markdown under `docs/*.md`.
  - Canonical routes:
    - `/docs/readme`
    - `/docs/technical-architecture-roadmap`
    - `/docs/investor-flow`
    - `/docs/asset-manager-flow`
    - `/docs/perp-risk-math`
    - `/docs/operator-interactions`
    - `/docs/price-feed-flow`
    - `/docs/oracle-supported-assets`
    - `/docs/global-pool-management-flow`
    - `/docs/deployments`
    - `/docs/e2e-testing`
    - `/docs/share-price-and-operations`
    - `/docs/pwa-push-notifications`
    - `/docs/regulatory-roadmap-draft`
  - Legacy wiki slugs remain supported as compatibility aliases and redirect to canonical routes.
- Operator monitoring surfaces (web app):
  - `/prices` — live oracle status and current per-asset prices, with dynamic source badges (`Chainlink` or `Custom Oracle`).
  - `/prices/[assetId]` — per-asset historical `PriceUpdated` timeline + chart with 24H/7D/30D windows.
- [MODIFICATIONS.md](MODIFICATIONS.md) — Detailed changes vs upstream GMX.
- [docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md](docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md) — Canonical IndexFlow technical architecture and roadmap document for basket-vault, shared-perp, oracle, monitoring, governance, and tokenomics design.
- [docs/INVESTOR_FLOW.md](docs/INVESTOR_FLOW.md) — Basket share holder journey, mint/redeem vs NAV, perp allocation, and what investors do not control.
- [docs/ASSET_MANAGER_FLOW.md](docs/ASSET_MANAGER_FLOW.md) — Basket/perp manager flow: setup, capital allocation, positions, risk controls, and implementation caveats.
- [docs/PERP_RISK_MATH.md](docs/PERP_RISK_MATH.md) — Leverage formulas, unit conventions, and liquidation caveats for operator sizing decisions.
- [docs/OPERATOR_INTERACTIONS.md](docs/OPERATOR_INTERACTIONS.md) — Per-contract interaction matrix with inputs, checks, state deltas, and post-tx verification steps.
- [docs/GLOBAL_POOL_MANAGEMENT_FLOW.md](docs/GLOBAL_POOL_MANAGEMENT_FLOW.md) — Global GMX pool operations in Admin → Pool: buffer management and direct pool funding flow.
- [docs/PRICE_FEED_FLOW.md](docs/PRICE_FEED_FLOW.md) — OracleAdapter → PriceSync → SimplePriceFeed lifecycle, GMX vault reads, and admin wiring (Mermaid sequence diagrams).
- [docs/ORACLE_SUPPORTED_ASSETS.md](docs/ORACLE_SUPPORTED_ASSETS.md) — Sepolia-focused asset registry showing each supported symbol and its oracle source (Chainlink feed or Yahoo Finance relayer).
- [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) — Deployment registry for Sepolia contracts, Subgraph indexing, and Google Cloud push-worker infrastructure (push notifications only).
- [docs/E2E_TESTING.md](docs/E2E_TESTING.md) — Playwright + Anvil E2E runbook, CI wiring, and lifecycle scope.
- [docs/PWA_PUSH_NOTIFICATIONS.md](docs/PWA_PUSH_NOTIFICATIONS.md) — PWA install behavior, push worker architecture, notification categories, and staging verification runbook.
- [docs/REGULATORY_ROADMAP_DRAFT.md](docs/REGULATORY_ROADMAP_DRAFT.md) — Draft brainstorming memo for EU-first launch structuring, likely regulatory perimeter, phased workstreams, and launch-limiting assumptions.
- [docs/README.md](docs/README.md) — Maintainer-facing map of canonical `/docs/*` routes and legacy alias redirects.
- Basket trade flows in the web app include icon-based Deposit/Redeem tabs, a stable quote area, and inline transaction feedback so users can verify what will happen before they submit.

## E2E Tests

```bash
# Start an Anvil node
anvil --host 127.0.0.1 --port 8545

# Deploy local contracts to the running node
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 npm run deploy:local

# Run Playwright suite in deterministic E2E mode
NEXT_PUBLIC_E2E_TEST_MODE=1 E2E_RPC_URL=http://127.0.0.1:8545 npm run test:e2e:ci
```

For a local report, run `forge coverage` (use `--ir-minimum` if the compiler reports stack-too-deep). CI uploads Foundry LCOV to [Codecov](https://codecov.io/gh/reubenr0d/indexflow-prototype) for the badge above, with Codecov project status scoped to Solidity paths (`**/*.sol`) and upload search disabled so only `lcov.info` is processed. The upload step is best-effort (non-blocking) and retried once on transient failure so Codecov outages do not fail overall CI. During Codecov incidents, the badge can remain stale until a later successful upload. CI also pins `foundry-rs/foundry-toolchain` to Foundry `v1.3.1` (instead of floating `stable`) to keep `forge/cast/anvil/chisel` installs deterministic across runs, and provides placeholder explorer API key env vars for non-verify local broadcast steps in CI.
