# Nansen Smart-Money Skill

Operating manual for the `nansen-mcp` server. Used exclusively by `smart-money-mirror-manager` to build a Mantle ecosystem basket weighted by Nansen-labelled smart-money flow.

## Two modes — always check which one you got

Every MCP response carries `nansen_mode` and `degraded` flags. The agent prompt's confidence weighting depends on which mode produced the data:

| `nansen_mode` | `degraded` | What it means | Confidence cap |
| --- | --- | --- | --- |
| `live` | `false` | `NANSEN_API_KEY` was set; live Nansen REST response | `high` allowed |
| `envio_only` | `true` | Key unset; degraded heuristic from Envio Mantle DEX swap aggregates | cap at `medium`; never claim `high` |

Persist `nansen_mode` per run in your `state.json` so a post-run summary can attribute basket changes to the right signal source.

## Tools

| Tool | Returns | Default lookback |
| --- | --- | --- |
| `nansen_smart_money_holdings({ chain?, lookbackHours? })` | array of `{ token, smartMoneyWalletCount, netFlow7dUsd, medianHoldingDays, confidenceTier }` | 168h, chain=mantle |
| `nansen_token_anomaly({ token, lookbackHours? })` | `{ severity, signals[] }` where severity is one of `high` / `medium` / `low` / `none` / `unknown` | 72h |

`chain` is locked to `"mantle"` in this MCP build. Other chains return `UNSUPPORTED_CHAIN`; don't try to bypass it by passing a chain id directly.

In `envio_only` degraded mode, `nansen_token_anomaly` returns `severity: "unknown"` with an empty signal array — anomaly detection requires the Nansen label graph and is not derivable from raw Envio swap events. Treat `"unknown"` as **not safe**: if you cannot confirm a token is anomaly-free, do not include it in the basket.

## Confidence tiers (shared classifier)

Both live and degraded paths run the same JS classifier in [`apps/mcps/nansen/confidence-tier.mjs`](../../apps/mcps/nansen/confidence-tier.mjs):

| Wallets ≥ | 7d net flow ≥ | Tier | Score |
| --- | --- | --- | --- |
| 12 | $250k | `high` | 80 |
| 5 | $25k | `medium` | 65 |
| 3 OR any positive flow | — | `low` | 40 |
| else | — | `none` | 0 |

Degraded mode caps the output tier at `medium` — never trust a `high` claim without live Nansen labels. The agent's `minConfidenceScore` (65 per frontmatter) and `minSmartMoneyWalletCount` (5) line up with the `medium` cutoff so a degraded run still produces a workable basket as long as Envio is reachable.

## Basket assembly checklist

1. `nansen_smart_money_holdings({ chain: "mantle", lookbackHours: 168 })` — note the `nansen_mode` flag.
2. Filter holdings to `confidenceTier in ("high", "medium")` (or just `"medium"` in degraded mode) and `smartMoneyWalletCount >= minSmartMoneyWalletCount`.
3. For each surviving token, call `nansen_token_anomaly`. Drop any token with `severity in ("high", "medium")`. In degraded mode you must also cross-check via `vault-manager-mcp`'s on-chain anomaly tooling — Nansen anomaly is unavailable.
4. Sort by `confidenceTier` then `netFlow7dUsd`. Cap basket size at `maxBasketSize` (8). Refuse if survivors < `minBasketSize` (5) — surface a `## Skipped` note and exit without rebalancing.
5. Sign every basket change against the `mantleTokenRegistry` (`apps/web/src/config/mantle-tokens.json`). Tokens not in the registry are not priced by the Mantle DEX TWAP oracle and therefore cannot be opened as perp positions.

## Failure modes you must handle

- **`ENVIO_URL unset` in degraded mode**: the holdings response carries `degraded_reason: "ENVIO_URL unset..."` and an empty `holdings` array. You cannot build a basket — surface a ticket and exit.
- **Live Nansen 401/403**: the key is invalid or expired. The MCP returns `NANSEN_FETCH_FAILED` with a recovery hint to unset the key locally. Don't retry; surface a ticket.
- **Token symbol drift**: Mantle ecosystem tokens occasionally rename. Always rely on `tokenAddress` over `token` symbol when matching against the registry — symbol-only matches will silently mis-include the wrong asset.
- **`degraded: true` mid-week**: the operator may have rotated the Nansen key. Continue running but do not rebalance into a larger basket until two consecutive ticks confirm the mode (live ⟷ degraded ⟷ live transitions are signal-noise, not signal).
