# Share price math and operator runbook

This document explains the exact share pricing path in `BasketVault`, how to dry-run oracle update scripts safely, how admins update positions, and what happens when users withdraw after profitable trading.

For broader architecture and feed lifecycle docs, see [README.md](../README.md), [PRICE_FEED_FLOW.md](PRICE_FEED_FLOW.md), and [ASSET_MANAGER_FLOW.md](ASSET_MANAGER_FLOW.md).

## 1) Share price calculation (current contracts)

Source: `src/vault/BasketVault.sol`.

### Core definitions

- `idleUsdc = usdc.balanceOf(vault) - collectedFees` (floored at 0)
- `baseValue = idleUsdc + perpAllocated`
- `pricingNav = baseValue + realisedPnL + unrealisedPnL` from `vaultAccounting.getVaultPnL(vault)` (floored at 0)
- `PRICE_PRECISION = 1e30`

If `vaultAccounting` is not set, `pricingNav = baseValue`.

### `getSharePrice()`

- If `totalSupply == 0`: returns `PRICE_PRECISION` (1.0 USDC/share baseline)
- Else:
  - `sharePrice = pricingNav * PRICE_PRECISION / totalSupply`

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

Liquidity guard:

- `availableUsdc = usdc.balanceOf(vault) - collectedFees`
- Redemption requires `usdcReturned <= availableUsdc`

Meaning: even if NAV is high from profitable perp PnL, the vault still needs idle USDC on hand to pay redemptions.

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
