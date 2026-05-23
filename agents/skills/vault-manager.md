# Vault Manager Skill

Your capabilities for managing on-chain basket vaults with perpetual hedging.

## Tools

### Read Tools

| Tool | Purpose | Key params |
|------|---------|------------|
| `get_all_vaults` | List vault addresses and names | -- |
| `get_all_vault_states` | Full snapshot of every vault (batch) | -- |
| `get_vault_state` | Detailed single vault state | `vault` |
| `get_vault_pnl` | Unrealised/realised PnL | `vault` |
| `get_oracle_assets` | All oracle assets with prices | -- |
| `get_position_tracking` | Single position details | `vault`, `assetId`, `isLong` |
| `list_open_positions` | All open legs for a vault (with per-leg unrealised PnL + `pnlBandOutcome`) | `vault` |
| `get_perp_capital_snapshot` | Vault accounting + `availableCollateral` + full open-position roster — call before any open | `vault` |
| `plan_open_position` | **Safe sizing helper.** Converts target leverage + free collateral into the exact raw `size`/`collateral` to pass into `open_position`. Enforces $10 min collateral and 50x cap. Pass `convictionWeight` + `totalConvictionWeight` to size proportionally to your pick's score (typically `(score - entryScoreMin) / (100 - entryScoreMin)`); omit both for the equal-weight default. Also consults the churn-guard (`agents/memory/shared/recently-closed.<vault>.json`) and returns `error_code: "CHURN_GUARD_COOLDOWN"` when the same `(vault, assetId)` was closed in the last 4h; pass `bypassChurnGuard: true` + `bypassReason: "..."` to override (the reason is persisted in the next open's metadata). | `vault`, `assetId`, `isLong`, `targetLeverage?`, `numNewSlots?`, `maxCollateralUsdcRaw?`, `convictionWeight?`, `totalConvictionWeight?`, `bypassChurnGuard?`, `bypassReason?` |

### Write Tools

All write tools return `{success, transactionHash, next_steps}` with structured error recovery hints on failure.

| Tool | Purpose | Key params |
|------|---------|------------|
| `wire_asset` | Register new tradeable asset | `symbol`, `seedPriceUsd` |
| `create_vault` | Deploy new basket vault | `name`, `depositFeeBps`, `redeemFeeBps` |
| `set_vault_assets` | Set vault's tracked assets (rejects unknown / malformed bytes32 ids locally with `INVALID_ASSET_ID` before broadcasting) | `vault`, `assetIds[]` |
| `allocate_to_perp` | Move USDC to perp module | `vault`, `amount` (raw USDC) |
| `withdraw_from_perp` | Pull USDC back to vault | `vault`, `amount` (raw USDC) |
| `open_position` | Open/increase perp position | `vault`, `assetId`, `isLong`, `size`, `collateral` |
| `close_position` | Reduce/close perp position | `vault`, `assetId`, `isLong`, `sizeDelta`, `collateralDelta` |

## Units Cheat Sheet

| Concept | Raw value | Human example |
|---------|-----------|---------------|
| 1 USDC | `1000000` | 6 decimals |
| $10,000 position size | `10000000000000000000000000000000000` | 1e30 per $1 |
| 0.5% fee | `50` bps | 100 bps = 1% |
| Asset ID | `keccak256("BHP.AX")` | `cast keccak "BHP.AX"` to compute |

Tool responses include `_usdc`, `_usd`, and `_pct` companion fields with human-readable conversions.
For equities, prefer exchange-suffixed Yahoo symbols (`BHP.AX`, `RIO.AX`, `BHP.L`) to avoid cross-exchange ambiguity.

### Safe perp sizing

`open_position` takes raw GMX-USD `size` (1e30 per $1) and raw USDC `collateral` (6 decimals), and the on-chain GMX vault enforces two hard caps that revert the tx if violated:

- **`Vault: maxLeverage exceeded`** when `size / (collateral * 1e24) > 50`.
- **`Vault: liquidation fees exceed collateral`** when remaining collateral (after the opening margin fee) drops below the `$5` `liquidationFeeUsd` buffer.

Don't hand-roll the 1e30 math. Instead, for every new open:

1. `get_perp_capital_snapshot({ vault })` — read `accounting.availableCollateral` and the open-position roster.
2. `plan_open_position({ vault, assetId, isLong, targetLeverage: 10, numNewSlots: <count> })` — returns the exact raw `size` and `collateral` strings.
3. `open_position({ vault, assetId, isLong, size, collateral, justification })` — pass the helper's strings verbatim.

If `plan_open_position` returns `error_code: "INSUFFICIENT_FREE_COLLATERAL_FOR_LIQ_FEE_BUFFER"`, close a leg from the embedded `openPositions` roster (worst `unrealisedPnlPctOfCollateral`, or any `above_take_profit` / `below_stop_loss`) and retry.

If `plan_open_position` returns `error_code: "CHURN_GUARD_COOLDOWN"`, the runner closed this exact `(vault, assetId)` inside the cooldown window (the `lastClose` field tells you the reason — `rank_swap`, `pnl_band:above_take_profit`, `pnl_band:below_stop_loss`, or `llm_judged: ...`). Skip the ticker for the rest of the run unless your fresh signal genuinely contradicts the closure. To override, call `plan_open_position` again with `bypassChurnGuard: true` AND `bypassReason: "<short audit string>"`; the bypass + reason are persisted alongside the next open in agent metadata.

## Workflows

### Discover and wire a new asset

1. Search for the asset by name or ticker
2. Get a live USD price quote for the ticker
3. `wire_asset({ symbol: "<TICKER>", seedPriceUsd: <price> })` — register on-chain
4. `get_oracle_assets()` — verify it appears with `active: true`
5. `set_vault_assets({ vault: "<vault>", assetIds: [...existing, ...new] })` — add to your vault

### Routine position management

1. `get_vault_state({ vault: "<vault>" })` — check current state
2. Get live market prices for tracked assets
3. Compare market prices vs on-chain oracle prices from vault state
4. Decide whether to close, open, or adjust positions
5. Execute via `close_position`, `open_position`, `allocate_to_perp`, `withdraw_from_perp`
6. `get_vault_state({ vault: "<vault>" })` — verify final state

### Long vs short legs

Every perp position is keyed by `(vault, assetId, isLong)`, so a long and a short on the **same** asset are independent positions:

- `get_position_tracking` returns one position per `isLong` value. To get the full picture for an asset you call it twice (`isLong: true` and `isLong: false`); `list_open_positions` already does this for every tracked asset.
- `open_position({ ..., isLong: false })` opens a short. Increasing an existing short uses the same call with the same `isLong: false`.
- `close_position` requires the same `isLong` as the leg being closed; you cannot net a long against a short with one call.
- Whether the agent is *allowed* to open shorts is a policy concern, controlled by the `entryDirection` (`long_only` / `short_only` / `long_short`) and `maxNewShortsPerRun` frontmatter fields enforced by the runner — see `docs/AGENTS_FRAMEWORK.md`. The MCP tools themselves accept either direction.

### Vault deployment

1. `create_vault({ name: "<name>", depositFeeBps: <fee>, redeemFeeBps: <fee> })`
2. `get_all_vaults()` — find the new vault address
3. Proceed with normal workflow using the new address

## Response Format

Success:
```json
{"success": true, "transactionHash": "0x...", "next_steps": "..."}
```

Error:
```json
{"success": false, "error": "Description", "next_steps": "How to recover"}
```
