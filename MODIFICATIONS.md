# Modifications vs Upstream GMX v1

This document tracks all changes made to the forked GMX v1 contracts and the new contracts built on top.

## Source

**Upstream:** [gmx-io/gmx-contracts](https://github.com/gmx-io/gmx-contracts) (master branch)
**Solidity version:** GMX contracts remain at 0.6.12; new contracts use ^0.8.24

---

## GMX Contracts Kept (`src/gmx/`)

### Core (`src/gmx/core/`)

| Contract | Status | Notes |
|---|---|---|
| `Vault.sol` | **Modified** | Core position logic. `_validateTokens` relaxed to allow stable-collateral longs (USDC collateral for any index token). |
| `VaultUtils.sol` | Kept | Fee calculations and validation. |
| `SimplePriceFeed.sol` | **New** | Minimal `IVaultPriceFeed` implementation storing per-token prices, set by gov/keeper. Bridges OracleAdapter to GMX Vault. |
| `VaultPriceFeed.sol` | Kept as reference | Replaced by `SimplePriceFeed.sol` for production use. |
| `ShortsTracker.sol` | Kept | Global short tracking, mostly unchanged. |
| `Router.sol` | Kept | Trade entry point. |
| `BasePositionManager.sol` | Kept | Position management base. |
| `VaultErrorController.sol` | Kept | Error code management. |
| `PositionUtils.sol` | Kept | Position utility functions. |

### Oracle (`src/gmx/oracle/`)

| Contract | Status | Notes |
|---|---|---|
| `FastPriceFeed.sol` | Kept as reference | Replaced by `OracleAdapter.sol` for production. |
| `FastPriceEvents.sol` | Kept | Event definitions. |

### Libraries (`src/gmx/libraries/`)

All math, token, and utility libraries kept unchanged for GMX contract compatibility.

### Access (`src/gmx/access/`)

| Contract | Status | Notes |
|---|---|---|
| `Governable.sol` | Kept | Used by GMX contracts internally. |

### Tokens (`src/gmx/tokens/`)

| Contract | Status | Notes |
|---|---|---|
| `USDG.sol` | Kept | Internal accounting token used by GMX Vault. |
| `BaseToken.sol` | Kept | Base token implementation. |
| `MintableBaseToken.sol` | Kept | Dependency. |
| `YieldToken.sol` | Kept | Dependency. |

---

## GMX Contracts Stripped

| Module | Why |
|---|---|
| `contracts/staking/` | No staking/rewards needed |
| `contracts/gmx/` | No GMX governance token |
| GLP token + `GlpManager.sol` | No public LP; liquidity comes from BasketVaults |
| `OrderBook.sol` | No orderbook (constraint) |
| `PositionRouter.sol` | Async keeper execution unnecessary; direct calls |
| Referral system | Not needed |
| Vesting contracts | Not needed |
| Governance Timelock | Simplified to Ownable |

---

## New Contracts Built

### Basket Vault System (`src/vault/`)

| Contract | Purpose |
|---|---|
| `BasketVault.sol` | GLP-style basket vault: deposit USDC, mint shares priced by weighted oracle prices. Continuous deposit/redeem. |
| `BasketShareToken.sol` | ERC20 vault shares (6 decimals, vault-only mint/burn). |
| `BasketFactory.sol` | Deploys new BasketVault instances with asset configurations. |
| `MockUSDC.sol` | Test token. |

**Key design:** Basket price = `sum(weight_i * OracleAdapter.getPrice(asset_i)) / 10000`. No NAV/DCF logic.

### Perp Infrastructure (`src/perp/`)

| Contract | Purpose |
|---|---|
| `OracleAdapter.sol` | Unified oracle for equities + commodities. Supports Chainlink feeds and custom keeper-relayed prices with staleness checks and deviation circuit breakers. |
| `PricingEngine.sol` | Enforces `executionPrice = oraclePrice + deterministic slippage`. Size-based, proportional to trade/liquidity ratio. |
| `VaultAccounting.sol` | Bridge between BasketVault and GMX Vault. Per-vault capital tracking, PnL attribution, position management. |
| `FundingRateManager.sol` | Adapts GMX funding rates for oracle-anchored, long/short imbalance-based rates. |
| `PerpReader.sol` | Read-only aggregator for positions, vault PnL, pool utilization, oracle prices, basket state. |

### Interfaces (`src/perp/interfaces/`)

| Interface | Purpose |
|---|---|
| `IGMXVault.sol` | 0.8.24 interface mirroring GMX Vault.sol for cross-version calls. |
| `IOracleAdapter.sol` | Oracle interface used by both basket and perp layers. |
| `IPerp.sol` | Interface for BasketVault to interact with perp infrastructure. |

---

## Cross-Version Architecture

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│    Solidity ^0.8.24         │     │    Solidity 0.6.12          │
│                             │     │                             │
│  BasketVault                │     │  GMX Vault.sol              │
│  BasketShareToken           │     │  VaultUtils.sol             │
│  BasketFactory              │     │  Router.sol                 │
│  OracleAdapter              │     │  ShortsTracker.sol          │
│  PricingEngine              │     │  BasePositionManager.sol    │
│  VaultAccounting ───────────┼──►──┼  (via IGMXVault interface)  │
│  FundingRateManager ────────┼──►──┼                             │
│  PerpReader                 │     │                             │
└─────────────────────────────┘     └─────────────────────────────┘
```

Foundry compiles each file with the Solidity version specified in its pragma. Cross-version calls work via ABI-compatible interfaces at the EVM level.

---

## Vault.sol Modification Detail

**`_validateTokens` (line ~1081):** The original GMX requires `_collateralToken == _indexToken` for long positions (i.e., you must collateralize a BTC long with BTC). This was relaxed to allow stablecoin-collateralized longs -- if `_collateralToken != _indexToken` on a long, the collateral must be a `stableToken` (USDC). This enables synthetic longs where the entire system uses USDC as the universal collateral token.

The accounting works correctly because:
- Position PnL is tracked via `getDelta()` using the index token price
- Collateral is tracked in USD terms regardless of token type
- Pool amounts, reserves, and `guaranteedUsd` are managed per collateral token (USDC)
- On close, profit is paid from the USDC pool; losses reduce position collateral

---

## Constraints

- No orderbook
- Max ~20-30 active markets (configurable in OracleAdapter)
- USDC as sole collateral/liquidity token
- No governance token, no staking, no public LP
- Manual position management initially
