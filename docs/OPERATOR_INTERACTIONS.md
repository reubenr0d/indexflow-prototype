# Operator interaction matrix

This page is the canonical markdown source for the in-app `/docs/operator-interactions` runbook.

## BasketVault interactions

### `allocateToPerp(amount)`

- Caller: basket owner
- Inputs + units:
  - `amount` (USDC atoms, `1e6`)
- Preconditions:
  - `vaultAccounting` configured
  - reserve-aware headroom available
  - optional `maxPerpAllocation` not exceeded
- Expected state deltas:
  - basket `perpAllocated` increases
  - `VaultAccounting.depositedCapital` increases through `depositCapital`
- Common failure risks:
  - reserve/cap checks fail
  - paused or transfer/allowance path issues
- Post-tx checks:
  - `perpAllocated` updated as intended
  - idle reserve remains healthy for redemption demand

### `withdrawFromPerp(amount)`

- Caller: basket owner
- Inputs + units:
  - `amount` (USDC atoms, `1e6`)
- Preconditions:
  - `vaultAccounting` configured
  - available capital on perp side supports withdrawal
- Expected state deltas:
  - USDC returns to basket
  - `perpAllocated` decreases (clamped at zero if withdrawal exceeds remaining principal bucket)
- Common failure risks:
  - insufficient available capital due to locked collateral
- Post-tx checks:
  - idle basket USDC increased
  - redemption headroom improved

## VaultAccounting interactions

### `openPosition(vault, asset, isLong, size, collateral)`

- Caller: authorized position path
- Inputs + units:
  - `vault` (address)
  - `asset` (bytes32)
  - `isLong` (bool)
  - `size` (notional exposure)
  - `collateral` (USDC atoms)
- Preconditions:
  - vault registered and not paused
  - asset mapped to index token
  - collateral <= available capital
  - cap headroom for `maxOpenInterest` and `maxPositionSize`
- Expected state deltas:
  - GMX `increasePosition` is executed from VaultAccounting account
  - `openInterest` increases
  - `collateralLocked` increases
  - position tracking key created or updated
- Common failure risks:
  - authorization/mapping/pause failures
  - insufficient capital for collateral
  - cap exceeded
- Post-tx checks:
  - position tracking reflects intended side and size
  - accounting deltas match expected notional and collateral
  - effective leverage aligns with risk budget

### `closePosition(vault, asset, isLong, sizeDelta, collateralDelta)`

- Caller: authorized position path
- Inputs + units:
  - `sizeDelta` (notional reduction)
  - `collateralDelta` (GMX collateral withdrawal parameter)
- Preconditions:
  - tracked position exists for `(vault, asset, side)`
  - vault registered and not paused
- Expected state deltas:
  - GMX `decreasePosition` is executed from VaultAccounting account
  - `openInterest` decreases by `sizeDelta`
  - tracking is reduced or removed
  - `realisedPnL` updates from returned USDC minus collateral-at-risk estimate
- Common failure risks:
  - position missing
  - invalid delta settings
  - poor execution conditions reducing expected return
- Post-tx checks:
  - realised PnL sign and magnitude are reasonable
  - remaining tracking state is internally consistent
  - available capital updated for subsequent allocation/withdrawal plans

### `setMaxOpenInterest`, `setMaxPositionSize`, `setPaused`

- Caller: VaultAccounting owner
- Inputs + units:
  - cap values in notional units
  - pause flag boolean
- Preconditions:
  - owner authority
- Expected state deltas:
  - vault risk envelope and write availability change
- Common failure risks:
  - unauthorized caller
  - policy changes applied without operator communication
- Post-tx checks:
  - admin reads reflect new limits
  - runbooks and operating limits are updated

## GMX-facing effect notes

Operators usually call BasketVault or VaultAccounting, not GMX core directly in this workflow.

- `openPosition` forwards to GMX `increasePosition`.
- `closePosition` forwards to GMX `decreasePosition` and updates realised accounting.
- Liquidation conditions remain determined by GMX validation logic (loss/collateral, fees, leverage constraints).

## Quick remediation map

- Authorization revert -> verify wallet role and contract ownership.
- Mapping/precondition revert -> verify vault registration, pause state, and asset mapping.
- Capital/cap revert -> reduce request size or free capital first.
- Unexpected PnL output -> verify price sync freshness, fees/funding context, and execution timing.

## Related docs

- [ASSET_MANAGER_FLOW.md](./ASSET_MANAGER_FLOW.md)
- [PERP_RISK_MATH.md](./PERP_RISK_MATH.md)
- [SHARE_PRICE_AND_OPERATIONS.md](./SHARE_PRICE_AND_OPERATIONS.md)
