# Share price math and operator runbook

This document explains the exact share pricing path in `BasketVault`, how to dry-run oracle update scripts safely, how admins update positions, and what happens when users withdraw after profitable trading.

For broader architecture and feed lifecycle docs, see [README.md](./README.md), [PRICE_FEED_FLOW.md](./PRICE_FEED_FLOW.md), and [ASSET_MANAGER_FLOW.md](./ASSET_MANAGER_FLOW.md).

## 1) Share price calculation (current contracts)

Source: `src/vault/BasketVault.sol`.

### Core definitions

- `idleUsdc = usdc.balanceOf(vault) - collectedFees` (floored at 0)
- `baseValue = idleUsdc + perpAllocated`
- `localPnL = realisedPnL + unrealisedPnL` from `vaultAccounting.getVaultPnL(vault)` (hub only; zero on spokes where `vaultAccounting` is not set)
- `globalAdj = stateRelay.getGlobalPnLAdjustment(vault)` — keeper-posted adjustment that propagates hub perp performance to spoke chains. Excluded if stale (past `maxStaleness`). Zero if `stateRelay` is not wired.
- `pricingNav = max(baseValue + localPnL + globalAdj, 0)`
- `PRICE_PRECISION = 1e30`

On spoke chains, `vaultAccounting` is `address(0)` so `localPnL = 0` and `perpAllocated = 0`. The effective formula simplifies to:

- **Spoke:** `_pricingNav() = idleUsdc + globalPnLAdjustment`
- **Hub:** `_pricingNav() = idleUsdc + perpAllocated + localPnL + globalPnLAdjustment`

The keeper posts the zero-sum complement so hub + spoke adjustments net out correctly across the protocol.

### Global NAV (keeper-computed)

The keeper service computes a protocol-wide NAV each epoch:

```
globalNav = sum(all chains' idle USDC) + hub perpAllocated + hub perp PnL
```

This is broken down per-chain as a `globalPnLAdjustment` posted to `StateRelay.updateState()` on every chain. Each spoke receives a share of the hub's perp PnL proportional to its idle USDC, so share prices stay consistent across all chains without requiring spoke chains to have any perp infrastructure.

### `getSharePrice()`

- If `totalSupply == 0`: returns `PRICE_PRECISION` (1.0 USDC/share baseline)
- Else:
  - `sharePrice = pricingNav * PRICE_PRECISION / totalSupply`

Because this formula is entirely on-chain and deterministic given chain state,
external auditors and fund administrators can verify NAV at any block by reading
contract state directly -- no off-chain calculation or manager-reported values
are required.

### Cross-chain share price consistency

Share price consistency across all chains relies on the keeper posting timely
`globalPnLAdjustment` values to `StateRelay` on every chain each epoch (default
60s). The adjustment propagates hub perp performance to spoke chains so that a
share minted on Fuji has the same NAV-based price as a share minted on Sepolia.

If the adjustment becomes stale (past `maxStaleness`), it is excluded from
`_pricingNav()` and the spoke share price reverts to idle-USDC-only until the
keeper refreshes it. Operators should monitor `StateRelay.lastUpdateTime` for
staleness alerts (see [KEEPER_OPERATIONS.md](./KEEPER_OPERATIONS.md)).

### `deposit(usdcAmount)` mint math

- `fee = usdcAmount * depositFeeBps / 10_000`
- `netAmount = usdcAmount - fee`
- If `totalSupply == 0`:
  - `sharesMinted = netAmount` (bootstrap 1:1 in 6-decimal USDC units)
- Else:
  - `sharesMinted = netAmount * totalSupply / navBefore`

Where `navBefore` is `pricingNav` read before the transfer/mint.

### `redeem(sharesToBurn)` payout math

- `gross = sharesToBurn * pricingNav / totalSupply`
- `fee = gross * redeemFeeBps / 10_000`
- `usdcReturned = gross - fee`

Liquidity guard and pending queue:

