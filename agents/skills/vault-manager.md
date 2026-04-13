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

### Write Tools

All write tools return `{success, transactionHash, next_steps}` with structured error recovery hints on failure.

| Tool | Purpose | Key params |
|------|---------|------------|
| `wire_asset` | Register new tradeable asset | `symbol`, `seedPriceUsd` |
| `create_vault` | Deploy new basket vault | `name`, `depositFeeBps`, `redeemFeeBps` |
| `set_vault_assets` | Set vault's tracked assets | `vault`, `assetIds[]` |
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
