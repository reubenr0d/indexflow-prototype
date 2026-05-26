# Bybit Perp Market Skill

Read-only access to Bybit V5 linear-perp data via the `bybit-mcp` server. Used exclusively by `funding-rate-harvester` to detect cross-venue funding-rate spreads worth opening a delta-neutral pair against.

## What you can read

The MCP exposes three read-only tools:

| Tool | Returns | When to call |
| --- | --- | --- |
| `bybit_perp_quote({ symbol })` | mark price, index price, open interest (USD), latest 8h funding rate (bps + annualised bps), next funding timestamp | once per candidate symbol per run |
| `bybit_funding_history({ symbol, lookbackHours? })` | last N 8h funding payments + mean + stdev (annualised bps) | only after `bybit_perp_quote` shows a spread > 800 bps annualised against the internal perp |
| `bybit_kline({ symbol, lookbackHours? })` | `returnBps`, `sevenDayVolBps`, `maxPeriodMoveBps` from V5 klines | optional vol cross-check when Yahoo `get_price_history` is missing or thin |

Funding is annualised by multiplying the 8h rate by `(365 * 24) / 8 = 1095`. The MCP does this for you — read `fundingRateAnnualizedBps` directly; do not re-derive it.

## v1 read-only constraint (enforced by the runner)

You have **no write tool** for Bybit. `funding-rate-harvester` frontmatter declares `v2BybitExecution: false`; the runner's risk-officer drops any tool call to a Bybit write surface. Even thinking about it in your `## Plan` section is a process bug. Execution stays on the internal perp via `vault-manager-mcp`'s `open_position` / `close_position` tools.

If a future stretch ships v2 (Byreal Perps CLI execution), the agent's frontmatter flips `v2BybitExecution: true` and a separate `bybit_open_order` tool will appear in `writeTools`. Until then: ignore Bybit as an execution venue.

## Auth, endpoint, secrets

- The V5 market endpoints used here are **public** — `BYBIT_API_KEY` / `BYBIT_API_SECRET` are accepted as env passthrough so the v2 stretch can reuse the server, but v1 never sends them.
- Default endpoint is **testnet** (`api-testnet.bybit.com`) when `BYBIT_TESTNET=1` (the CI default). Mainnet pricing is gated by an explicit `BYBIT_TESTNET=0` operator setting.
- The MCP fails closed on HTTP 5xx and on Bybit `retCode != 0`. Surface a ticket and stop; do not retry-loop.

## Symbol normalisation

You pass canonical agent symbols (`BTC-USD`, `ETH-USD`, …); the MCP maps them to Bybit's no-separator USDT-quoted shape (`BTCUSDT`, `ETHUSDT`, …). The supported base list lives in [`apps/mcps/bybit/symbol-mapping.mjs`](../../apps/mcps/bybit/symbol-mapping.mjs). Asking for an unknown base returns `UNKNOWN_SYMBOL`; surface it via your `## Skipped` section and move on.

## Spread math (the entire signal)

The harvest decision is a single ratio:

```
spreadBps = abs(internalFundingAnnualized - bybitFundingAnnualized)
```

Both annualised, both in bps. `internalFundingAnnualized` comes from `vault-manager-mcp`'s `get_internal_funding_rate({ symbol, lookbackHours: 168 })`. `bybitFundingAnnualized` comes from `bybit_perp_quote({ symbol }).fundingRateAnnualizedBps`.

Open a pair only if **all** of:

- `spreadBps > minAnnualizedSpreadBps` (`800` per frontmatter)
- `bybit_funding_history.stdev` for the same lookback shows the spread is not a one-off blip (rule of thumb: `stdev / mean < 0.6`)
- the internal perp pool has enough `availableCollateral` for the size you intend

If the internal funding is higher than Bybit's (`internalFunding > bybitFunding`), internal-perp longs are overpaying → **open SHORT on the internal perp** (`isLong: false`). The reverse is **open LONG**. Always one leg; Bybit's read-only data is the sentiment input that justifies the internal-only execution.

## Failure modes you must handle

- **Bybit testnet returns empty funding history** for many symbols. The MCP surfaces this as `samples: []` with a descriptive `note`. Treat empty history as "spread is unverifiable" → skip the symbol.
- **`UNKNOWN_SYMBOL`**: not in the supported base list. Add new bases by editing the `KNOWN_BASES` set in [`apps/mcps/bybit/symbol-mapping.mjs`](../../apps/mcps/bybit/symbol-mapping.mjs); never bypass the check in the agent prompt.
- **Funding flips sign mid-run**: re-read `bybit_perp_quote` for any symbol you intend to open against. The 8h funding can flip on the funding-time boundary; trading off a 20-minute-old quote risks opening into the wrong leg.
