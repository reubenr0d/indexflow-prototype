# Crypto oracle coverage (Yahoo vs Bybit)

IndexFlow uses a single on-chain symbol shape for crypto perps: **`BASE-USD`** (e.g. `BTC-USD`, `ETH-USD`). Prices reach `OracleAdapter` via the **CustomRelayer** keeper unless a symbol is Chainlink-fed.

## Two venues, two jobs

| Role | Source | When |
|------|--------|------|
| **On-chain spot oracle** (NAV, perp PnL) | Yahoo Finance (`BASE-USD` or override) | Default for all wired crypto |
| **Oracle fallback** | Bybit **index** price (not mark) | Only if Yahoo has no quote **and** symbol is in the Bybit fallback allowlist |
| **Register / wire seed** | [`fetchOracleSeedPriceUsd`](../apps/shared/oracle-seed-price.mjs) | Same Yahoo → Bybit index path as keeper; used by admin, `yfinance_quote`, `wire_asset` guard |
| **Funding / OI / vol context** | Bybit V5 public API | `funding-rate-harvester` and agents via `bybit-mcp` |
| **Historical klines (crypto vol)** | Bybit `bybit_kline` or Yahoo `get_price_history` | Agents; prefer internal funding vol for harvester, Bybit kline as cross-check |

**Not all Bybit linear perps exist on Yahoo.** The repo intentionally supports ~30 bases in [`apps/mcps/bybit/symbol-mapping.mjs`](../apps/mcps/bybit/symbol-mapping.mjs), not every Bybit listing. Only symbols that pass the probe should be wired on-chain.

## Three sets

1. **Bybit-tradable** — `KNOWN_BASES` in symbol-mapping → `BASEUSDT` on Bybit.
2. **Yahoo-quotable** — `yfinance_quote` / keeper resolves `yahooTickerForAgentSymbol(BASE-USD)` (see [`apps/shared/crypto-oracle-symbols.mjs`](../apps/shared/crypto-oracle-symbols.mjs) for overrides like `MATIC` → `POL-USD`).
3. **Oracle-eligible** — intersection: wire on-chain only when both Yahoo (or documented fallback) and Bybit probes succeed for symbols you intend to trade.

## Probe before wiring

```bash
# Mainnet Bybit + live Yahoo (recommended before expanding harvester candidates)
BYBIT_TESTNET=0 npm run probe:crypto-symbols

# JSON only (CI / scripting)
BYBIT_TESTNET=0 npm run probe:crypto-symbols -- --json
```

Output columns:

- `agentSymbol` — `BASE-USD`
- `yahoo.ok` / `yahoo.priceUsd` — live Yahoo quote (with ticker override)
- `bybit.ok` / `bybit.indexPriceUsd` — Bybit linear index
- `oracleEligible` — `yahoo.ok || (bybit.ok && fallbackAllowed)`

## Keeper behaviour

[`scripts/update-yahoo-finance-prices.js`](../scripts/update-yahoo-finance-prices.js) calls [`fetchOracleSeedPriceUsd`](../apps/shared/oracle-seed-price.mjs) per active CustomRelayer asset (Yahoo first, then Bybit index for allowlisted crypto).

**Production keepers should use mainnet Bybit** (`BYBIT_TESTNET=0`). Agent CI defaults to testnet for safety; testnet funding history is often empty.

## Agent symbols today

| Agent | Crypto symbols | Oracle seed | Bybit read |
|-------|----------------|-------------|------------|
| `funding-rate-harvester` | 6 candidates (BTC, ETH, SOL, AVAX, LINK, DOGE) | `yfinance_quote` → `wire_asset` (Bybit index when Yahoo misses) | funding + kline vol cross-check |
| `meth-carry-manager` | `ETH-USD` only | `yfinance_quote` / shared seed helper | — |
| Mining / quality matrix | Equities only | Yahoo | — |

## Safety notes

- Bybit market endpoints are **public** (no API key) with IP rate limits; avoid tight polling loops.
- **Mark price** is perp-specific; oracle fallback uses **index** price only.
- Internal perp is synthetic USD; funding arb compares **rates**, not identical spot underlyings.
- Do not register long-tail Bybit alts without a successful probe.

## Web UI

- **Admin register:** Yahoo search includes `CRYPTOCURRENCY` results; type `BTC-USD` directly to register crypto oracle symbols. `/api/yahoo-finance/quote` uses `fetchOracleSeedPriceUsd` (Yahoo + Bybit index fallback); the Wire button enables when `priceUsd` is available from either source. External outlinks (admin, positions, charts) use [`resolveMarketOutlink`](../apps/shared/market-outlinks.mjs) — **Bybit trade URL** when `source` is `bybit-index` or the chart uses Bybit klines.
- **Charts:** `/prices/[assetId]` and basket **Asset Prices** panels show Yahoo history when available. For crypto symbols with sparse Yahoo data, the UI falls back to **Bybit kline** series via `/api/bybit/kline` (comparison only — on-chain oracle remains authoritative for live price).

## Related docs

- [ORACLE_SUPPORTED_ASSETS.md](./ORACLE_SUPPORTED_ASSETS.md) — Sepolia equity oracle
- [PRICE_FEED_FLOW.md](./PRICE_FEED_FLOW.md) — keeper → `submitPrices` → GMX
- [agents/skills/bybit.md](../agents/skills/bybit.md) — MCP tools for agents