- `availableUsdc = usdc.balanceOf(vault) - collectedFees`
- If `availableUsdc >= usdcReturned`: full payout, shares burned immediately.
- If `availableUsdc < usdcReturned`: partial fill from available USDC, pro-rata shares burned, remainder queued as a `PendingRedemption`. The user's remaining shares are locked in the vault contract until a keeper bridges USDC (via `RedemptionReceiver` on spokes) and calls `processPendingRedemption(id)`.

This is especially relevant on spoke chains where all USDC may have been deployed to the hub for perp positions. The pending redemption queue replaces the previous hard revert on insufficient liquidity.

## 2) Admin position updates and accounting effects

Position operations run through `VaultAccounting` (`src/perp/VaultAccounting.sol`) and require a registered vault + mapped asset token.

### Open position

- `openPosition(vault, asset, isLong, size, collateral)`
- Effects:
  - Increases vault `openInterest`
  - Increases `collateralLocked`
  - Tracks/updates position key state

Admin UI input units (`/admin/baskets/[address]`):
- `Size` is USD notional (converted to onchain `1e30`).
- `Collateral` is USDC amount (onchain `1e6` token units).

### Close position

- `closePosition(vault, asset, isLong, sizeDelta, collateralDelta)`
- Effects:
  - Decreases `openInterest`
  - Realises signed PnL into `realisedPnL`
  - Updates/removes tracked position leg

### Capital withdrawal after profits

When profits are realised, `withdrawCapital` and `BasketVault.withdrawFromPerp` support pulling back more than original principal allocation:

- `available = depositedCapital + realisedPnL - collateralLocked` (floored at 0)
- Withdrawal debits principal first, then debits realised PnL bucket
- Basket side clamps `perpAllocated` to zero when withdrawal exceeds remaining principal allocation

So profit distributions can be returned to the basket and flow into NAV/share price.

## 3) User withdrawals with profits (example)

Example (simplified, no fees):

1. User deposits `100,000 USDC` and receives `100,000 shares`.
2. Admin allocates `50,000` to perp and trades.
3. Positions close with `+2,000 USDC` realised PnL.
4. Admin withdraws available capital back from accounting.
5. Vault NAV is now `102,000` against `100,000` shares.
6. Share price is ~`1.02` USDC/share.
7. User redeeming all shares receives ~`102,000 USDC` (subject to fee + idle-liquidity checks).

## 4) Dry-run oracle update workflows

Use Foundry scripts **without `--broadcast`** for dry-run simulation.

### Dry-run: submit + sync

```bash
forge script script/SubmitAndSyncOraclePrices.s.sol:SubmitAndSyncOraclePrices \
  --rpc-url local -vvv
```

### Dry-run: sync only

```bash
forge script script/SyncAllOraclePrices.s.sol:SyncAllOraclePrices \
  --rpc-url local -vvv
```

### Dry-run: Yahoo Finance price relayer (all CustomRelayer assets)

```bash
npm run update-prices:sepolia:dry
```

This enumerates on-chain assets, fetches Yahoo Finance quotes, and prints prices without broadcasting transactions.

These simulate transactions and print traces without writing state.

### Execute for real

Add `--broadcast`:

```bash
forge script script/SubmitAndSyncOraclePrices.s.sol:SubmitAndSyncOraclePrices \
  --rpc-url local --broadcast -vvv

forge script script/SyncAllOraclePrices.s.sol:SyncAllOraclePrices \
  --rpc-url local --broadcast -vvv

PRIVATE_KEY=0x... npm run update-prices:sepolia
```

## 5) Practical operator checklist

1. Confirm vault is registered and assets are mapped in `VaultAccounting`.
2. Dry-run oracle submit/sync script first (no `--broadcast`).
3. Execute broadcast submit/sync.
4. Open/close positions as needed.
5. Withdraw available capital/profits back to basket.
6. Verify:
   - `getSharePrice()` moved as expected
   - basket idle USDC is sufficient for redemptions
   - investor `Vault History` on `/baskets/[address]` reflects new activity.
