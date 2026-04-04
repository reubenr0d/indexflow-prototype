# Perp Infrastructure (GMX v1 Fork)

Oracle-priced basket vaults backed by a shared perpetual liquidity pool, built on a GMX v1 fork.

## Architecture

```
Investor ──deposit USDC──► BasketVault ──allocate──► VaultAccounting ──► GMX Vault Pool
                │                                        │
          mint shares                              position PnL
          (oracle-priced)                          (tracked per vault)
```

### Basket Layer (`src/vault/`)

- **BasketVault** -- GLP-style vault: deposit USDC, receive shares priced by weighted oracle prices
- **BasketShareToken** -- ERC20 shares (6 decimals)
- **BasketFactory** -- Deploy new baskets with asset weight configurations

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
- **Target chain** -- Arbitrum

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
ARBITRUM_RPC_URL=
ARBITRUM_SEPOLIA_RPC_URL=
ARBISCAN_API_KEY=
```

## Operations

The GMX vault reads prices from **SimplePriceFeed**, not from **OracleAdapter** directly. After deploy, wire **PriceSync** as a keeper on `SimplePriceFeed` (`setKeeper(address(priceSync), true)`) and add **PriceSync** mappings (`addMapping(assetId, gmxToken)`) for each asset the pool trades.

**Keeping perp prices aligned with the oracle**

- **Chainlink-backed assets** — `OracleAdapter.getPrice` reads the feed when called. Push that value into the vault feed by calling **`PriceSync.syncAll()`** or **`PriceSync.syncPrices(assetIds)`** on whatever cadence you need (anyone can send these txs).
- **Custom relayer assets** — A keeper must call **`OracleAdapter.submitPrice`** / **`submitPrices`** first (requires `setKeeper` on the adapter), then run **`PriceSync.sync*`** as above.

Basket and other layers that call `OracleAdapter` in views see fresh Chainlink data on read; the perp path only updates on-chain when **PriceSync** runs.

**Funding** — Keepers authorized on **FundingRateManager** call **`updateFundingRate`** so the GMX vault’s funding parameters stay in line with your policy (often on a schedule tied to `fundingInterval`).

Automation (e.g. cron, Gelato, Chainlink Automation) is optional: it only replaces manually sending the same transactions.

## Documentation

- [MODIFICATIONS.md](MODIFICATIONS.md) — Detailed changes vs upstream GMX.
- [docs/INVESTOR_FLOW.md](docs/INVESTOR_FLOW.md) — Basket share holder journey, mint/redeem vs NAV, perp allocation, and what investors do not control.

### NatSpec / documentation coverage (first-party 0.8.x)

**Full** means contract-level `@title` / `@notice` / `@dev` where needed, and NatSpec on external/public functions (plus structs, errors, and interfaces per the integration surface). When you add or materially change a listed contract’s API, update this row and the in-source NatSpec in the same change.

| Module | Contract | Path | NatSpec |
|--------|-----------|------|---------|
| perp | VaultAccounting | [src/perp/VaultAccounting.sol](src/perp/VaultAccounting.sol) | Full |
| perp | PerpReader | [src/perp/PerpReader.sol](src/perp/PerpReader.sol) | Full |
| perp | OracleAdapter | [src/perp/OracleAdapter.sol](src/perp/OracleAdapter.sol) | Full |
| perp | PriceSync | [src/perp/PriceSync.sol](src/perp/PriceSync.sol) | Full |
| perp | PricingEngine | [src/perp/PricingEngine.sol](src/perp/PricingEngine.sol) | Full |
| perp | FundingRateManager | [src/perp/FundingRateManager.sol](src/perp/FundingRateManager.sol) | Full |
| perp | IPerp | [src/perp/interfaces/IPerp.sol](src/perp/interfaces/IPerp.sol) | Full |
| perp | IOracleAdapter | [src/perp/interfaces/IOracleAdapter.sol](src/perp/interfaces/IOracleAdapter.sol) | Full |
| perp | IGMXVault | [src/perp/interfaces/IGMXVault.sol](src/perp/interfaces/IGMXVault.sol) | Full |
| vault | BasketVault | [src/vault/BasketVault.sol](src/vault/BasketVault.sol) | Full |
| vault | BasketFactory | [src/vault/BasketFactory.sol](src/vault/BasketFactory.sol) | Full |
| vault | BasketShareToken | [src/vault/BasketShareToken.sol](src/vault/BasketShareToken.sol) | Full |
| vault | MockUSDC | [src/vault/MockUSDC.sol](src/vault/MockUSDC.sol) | Full |

Test-only and vendored code (`src/gmx/`, `lib/`) are out of scope for this table. For **line** test coverage, run `forge coverage` locally.
