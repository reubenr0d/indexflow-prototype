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

# Ensure git pre-commit hooks are installed (auto-runs via prepare on npm install).
# The hook runs `forge fmt` on staged Solidity files and ESLint validation on staged web files (no auto-fix).
npm run hooks:install

# Build
forge build

# Test
forge test -vv
```

## Configuration

Copy `.env.example` to `.env` and set:

```
SEPOLIA_RPC_URL=
ARBITRUM_RPC_URL=
ARBITRUM_SEPOLIA_RPC_URL=
ETHERSCAN_API_KEY=
ARBISCAN_API_KEY=
```

## Deployment

```bash
# Local (Anvil)
npm run deploy:local

# Ethereum Sepolia (writes apps/web/src/config/sepolia-deployment.json)
npm run deploy:sepolia
```

## Local Compose Stack (Anvil + Contracts + Subgraph + UI)

Use one compose entrypoint to launch a fresh local chain, deploy contracts, deploy the subgraph, and run the web UI:

```bash
# Start full stack
npm run local:up

# Stream logs
npm run local:logs

# Stop and remove volumes (fresh local reset)
npm run local:down
```

If host port `3000` is occupied, remap UI:

```bash
UI_PORT=3001 npm run local:up
```

Default service endpoints:

- Anvil RPC: `http://127.0.0.1:8545`
- Graph query: `http://127.0.0.1:8000/subgraphs/name/indexflow-prototype`
- Graph status: `http://127.0.0.1:8030/graphql`
- Web UI: `http://127.0.0.1:${UI_PORT:-3000}`

Web app runtime contract wiring:

- Deployment target still persists in `localStorage`, but switching now follows the wallet chain selector in the connect button (single network dropdown in navbar).
- `apps/web/src/config/sepolia-deployment.json` is used when target is `sepolia`.
- `apps/web/src/config/local-deployment.json` is used when target is `anvil`.
- In E2E mode (`NEXT_PUBLIC_E2E_TEST_MODE=1`), deployment target is locked to `anvil` and the deterministic mock wallet connector remains enabled for CI-stable signing.
- When MetaMask is connected on the wrong network, the app auto-requests a switch to the selected deployment chain.

## Subgraph Ops

`apps/subgraph` now syncs network addresses from web deployment outputs before manifest generation.

```bash
# optional manual sync
npm --prefix apps/subgraph run sync:networks

# generate + build for local indexing
NETWORK=anvil npm --prefix apps/subgraph run build

# generate + build for Ethereum Sepolia indexing
NETWORK=sepolia npm --prefix apps/subgraph run build
```

Runtime note:

- The web app enables subgraph reads for both `sepolia` and `anvil` when `NEXT_PUBLIC_SUBGRAPH_URL` is configured.
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

**Sepolia mixed-source oracle profile**

- `XAU` is configured as `FeedType.Chainlink` using Sepolia feed `0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea`.
- `XAG` and mining equities (`BHP`, `RIO`, `VALE`, `NEM`, `FCX`, `SCCO`) are configured as `FeedType.CustomRelayer`.
- Relayed assets use `stalenessThreshold=86400` and `deviationBps=2000`.

**Sepolia Pyth relayer updater (XAG + mining equities)**

`scripts/update-pyth-relayer-prices.js` pulls Hermes latest prices from feed ids in `scripts/pyth-feed-config.json`, converts `(price, expo)` to 8-decimal raw values, submits `submitPrices`, then calls `PriceSync.syncAll`.

```bash
# Dry-run (no tx broadcast)
npm run update-pyth:sepolia:dry

# Broadcast submitPrices + syncAll (requires PRIVATE_KEY)
PRIVATE_KEY=0x... npm run update-pyth:sepolia
```

Updater safety checks:

- Fails if any required feed is missing in Hermes response.
- Fails if any feed `publish_time` is older than `MAX_AGE_SECONDS` (default `86400`).
- Config/env overrides: `DEPLOYMENT_CONFIG`, `PYTH_FEED_CONFIG`, `HERMES_URL`, `RPC_URL`, `MAX_AGE_SECONDS`.

## Documentation

- In-app wiki (web app):
  - `/docs` — searchable index sourced directly from repository markdown under `docs/*.md`.
  - Canonical routes:
    - `/docs/readme`
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
  - Legacy wiki slugs remain supported as compatibility aliases and redirect to canonical routes.
- Operator monitoring surfaces (web app):
  - `/prices` — live oracle status and current per-asset prices.
  - `/prices/[assetId]` — per-asset historical `PriceUpdated` timeline + chart with 24H/7D/30D windows.
- [MODIFICATIONS.md](MODIFICATIONS.md) — Detailed changes vs upstream GMX.
- [docs/INVESTOR_FLOW.md](docs/INVESTOR_FLOW.md) — Basket share holder journey, mint/redeem vs NAV, perp allocation, and what investors do not control.
- [docs/ASSET_MANAGER_FLOW.md](docs/ASSET_MANAGER_FLOW.md) — Basket/perp manager flow: setup, capital allocation, positions, risk controls, and implementation caveats.
- [docs/PERP_RISK_MATH.md](docs/PERP_RISK_MATH.md) — Leverage formulas, unit conventions, and liquidation caveats for operator sizing decisions.
- [docs/OPERATOR_INTERACTIONS.md](docs/OPERATOR_INTERACTIONS.md) — Per-contract interaction matrix with inputs, checks, state deltas, and post-tx verification steps.
- [docs/GLOBAL_POOL_MANAGEMENT_FLOW.md](docs/GLOBAL_POOL_MANAGEMENT_FLOW.md) — Global GMX pool operations in Admin → Pool: buffer management and direct pool funding flow.
- [docs/PRICE_FEED_FLOW.md](docs/PRICE_FEED_FLOW.md) — OracleAdapter → PriceSync → SimplePriceFeed lifecycle, GMX vault reads, and admin wiring (Mermaid sequence diagrams).
- [docs/ORACLE_SUPPORTED_ASSETS.md](docs/ORACLE_SUPPORTED_ASSETS.md) — Sepolia-focused asset registry showing each supported symbol and its oracle source identifier (Chainlink feed or Pyth feed ID).
- [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) — Per-network deployment registry (local + Sepolia), contract addresses, explorer links, and refresh workflow.
- [docs/E2E_TESTING.md](docs/E2E_TESTING.md) — Playwright + Anvil E2E runbook, CI wiring, and lifecycle scope.
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

For a local report, run `forge coverage` (use `--ir-minimum` if the compiler reports stack-too-deep). CI uploads LCOV to [Codecov](https://codecov.io/gh/reubenr0d/indexflow-prototype) for the badge above.
