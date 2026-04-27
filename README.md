# Perp Infrastructure (GMX v1 Fork)

[![CI](https://github.com/reubenr0d/indexflow-prototype/actions/workflows/test.yml/badge.svg)](https://github.com/reubenr0d/indexflow-prototype/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/reubenr0d/indexflow-prototype/graph/badge.svg)](https://codecov.io/gh/reubenr0d/indexflow-prototype)

Perp-driven basket vaults backed by a shared perpetual liquidity pool, built on a GMX v1 fork.

## Architecture

**Hub-and-spoke topology:** One **hub** chain runs the full perp stack (VaultAccounting, GMX pool, OracleAdapter, etc.). **Spoke** chains are deposit-only with `StateRelay` for routing weights and NAV adjustments; the layout can scale to many spokes as configured in [`config/chains.json`](config/chains.json). A keeper service posts state to all chains each epoch.

```
                    ┌─── Spoke ───────────────────────────────┐
                    │  Investor ──► BasketVault ──► StateRelay │
                    │       │         (deposit-only)           │
                    │  mint shares    RedemptionReceiver ◄─┐   │
                    └─────────────────────────────────────┼───┘
                                                         │ CCIP
┌─── Hub ────────────────────────────────────────────────┼───┐
│  Investor ──► BasketVault ──► VaultAccounting ──► GMX Pool │
│       │           │                │                       │
│  mint shares  StateRelay      position PnL                 │
│  (NAV-priced)                 (tracked per vault)          │
│                                                            │
│  Keeper ──► StateRelay.updateState() (routing + PnL)       │
└────────────────────────────────────────────────────────────┘
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

### Coordination Layer (`src/coordination/`)

- **StateRelay** -- Keeper-posted routing weights and per-vault global PnL adjustments; deposit routing guard via `getLocalWeight()`
- **RedemptionReceiver** -- CCIP receiver on spoke chains for keeper-bridged USDC redemption fills
- **PoolReserveRegistry** -- TWAP-style pool depth tracking (hub, legacy)
- **CCIPReserveMessenger** -- Delta-triggered reserve state sync over Chainlink CCIP (hub, legacy)
- **IntentRouter** -- Deposit/redeem intent routing with escrow (hub only)
- **CrossChainIntentBridge**, **OracleConfigQuorum** -- CCIP relay and quorum-based oracle config consensus (hub only)

### Keeper Service (`services/keeper/`)

- Off-chain Node.js epoch loop: reads all chains, computes inverse-proportional routing weights and per-spoke PnL adjustments, posts `StateRelay.updateState()` to every chain each epoch

### Contracts per chain type

Exact hub/spoke rollout is defined in [`config/chains.json`](config/chains.json).

| Contract | Hub | Spoke | Notes |
| --- | --- | --- | --- |
| `BasketFactory` | Yes | Yes (no oracle) | Spoke factory passes `address(0)` for oracle |
| `BasketVault` | Yes | Yes | Spoke vaults have `vaultAccounting = address(0)` |
| `BasketShareToken` | Yes | Yes | Created by factory per basket |
| `VaultAccounting` | Yes | No | Perp capital tracking, hub only |
| `OracleAdapter` | Yes | No | Price feeds, hub only |
| `PricingEngine` | Yes | No | Execution quotes, hub only |
| `FundingRateManager` | Yes | No | GMX funding, hub only |
| `PriceSync` | Yes | No | Oracle→GMX sync, hub only |
| `PerpReader` | Yes | No | Read aggregation, hub only |
| `AssetWiring` | Yes | No | Asset bootstrap, hub only |
| `GMX fork` | Yes | No | Shared liquidity pool, hub only |
| `StateRelay` | Yes | Yes | Routing weights + PnL adjustments |
| `RedemptionReceiver` | No | Yes | CCIP inbound for redemption fills |
| `PoolReserveRegistry` | Yes (legacy) | No | Superseded by StateRelay |
| `USDC` (or MockUSDC) | Yes | Yes | Deposit/redemption token |

Hub deployments use `script/Deploy.s.sol`. Spoke deployments use `script/DeploySpoke.s.sol` (deploys only USDC, BasketFactory, and StateRelay). The `scripts/deploy-all.sh` script reads `config/chains.json` and selects the correct script per chain role.

### GMX Fork (`src/gmx/`)

Forked GMX v1 contracts (Solidity 0.6.12) providing the core position engine:
Vault, VaultUtils, Router, ShortsTracker, BasePositionManager.

## Mainnet Readiness TODO

### Smart Contracts

- [ ] Engage audit firm (BasketVault, VaultAccounting, OracleAdapter, GMX integration, PriceSync, FundingRateManager, PricingEngine)
- [ ] Address audit findings and re-verify fixes
- [ ] Write mainnet deploy script (`DeployMainnet.s.sol` or chain-specific variant)
- [ ] Deploy Gnosis Safe multi-sig as protocol owner
- [ ] Deploy OpenZeppelin TimelockController for admin actions
- [ ] Transfer all module ownership to multi-sig + timelock
- [ ] Migrate oracle from Yahoo Finance relayer to Chainlink / Pyth / RedStone

### Legal / Entity

- [ ] Incorporate Foundation entity (Cayman Foundation Company)
- [ ] Formalize Labs company
- [ ] Execute Labs-Foundation services agreement and IP license
- [ ] Draft and publish Terms of Service
- [ ] Draft and publish risk disclosures
- [ ] Implement frontend geo-blocking (U.S. + OFAC-sanctioned jurisdictions)
- [ ] Integrate OFAC / sanctions wallet screening

### Infrastructure

- [ ] Production oracle integration (Chainlink / Pyth for all mainnet assets)
- [ ] Monitoring and alerting (oracle staleness, reserve levels, pool utilization, position health)
- [ ] Keeper redundancy (at least 2 independent operators)
- [ ] Incident response runbook
- [ ] Bug bounty program (Immunefi)

### Governance

- [ ] Foundation multi-sig (3-of-5 Gnosis Safe) deployed and funded
- [ ] Security council members identified for Stage 1 expansion (4-of-7)
- [ ] Progressive decentralization plan documented (see [docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md](docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md))
- [ ] Governance token design (deferred to post-launch, design begins in Phase 2)

### Documentation

- [ ] Update deployment registry for mainnet ([docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md))
- [ ] Finalize whitepaper ([docs/WHITEPAPER_DRAFT.md](docs/WHITEPAPER_DRAFT.md))
- [ ] Publish audit report
- [ ] Update regulatory roadmap post-foundation setup ([docs/REGULATORY_ROADMAP_DRAFT.md](docs/REGULATORY_ROADMAP_DRAFT.md))

## Growth

Progress tracker for the IndexFlow growth engine. Strategy, templates, and playbooks live in [`growth/`](growth/).

### Content Infrastructure

- [x] Growth strategy and 4-layer framework ([growth/README.md](growth/README.md))
- [x] Content calendar with layer-tagged backlog ([growth/CONTENT_CALENDAR.md](growth/CONTENT_CALENDAR.md))
- [x] VC outreach playbook ([growth/VC_OUTREACH_PLAYBOOK.md](growth/VC_OUTREACH_PLAYBOOK.md))
- [x] Content templates (blog, tweet thread, Substack, LinkedIn, podcast pitch, Farcaster)
- [x] Drafts workflow and naming conventions ([growth/drafts/README.md](growth/drafts/README.md))
- [x] In-app SEO blog (`/blog`, `/blog/[slug]`) with frontmatter, JSON-LD, sitemap, reading time

### Social Channels

- [ ] Set up X / Twitter account
- [ ] Set up Discord server
- [x] Telegram community live

### Content Production

- [x] First blog post published (cross-chain liquidity routing)
- [x] Second blog post published (five waves of on-chain exposure)
- [x] TradFi asset manager blog post published (`/blog/if-you-run-money-the-old-way-crypto-question`)
- [ ] First X thread published
- [ ] First LinkedIn post published
- [ ] First Substack issue published
- [ ] First YouTube video published
- [ ] First podcast pitch sent
- [ ] First Farcaster cast published
- [x] Cross-chain coordination layer content added to content calendar (blog, X threads, LinkedIn, Substack, YouTube)
- [x] Technical breakdown blog draft: cross-chain coordination layer (`growth/drafts/2026-04-15-blog-cross-chain-coordination-layer.md`)
- [x] X thread draft: cross-chain coordination layer (`growth/drafts/2026-04-15-thread-cross-chain-coordination.md`)

### Lead Capture (Layer 2)

- [ ] Testnet gated pilot pathway (email capture at vault creation)
- [ ] Operator waitlist for mainnet early access
- [ ] Lead magnet PDF: "The Asset Manager's Playbook"
- [ ] Lead magnet PDF: "From TradFi Funds to DeFi Vaults"
- [ ] Video Sales Letter (VSL) recorded and hosted

### Lead Management (Layer 3)

- [ ] Email nurture platform selected (Customer.io or similar)
- [ ] Welcome email sequence configured
- [ ] Behavioral trigger sequences configured
- [ ] Lead scoring model implemented (Clay / HubSpot)

### VC Pipeline

- [ ] Clay workspace set up with enriched VC list
- [ ] Sending domains configured and warmed (Instantly.ai)
- [ ] LinkedIn automation configured (Expandi / HeyReach)
- [ ] Signal monitoring live (Trigify / Midbound)
- [ ] Trackable deck hosted (Docsend / Notion)
- [ ] First Tier 1 outreach batch sent
- [ ] First monthly investor update sent

### Grants

- [x] Grant blurb written ([growth/grants/blurb.md](growth/grants/blurb.md))
- [x] 0x Labs grant draft: Strategy KPIs distinguish chain-local vs protocol-level metrics ([growth/grants/0xlabs-grant-application.md](growth/grants/0xlabs-grant-application.md))
- [ ] 0xLabs grant application submitted ([growth/grants/0xlabs-grant-application.md](growth/grants/0xlabs-grant-application.md))

## Tech Stack

- **Solidity** -- 0.6.12 (GMX fork) + ^0.8.24 (new contracts)
- **Foundry** -- Build, test, deploy
- **OpenZeppelin** 5.x -- ERC20, Ownable, ReentrancyGuard
- **Chainlink CCIP** -- Cross-chain messaging for coordination layer (StateRelay sync, RedemptionReceiver fills, oracle config quorum)
- **Keeper service** -- Node.js/TypeScript epoch loop for routing weights and PnL adjustments (`services/keeper/`)
- **Hub chain** — public testnet (or equivalent) with the full perp stack; see [`config/chains.json`](config/chains.json)
- **Spoke chains** — additional networks, deposit-only with `StateRelay`; roles and RPC aliases are configured alongside the hub

## Setup

```bash
# Install dependencies
forge install
npm install

# Formatting and lint checks run in CI (no local git hooks).
# See .github/workflows/test.yml for the full CI pipeline.

# Build
forge build

# Test
forge test -vv
```

## Configuration

Environment templates (all variables documented with comments):

- **Repo root:** copy [`.env.example`](.env.example) to `.env` for Foundry RPC URLs, explorer keys, deploy overrides, agents, and scripts that read the root `.env` / `.env.local`.
- **Web app:** copy [`apps/web/.env.example`](apps/web/.env.example) to `apps/web/.env.local` for `NEXT_PUBLIC_*` and Playwright/E2E vars.

For Forge scripts and root-level tooling, set RPC URLs and explorer API keys in `.env` using [`.env.example`](.env.example) as the template; variable names align with [`foundry.toml`](foundry.toml) `[rpc_endpoints]` and `[etherscan]`.

### Web App Environment

The Next.js web app reads `apps/web/.env.local` (or shell). Required and optional variables:

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes | Privy app ID from [dashboard.privy.io](https://dashboard.privy.io) |
| `NEXT_PUBLIC_SUBGRAPH_URL` | No | Fallback subgraph endpoint (auto-set by `local:dev`) |
| `NEXT_PUBLIC_SUBGRAPH_URL_<NETWORK_KEY>` | No | Per-deployment-target subgraph URL; `<NETWORK_KEY>` is the uppercase deployment target key (see [`apps/web/.env.example`](apps/web/.env.example)) |
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

**Hub vs spoke:** Hub chains deploy the full perp stack via `Deploy.s.sol`. Spoke chains deploy deposit-only infrastructure via `DeploySpoke.s.sol`. The `deploy-all.sh` script reads [`config/chains.json`](config/chains.json) and selects the correct script per chain role.

Deploy scripts pull a live **Yahoo Finance** quote for `BHP.AX` (8-decimal USD raw) via Node (`scripts/fetch-yf-asset-price.js` and Foundry `ffi`). The script writes `cache/yf-seed-price.txt` (gitignored); Solidity reads it with `vm.readFile` so the seed is not passed through `ffi` stdout (which can mis-decode decimal ASCII). **Node** must be on `PATH`, and the machine needs **outbound network** access unless you pin a seed.

- **Offline / no Yahoo:** set `SEED_PRICE_RAW` to the 8-decimal raw integer (e.g. `4500000000` for \$45.00) so deploy skips FFI.

```bash
# Deploy all chains (reads config/chains.json, picks Deploy.s.sol or DeploySpoke.s.sol per role)
./scripts/deploy-all.sh

# Deploy a single chain (<key> is the network id in config/chains.json)
./scripts/deploy-all.sh --chain <key>

# Local (Anvil, hub role)
npm run deploy:local

# Hub public testnet (writes apps/web/src/config/<target>-deployment.json for the hub key)
CHAIN=<hubKey> forge script script/Deploy.s.sol:Deploy --rpc-url <rpcAlias> --broadcast -vvv

# Additional deploy:* shortcuts (per configured network) live in package.json
```

`<hubKey>` must match the `chain` field for the hub entry in `config/chains.json`. `<rpcAlias>` must match an endpoint name in [`foundry.toml`](foundry.toml) `[rpc_endpoints]` (the same alias you pass to `forge script --rpc-url`).

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
- For each deployment target key, the app loads `apps/web/src/config/<target>-deployment.json` when that target is selected (see deploy script outputs under `apps/web/src/config/`).
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

# generate + build for a hosted / public testnet target (<deployment_target> matches subgraph network config)
NETWORK=<deployment_target> npm --prefix apps/subgraph run build
```

### Deploying to Subgraph Studio

```bash
# authenticate (one-time, deploy key from https://thegraph.com/studio/)
npx graph auth <DEPLOY_KEY>

# deploy
NETWORK=<deployment_target> SUBGRAPH_SLUG=<your-slug> npm --prefix apps/subgraph run deploy
```

Set `NEXT_PUBLIC_SUBGRAPH_URL` in Vercel (or `.env.local`) to the Studio query URL, e.g.
`https://api.studio.thegraph.com/query/<id>/<slug>/<version>`.

Runtime note:

- The web app enables subgraph reads for any deployment target when a subgraph URL is configured. Per-target `NEXT_PUBLIC_SUBGRAPH_URL_<NETWORK_KEY>` values (see [`apps/web/.env.example`](apps/web/.env.example)) take precedence; `NEXT_PUBLIC_SUBGRAPH_URL` is the fallback. `npm run local:dev` sets the fallback automatically for local development.
- When no subgraph URL is available, affected views fall back to RPC data paths.
- The "All Chains" view in the network selector aggregates data from all configured chain subgraphs in parallel.

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

**Cross-chain keeper service**

The keeper service (`services/keeper/`) is required for hub-and-spoke operation:

```bash
# Start the keeper (reads all chains from config/chains.json)
# Set PRIVATE_KEY and the RPC env vars from .env.example for every network the keeper touches.
PRIVATE_KEY=0x... npm run keeper:start

# Configure epoch interval (default 60s)
EPOCH_INTERVAL_MS=30000 npm run keeper:start
```

Each epoch the keeper:
1. Reads vault reserves and hub PnL across all deployed chains.
2. Computes routing weights (inverse-proportional to idle USDC per chain).
3. Computes per-vault global PnL adjustments (hub PnL distributed pro-rata).
4. Posts `StateRelay.updateState()` to every chain.

The keeper also monitors pending redemptions on spoke chains and bridges USDC from the hub via CCIP to fill them through `RedemptionReceiver`.

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

**Hub deployment sync helpers** — use the `sync:*` and `submit-sync:*` scripts in [`package.json`](package.json); each sets `DEPLOYMENT_CONFIG` to the matching `apps/web/src/config/<target>-deployment.json` and `--rpc-url` for that target.

**Default oracle profile (greenfield `DeployLocal` / hub testnet deploy)**

- Only **`BHP.AX`** is registered, as `FeedType.CustomRelayer` (`stalenessThreshold=86400`, `deviationBps=2000`), for the Yahoo Finance relayer path.
- Add more symbols (including `FeedType.Chainlink` feeds on your hub network) via **Admin → Assets** or a customized deploy script; see [docs/ORACLE_SUPPORTED_ASSETS.md](docs/ORACLE_SUPPORTED_ASSETS.md).

**Yahoo Finance price relayer (config-free, on-chain driven)**

`scripts/update-yahoo-finance-prices.js` enumerates all active `CustomRelayer` assets from the `OracleAdapter` contract on-chain, reads their stored `assetSymbols`, fetches Yahoo Finance quotes, converts non-USD currencies via FX rates, and submits 8-decimal USD prices to `submitPrices` + `syncAll`. No local config file is needed.

**Public testnets (hub / spoke)**

Use the matching `update-prices:*` and `update-prices:*:dry` scripts in [`package.json`](package.json); each wires `DEPLOYMENT_CONFIG` and `RPC_URL` for its target.

**Local Anvil**

```bash
npm run update-prices:local:dry
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 npm run update-prices:local
```

Config/env overrides: `DEPLOYMENT_CONFIG`, `RPC_URL`.

GitHub automation: `.github/workflows/update-prices.yml` runs every 15 minutes and serializes overlapping runs per network using Actions `concurrency` (queue policy, no in-progress cancellation).

**Registering new assets via admin UI**

The admin assets page (`/admin/oracle`) includes a Yahoo Finance search that lets operators discover any publicly-traded equity and register it on-chain as a `CustomRelayer` asset with an initial price seed. Ambiguous unsuffixed equities (for example `BHP`) are rejected and must be registered with an explicit exchange suffix (for example `BHP.AX`). Unique unsuffixed equities (for example `AAPL`) and non-equity symbols remain valid. Registered assets automatically appear in basket asset pickers.

**Multi-Agent Framework**

Agents are defined as markdown files in `agents/` -- each file is a system prompt + YAML config specifying which MCP servers to use. No JavaScript required to create a new agent.
For deterministic behavior, agents can also define policy frontmatter (for example `autoAllocateTargetBps`, `entryMode`, `entryMomentumPctMin`, `entryVolumeMin`, `entryDirection`, `maxNewPositionsPerRun`).

```bash
# Install MCP server deps (one-time)
npm --prefix apps/mcps/vault-manager install

# Uses repo-root .env / .env.local if present (see Configuration above)

# Run the sample agent by name
LLM_API_KEY=sk-... npm run agent:run -- sample-vault-manager

# Dry-run mode
AGENT_DRY_RUN=1 LLM_API_KEY=sk-... npm run agent:run -- sample-vault-manager

# Write confirmations are ON by default (interactive TTY prompts before on-chain writes)
LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent:run -- sample-vault-manager

# Non-interactive auto-execute override (off by default)
AGENT_NON_INTERACTIVE_WRITE_EXECUTE=1 LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent:run -- sample-vault-manager

# Backward-compatible shortcuts for sample-vault-manager
LLM_API_KEY=sk-... npm run agent:dry
LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent
```

A GitHub Actions cron (`.github/workflows/vault-agent.yml`) runs agents against the configured hub testnet / CI network with manual dispatch and an `agent_name` parameter. See [docs/AGENTS_FRAMEWORK.md](docs/AGENTS_FRAMEWORK.md) for the full guide: creating agents, MCP tool reference, vault lifecycle, and memory.

Agent run history is network-scoped to avoid cross-network context bleed: each agent writes/reads `agents/memory/<agent>/run-log.<network>.jsonl`. Override with `AGENT_NETWORK` if needed. Dry runs (`AGENT_DRY_RUN=1`) do not update run logs.

Agent memory is deployment-aware: the runner fingerprints the active deployment context (network key + `DEPLOYMENT_CONFIG` content + `RPC_URL`). When that fingerprint changes (for example after redeploying contracts), it automatically invalidates stale memory for that network by rotating `state.json` and `run-log.<network>.jsonl` into `agents/memory/<agent>/archive/`, then starts from a fresh vault context.

Editing an agent markdown file does not, by itself, force a new vault. The runner updates the stored agent file hash for bookkeeping, but if the remembered vault address is still present and the deployment fingerprint is unchanged, subsequent runs keep managing the same vault.

### 0G Network + KeeperHub Integration

The agent framework integrates with **0G Network** for decentralized AI infrastructure and **KeeperHub** for reliable transaction execution.

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Agent Runner (agent-runner.mjs)                   │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │ 0G Compute      │  │ MCP Servers     │  │ Memory                  │ │
│  │ (LLM Inference) │  │                 │  │                         │ │
│  │                 │  │ vault-manager   │  │ File-based (default)    │ │
│  │ Llama 3.3 70B   │  │ yfinance        │  │      OR                 │ │
│  │ via 0G Network  │  │ 0g-storage      │  │ 0G Storage (KV + Log)   │ │
│  │                 │  │ keeperhub       │  │                         │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────────────┘ │
│           │                    │                                        │
│           ▼                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Transaction Execution                        │   │
│  │                                                                 │   │
│  │   Direct (cast)  ◄──────────────►  KeeperHub                   │   │
│  │   - Fast reads                     - Retry logic                │   │
│  │   - Simple writes                  - Gas optimization           │   │
│  │                                    - MEV protection             │   │
│  │                                    - Audit trail                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Running agents:**

```bash
# Install MCP server dependencies (one-time)
npm --prefix apps/mcps/0g-storage install
npm --prefix apps/mcps/keeperhub install

# --- Original agent (OpenAI + file-based memory) ---
# Uses: vault-manager-mcp, yfinance-mcp
LLM_API_KEY=sk-... PRIVATE_KEY=0x... npm run agent
LLM_API_KEY=sk-... npm run agent:dry  # dry-run mode

# --- 0G-enabled agent (decentralized stack) ---
# Uses: vault-manager-mcp, yfinance-mcp, 0g-storage-mcp, keeperhub-mcp

# With 0G Compute (decentralized inference)
ZG_COMPUTE_PROVIDER=0xf07240Efa67755B5311bc75784a061eDB47165Dd \
ZG_COMPUTE_PRIVATE_KEY=0x... \
ZG_PRIVATE_KEY=0x... \
KEEPERHUB_API_KEY=kh_... \
PRIVATE_KEY=0x... \
npm run agent:0g

# With OpenAI (fallback) + 0G Storage + KeeperHub
LLM_API_KEY=sk-... \
ZG_PRIVATE_KEY=0x... \
KEEPERHUB_API_KEY=kh_... \
PRIVATE_KEY=0x... \
npm run agent:0g

# Dry-run mode
npm run agent:0g:dry
```

**Features:**

| Component | Integration | Benefits |
| --- | --- | --- |
| **0G Compute** | Decentralized LLM inference | TEE-verified responses, censorship-resistant |
| **0G Storage KV** | Real-time agent state | Decentralized, persistent across runs |
| **0G Storage Log** | Run history / audit trail | Verifiable with Merkle proofs |
| **KeeperHub** | All keeper transaction execution | Auto-retry, gas optimization, MEV protection |

**KeeperHub powers all three keepers:**

| Keeper | Script/Service | Transactions |
| --- | --- | --- |
| **Price sync** | `scripts/update-yahoo-finance-prices.js` | `submitPrices()`, `syncAll()` |
| **State sync** | `services/keeper/` | `StateRelay.updateState()` on all chains |
| **Agent** | `vault-manager-mcp` | `openPosition()`, `closePosition()`, etc. |

**Environment variables (add to `.env`):**

```bash
# 0G Storage
ZG_PRIVATE_KEY=0x...                    # Funded wallet for storage fees
ZG_RPC_URL=https://evmrpc-testnet.0g.ai # 0G testnet RPC

# 0G Compute (optional, replaces OpenAI)
ZG_COMPUTE_PROVIDER=0xf07240Efa67755B5311bc75784a061eDB47165Dd
ZG_COMPUTE_MODEL=llama-3.3-70b-instruct
ZG_COMPUTE_PRIVATE_KEY=0x...            # Can be same as ZG_PRIVATE_KEY

# KeeperHub
KEEPERHUB_API_KEY=kh_...                # From app.keeperhub.com
```

Get 0G testnet tokens from [faucet.0g.ai](https://faucet.0g.ai). Get a KeeperHub API key from [app.keeperhub.com](https://app.keeperhub.com).

## Hackathon Submission

This project is submitted to the following hackathon tracks:

### 0G: Best Autonomous Agents ($7,500)

An autonomous DeFi vault manager agent with full 0G Network integration:

- **0G Compute**: Decentralized AI inference using Llama 3.3 70B
- **0G Storage KV**: Persistent agent state (vault address, config, thesis)
- **0G Storage Log**: Immutable run history with Merkle-verified audit trail
- **Example Agent**: `agents/0g-vault-manager.md` - manages basket vaults with perp hedging

**Protocol features used:**
- `@0gfoundation/0g-ts-sdk` for Storage KV and Log operations
- `@0glabs/0g-serving-broker` for Compute Network inference
- OpenAI-compatible API integration for seamless LLM switching

### KeeperHub: Best Use ($4,500)

Reliable blockchain transaction execution for AI agents:

- **Integration**: KeeperHub MCP server wrapping their REST API
- **Use Case**: All vault management transactions (open position, allocate, close) routed through KeeperHub
- **Benefits**: Automatic retries, smart gas estimation, MEV protection, full audit trail

**Protocol features used:**
- Direct execution API (`execute_transfer`, `execute_contract_call`)
- Conditional execution (`execute_check_and_execute`)
- Workflow management for complex multi-step operations

### Submission Materials

| Requirement | Location |
| --- | --- |
| Project name | IndexFlow Vault Agent |
| Contract addresses | See [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) |
| Public GitHub repo | This repository |
| README + setup | This file |
| Demo video | [Link TBD] |
| Architecture diagram | See "0G Network + KeeperHub Integration" above |
| Example agent | `agents/0g-vault-manager.md` |

### Quick Demo

```bash
# 1. Clone and install
git clone <repo-url>
npm install
npm --prefix apps/mcps/0g-storage install
npm --prefix apps/mcps/keeperhub install

# 2. Configure environment
cp .env.example .env
# Edit .env with your keys (see 0G and KeeperHub sections)

# 3. Run the 0G-enabled agent
npm run agent:run -- 0g-vault-manager
```

## Documentation

- `/primer` — visual long-scroll explainer page distilling the whitepaper and pitch deck into animated sections with inline SVG diagrams.
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
  - AI docs assistant: a floating chat widget on `/docs` pages lets users ask questions about the protocol. Powered by `gpt-4o-mini`, it ingests all docs and blog posts as context. Requires `LLM_API_KEY` in `apps/web/.env.local`.
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
- [docs/ORACLE_SUPPORTED_ASSETS.md](docs/ORACLE_SUPPORTED_ASSETS.md) — Asset registry for the current public testnet deployment: each supported symbol and its oracle source (Chainlink feed or Yahoo Finance relayer).
- [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) — Deployment registry for live contracts, Subgraph indexing, and Google Cloud push-worker infrastructure (push notifications only).
- [docs/E2E_TESTING.md](docs/E2E_TESTING.md) — Playwright + Anvil E2E runbook, CI wiring, and lifecycle scope.
- [docs/PWA_PUSH_NOTIFICATIONS.md](docs/PWA_PUSH_NOTIFICATIONS.md) — PWA install behavior, push worker architecture, notification categories, and staging verification runbook.
- [docs/REGULATORY_ROADMAP_DRAFT.md](docs/REGULATORY_ROADMAP_DRAFT.md) — Permissionless protocol launch pathway, foundation structure, progressive decentralization, and compliance requirements (draft).
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
