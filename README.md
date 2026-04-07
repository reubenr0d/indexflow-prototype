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

## Subgraph Ops

`apps/subgraph` now syncs network addresses from web deployment outputs before manifest generation.

```bash
# optional manual sync
npm --prefix apps/subgraph run sync:networks

# generate + build for local indexing
NETWORK=anvil npm --prefix apps/subgraph run build
```

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

## Documentation

- In-app wiki (web app):
  - `/docs` — Searchable docs hub with role filters and start-here paths.
  - `/docs/overview`
  - `/docs/investor`
  - `/docs/operator`
  - `/docs/perp-risk-math`
  - `/docs/operator-interactions`
  - `/docs/oracle-price-sync`
  - `/docs/pool-management`
  - `/docs/contracts-reference`
  - `/docs/troubleshooting`
  - `/docs/security-risk`
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
- [docs/README.md](docs/README.md) — Maintainer-facing docs map mirroring in-app wiki IA and canonical markdown sources.
- Basket trade flows in the web app include icon-based Deposit/Redeem tabs, a stable quote area, and inline transaction feedback so users can verify what will happen before they submit.

For a local report, run `forge coverage` (use `--ir-minimum` if the compiler reports stack-too-deep). CI uploads LCOV to [Codecov](https://codecov.io/gh/reubenr0d/indexflow-prototype) for the badge above.
