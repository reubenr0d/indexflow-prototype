# Asset manager flow: basket and perp operations

This document is the operator runbook for basket/perp management in the current implementation. It focuses on **BasketVault / BasketFactory / VaultAccounting** and how manager actions affect investor liquidity.

For oracle and feed syncing operations, see [PRICE_FEED_FLOW.md](PRICE_FEED_FLOW.md).

## Roles and permissions

- **Investor** — Can `deposit` and `redeem` basket shares. Cannot move capital between basket and perp.
- **Basket owner (`BasketVault` owner)** — Controls basket config and capital allocation bridge:
  `setAssets`, `setFees`, `setVaultAccounting`, `setOracleAdapter`, `setMaxPerpAllocation`, `setMinReserveBps`, `allocateToPerp`, `withdrawFromPerp`, `collectFees`.
- **VaultAccounting owner** — Controls registration, risk, and mapping:
  `registerVault`, `deregisterVault`, `mapAssetToken`, `setMaxOpenInterest`, `setMaxPositionSize`, `setPaused`.
- **Position caller on VaultAccounting** — `openPosition` / `closePosition` are restricted to `msg.sender == vault` or `msg.sender == owner()`.

## End-to-end manager sequence (external calls with internal subcalls)

### 1) Basket setup and wiring

1. `BasketFactory.createBasket(name, assetIds, weightsBps, depositFeeBps, redeemFeeBps)` (optional factory path)
   - Internal: deploys `BasketVault`.
   - Internal: calls `basket.setAssets(...)`, `basket.setFees(...)`.
   - Internal: if factory `vaultAccounting` is set, calls `basket.setVaultAccounting(vaultAccounting)`.
   - Internal: transfers basket ownership to creator.

2. `Basket owner -> BasketVault.setVaultAccounting(vaultAccounting)`
   - Internal: sets perp bridge address used by `allocateToPerp` / `withdrawFromPerp`.

3. `VaultAccounting owner -> VaultAccounting.registerVault(basketVault)`
   - Internal: initializes vault state (`depositedCapital`, `realisedPnL`, `openInterest`, `collateralLocked`, `positionCount`, `registered`).

4. `VaultAccounting owner -> VaultAccounting.mapAssetToken(assetId, gmxIndexToken)`
   - Internal: sets `assetTokens[assetId]` used by `openPosition`.

5. Optional risk wiring by VaultAccounting owner:
   - `setMaxOpenInterest(basketVault, cap)`
   - `setMaxPositionSize(basketVault, cap)`
   - `setPaused(true/false)`

### 2) Capital lifecycle

1. `Basket owner -> BasketVault.allocateToPerp(amount)`
   - Internal: checks `vaultAccounting` is set.
   - Internal: checks reserve-aware headroom via `getAvailableForPerpUsdc()`.
   - Internal: enforces optional `maxPerpAllocation`.
   - Internal: approves VA and calls `VaultAccounting.depositCapital(basketVault, amount)`.
   - Internal (VA): transfers USDC from basket into VA, increments `depositedCapital`.
   - Internal (Basket): increments `perpAllocated`.

2. `Basket owner -> BasketVault.withdrawFromPerp(amount)`
   - Internal: checks `amount <= perpAllocated`.
   - Internal: calls `VaultAccounting.withdrawCapital(basketVault, amount)`.
   - Internal (VA): checks available capital and transfers USDC back to basket.
   - Internal (Basket): decrements `perpAllocated`.

### 3) Position lifecycle and PnL realization

1. `Authorized caller -> VaultAccounting.openPosition(vault, asset, isLong, size, collateral)`
   - Internal: `_checkCaller(vault)`, `onlyRegisteredVault`, `whenNotPaused`.
   - Internal: resolves `indexToken = assetTokens[asset]` and validates mapping.
   - Internal: checks collateral against `_availableCapital(vault)`.
   - Internal: enforces `maxOpenInterest` / `maxPositionSize` if configured.
   - Internal: transfers collateral to GMX vault and calls `gmxVault.increasePosition(...)`.
   - Internal: reads GMX position and updates local tracking/open keys.

2. `Authorized caller -> VaultAccounting.closePosition(vault, asset, isLong, sizeDelta, collateralDelta)`
   - Internal: `_checkCaller(vault)` and tracked-position checks.
   - Internal: calls `gmxVault.decreasePosition(..., receiver=address(this))`.
   - Internal: computes USDC returned and collateral at risk.
   - Internal: updates open interest / collateral lock / position list.
   - Internal: updates `realisedPnL` on the vault state.

## Investor liquidity constraints

- Investor redemptions draw from **idle USDC held in BasketVault**, minus reserved fees (`collectedFees`).
- Capital allocated via `allocateToPerp` is **not directly withdrawable by investors**.
- Only basket owner can move funds back from perp path (`withdrawFromPerp`) to increase redeemable on-hand liquidity.
- Redeem pricing still uses basket oracle composition (`getBasketPrice`), not full mark-to-market perp NAV.

## Other basket manager functions

### BasketVault controls

- `setAssets(assetIds, weightsBps)` — Set basket composition; assets must be active in oracle; weights sum to `10000`.
- `setFees(depositFeeBps, redeemFeeBps)` — Set mint/redeem fees (max 500 bps each).
- `setOracleAdapter(oracleAdapter)` — Repoint basket pricing source.
- `setVaultAccounting(vaultAccounting)` — Wire perp bridge target.
- `setMaxPerpAllocation(cap)` — Cap total `perpAllocated` (0 = no cap).
- `setMinReserveBps(bps)` — Reserve target that gates `allocateToPerp`.
- `collectFees(to)` — Withdraw accumulated fees in `collectedFees`.

### Reserve operation

- `topUpReserve(amount)` (permissionless) — Anyone may transfer USDC to basket without minting shares (non-dilutive reserve top-up).

### BasketFactory controls

- `setVaultAccounting(vaultAccounting)` — Default VA for newly created baskets.
- `setOracleAdapter(oracleAdapter)` — Default oracle adapter for newly created baskets.
- `createBasket(...)` — Deploy/configure basket, optional VA wiring, transfer ownership to creator.

## Operational caveats (current implementation)

- `VaultAccounting.withdrawCapital` checks available capital with:
  `available = depositedCapital + realisedPnL - collateralLocked` (floored at zero).
- `withdrawCapital` then debits `depositedCapital` directly (`uint256`) when sending funds out.
  This is an implementation detail to be aware of when realised PnL is positive, because accounting availability and debit semantics are not identical concepts.
- `deregisterVault` requires zero open interest.
