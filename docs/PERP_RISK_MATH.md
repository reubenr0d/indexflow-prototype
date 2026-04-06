# Perp risk math for operators

This guide explains leverage, sizing, units, and liquidation caveats for position management through `VaultAccounting`.

## Core formulas (approximate)

- Effective leverage: `leverage ≈ size / collateral`
- PnL from move: `pnl ≈ size * priceMovePercent`
- Return on collateral: `return ≈ leverage * priceMovePercent`

These are planning formulas. Realized outcomes differ due to fees, funding, and execution conditions.

## Units glossary

- **USDC atoms**: `1 USDC = 1e6` base units.
- **size**: notional exposure, not cash paid.
- **collateral**: USDC margin posted for the position leg.
- **GMX USD precision**: many GMX-side USD values are represented with `PRICE_PRECISION = 1e30`; normalize before comparing values from different contexts. In the web UI, notional metrics (open interest, per-asset net/long/short, and position-size fields) are rendered as normalized full-dollar USD values.

## Worked 5x example

Inputs:

- `size = 10,000`
- `collateral = 2,000`
- Effective leverage `≈ 5x`

Approx outcomes:

- **Long +10%** -> `+1,000` pnl -> `+50%` on collateral
- **Long -10%** -> `-1,000` pnl -> `-50%` on collateral
- **Short** is direction-reversed:
  - price `-10%` -> `+50%`
  - price `+10%` -> `-50%`

## Liquidation caveats

The "~20% adverse move at 5x" heuristic is not an exact threshold.

In this stack, liquidation readiness depends on GMX validation logic including:

- loss relative to remaining collateral,
- margin fees and liquidation fee burden,
- leverage constraints.

Result: liquidation can happen earlier than the clean heuristic during live trading conditions.

## Operator preflight

1. Confirm vault registration, asset mapping, and pause state.
2. Confirm available capital and cap headroom (`maxOpenInterest`, `maxPositionSize`).
3. Compute leverage and downside estimate using intended `size`/`collateral`.
4. Confirm reserve posture before increasing risk.

## Operator postflight

1. Verify tracking for `(vault, asset, side)` reflects intended state.
2. Verify expected deltas in `openInterest` and `collateralLocked`.
3. Record tx hash, sizing rationale, and intended reduction trigger.
4. Monitor for fast adverse moves and reduce exposure before threshold stress.

## Related docs

- [ASSET_MANAGER_FLOW.md](./ASSET_MANAGER_FLOW.md)
- [SHARE_PRICE_AND_OPERATIONS.md](./SHARE_PRICE_AND_OPERATIONS.md)
- [OPERATOR_INTERACTIONS.md](./OPERATOR_INTERACTIONS.md)
