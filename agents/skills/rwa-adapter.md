# RWA Reserve Adapter Skill

Operating manual for the IndexFlow multi-asset `RWAReserveAdapter` on Mantle. Shared by `rwa-treasurer`, `meth-carry-manager`, and `rwa-yield-router`.

## What the adapter is

`RWAReserveAdapter` is a per-vault contract that holds exactly one reserve token at a time — `USDY` (Ondo treasury notes), `MUSD` (Ondo rebasing $1-pegged), or `METH` (Mantle restaked-ETH). Subscribe/redeem routes through the configured primitive; `setReserveToken` atomically redeems the current reserve, switches the token, and resubscribes the freed USDC.

The adapter exposes `getReserveValueUsdc()` which is sourced from the existing IndexFlow `OracleAdapter` (CustomRelayer-fed by the keeper from real off-chain prices — Ondo's `RWADynamicOracle` for USDY and Mantle's mETH state for mETH). mUSD is valued 1:1 with USDC because it is $1-pegged by design.

## Who calls what

Only the **vault** is authorised to call `deposit`, `withdraw`, and `setReserveToken` on the adapter — direct calls from your keeper key will revert with `Only vault`. Always route through the `BasketVault` wrappers:

- `BasketVault.allocateToRWA(uint256)` → adapter.deposit
- `BasketVault.withdrawFromRWA(uint256)` → adapter.withdraw
- `BasketVault.rotateReserveToken(uint8)` → adapter.setReserveToken
- `BasketVault.harvestRWAYield()` → emits a `RWAYieldHarvested` event for the indexer; permissionless

The `rwa-adapter-mcp` server invokes the vault wrappers for you; the tool names mirror the vault selectors (`allocate_to_rwa`, `withdraw_from_rwa`, etc.).

## Tool ordering inside a single run

Every write must be preceded by a simulate call so the runner's risk-officer pass sees the projected post-state in the justification:

1. `get_reserve_state({ vault })` — confirms which token is configured + current reserve bps.
2. `get_pending_redemptions({ vault })` — sizes the safety margin. Returns `available: false` until the on-chain hook ships; treat that as 0 pending.
3. `simulate_allocate_to_rwa` / `simulate_withdraw_from_rwa` / `simulate_set_reserve_token` — required before any write. Read `redemptionMarginAfterIsPositive: true` before proceeding.
4. The matching write tool with a `justification` that quotes the pre and post bps + the margin you protected.

## Agent boundaries (don't cross these)

- `rwa-treasurer` may **only** call `allocate_to_rwa`, `withdraw_from_rwa`, `harvest_rwa_yield`. It must NEVER call `set_reserve_token` — token rotation is `rwa-yield-router`'s job exclusively.
- `rwa-yield-router` may **only** call `set_reserve_token` and `rebalance_reserve`. It must NEVER call `allocate_to_rwa` / `withdraw_from_rwa` — bps targeting stays with the treasurer.
- `meth-carry-manager` may call `allocate_to_rwa` / `withdraw_from_rwa` to size the mETH long leg, but only against vaults where the configured reserve is `METH`. If `get_reserve_state` reports `reserveTokenName != "METH"`, surface a `## Anomaly` note and stop.

Crossing these boundaries causes silent double-management: two agents grabbing the same idle USDC across consecutive ticks. The boundary is enforced by the per-agent `writeTools` allowlist in each frontmatter; the runner's risk-officer drops any tool call not on the agent's allowlist.

## Decimals and units

- USDC: 6 decimals. All `usdcAmount` parameters and all simulate inputs are **raw USDC strings** (e.g. `"1000000000"` = $1000).
- USDY / mUSD / mETH: 18 decimals. The adapter handles 6↔18 scaling internally; the agent never touches reserve-token amounts directly.
- Bps: 1 bp = 1/10_000. Target bands in agent frontmatter (e.g. `rwaTargetBps: 7000`, `rwaTargetBand: 250`) follow this convention.
- Slippage: passed to `simulate_set_reserve_token` as integer bps. Default 50 (the `rwa-yield-router` rotation guard threshold).

## Redemption margin formula

The 1.10x buffer baked into the simulate helpers is the policy floor; do not invent a tighter one:

```
required_margin = pendingRedemptionsUsdc * 1.10
redemption_margin_after = projected_idle_after - required_margin
```

Refuse the write if `redemptionMarginAfterIsPositive` is `false`. If pending is `available: false`, treat the floor as `$1000` minimum to keep the vault solvent on the next redeem.

## Yield landscape

`get_yield_landscape` returns the latest oracle prices for USDY / mUSD / mETH. It deliberately does **not** invent a synthetic APY. The agent computes APY itself by comparing successive runs:

```
apy_estimate = (price_now / price_lookback - 1) * (365 * 24 / lookbackHours)
```

Persist `lastYieldSnapshot` (price + timestamp) per token in `agents/memory/<agent>/state.json` so the next run has a reference point. Refuse any rotation decision that is based on a single price sample.

## Failure modes you must handle

- **Adapter not wired yet**: `get_reserve_state` returns `NO_ADAPTER` when `BasketVault.rwaAdapter()` is `0x0`. Surface a ticket via your `## Anomaly` section and stop — do not call `set_reserve_token` against a vault without a deployed adapter.
- **Oracle stale**: the adapter's `getReserveValueUsdc()` reverts with `RWA price stale` when the keeper relayer is behind. Don't try to power through; the next vault-agent tick will retry once the keeper catches up.
- **`No-op rotation`**: `set_reserve_token` reverts when the target token equals the current. The MCP's simulate helper raises `NO_OP_ROTATION` first so you never hit the on-chain revert; respect it.
- **Insufficient reserve / idle**: surfaces as `withdraw shortfall` / `allocate: amount exceeds idle USDC` from the simulate helpers. Size down to the available headroom instead of failing the run.
