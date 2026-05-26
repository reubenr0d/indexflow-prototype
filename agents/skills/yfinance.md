# Yahoo Finance Skill

Your capabilities for looking up market data — stock prices, ETFs, indices, and commodities.

## Tools

### yfinance_search(query, limit?)

Find stocks, ETFs, indices, or commodities by name or ticker.

- `query`: Search string (e.g. "Rio Tinto", "gold ETF", "AAPL")
- `limit`: Max results to return (optional, defaults to 5)

Returns matching symbols with name, exchange, and type.

### yfinance_quote(symbols)

Get live price quotes with USD conversion, day change, and volume.

- `symbols`: Array of ticker strings (e.g. `["AAPL", "BHP.AX", "GC=F"]`)

Returns per-symbol: current price, currency, USD-converted price (`priceUsd`), `source` (`yahoo` or `bybit-index` for allowlisted crypto when Yahoo misses), `yahooTicker`, `bybitSymbol`, plus symbol-resolution fields (`requestedSymbol`, `resolvedSymbol`, `isAmbiguous`, `candidates`). For crypto `BASE-USD` symbols, pass the exact `priceUsd` to `wire_asset` — including Bybit index fallbacks.

### yfinance_news(symbols, limitPerSymbol?)

Recent news headlines for one or more tickers. Backed by Yahoo Finance's search endpoint (no API key required).

- `symbols`: Array of ticker strings (max 10).
- `limitPerSymbol`: Headlines per symbol (default 3, max 10).

Returns `[{ symbol, headlines: [{ title, publisher, link, publishedAt (ISO), type, relatedTickers }], error?, _cacheHit?, _cacheFetchedAt?, _cacheSourceAgent? }]`. Symbols whose lookup fails return an empty `headlines` array plus an `error` field — the rest of the call still succeeds. Use this to ground trade justifications and thesis text in real news rather than guessing.

Results are served from `agents/memory/shared/news-cache.<agentName>.json` when a fetch for the same symbol happened in the last 30 minutes (from any agent). Cache hits are marked with `_cacheHit: true` and tagged with the originating agent.

### get_market_regime()

Snapshot of today's metals/miners tape derived from five Yahoo Finance day-change components: `GC=F` (gold futures), `HG=F` (copper futures), `XME` (US miners ETF), `GDX` (gold miners ETF), `DX-Y.NYB` (USD index).

Returns:

```
{
  regime: "metals_risk_on" | "metals_risk_off" | "metals_neutral",
  components: { "GC=F": { dayChangePct, vote, status }, ... },
  shortPenalty: 0 | 1 | 2,
  longBonus:    0 | 1 | 2,
  summary: "metals_risk_on (GC=F: +1.20%, HG=F: +2.10%, XME: +3.40%, GDX: +2.80%, DX-Y.NYB: -0.40%) — shortPenalty=2, longBonus=0",
  gateNote: "..."
}
```

Rules:

- `regime` is `metals_risk_on` when ≥3 of the 5 components vote bullish-for-miners (metals/miners up, USD down), `metals_risk_off` when ≥3 vote bearish, otherwise `metals_neutral`.
- `shortPenalty = 2` when XME or GDX day change ≥ +3% — the **runner deterministically rejects every new short open_position this run** with `SHORT_BLOCKED_BY_REGIME`. Do not propose shorts on this run; the rejection costs a turn.
- `shortPenalty = 1` when XME or GDX day change ≥ +1% — caution only; proceed with shorts on clear red-flag names (treasury risk, fatal drill miss, dilution).
- `longBonus = 2` when miners deeply red (≤ −3%) — consider upweighting long convictionWeights on top-quartile picks.

The runner calls `get_market_regime` once at the start of every run and pins the result into your system prompt under `## Today's Metals Regime`. Reading that block is enough; you do not need to call this tool yourself unless you want to refresh mid-run.

## Example Calls

```
// Search for a company
yfinance_search({ query: "Rio Tinto", limit: 5 })

// Get live quotes for multiple symbols
yfinance_quote({ symbols: ["BHP.AX", "RIO.AX", "NEM"] })

// Look up a commodity future
yfinance_search({ query: "gold futures" })
yfinance_quote({ symbols: ["GC=F"] })

// Pull headlines to justify a trade
yfinance_news({ symbols: ["GSR.V", "NEM", "BHP.AX"], limitPerSymbol: 3 })
```

## Tips

- Symbols follow Yahoo Finance conventions: `.AX` for ASX, `.L` for London, `=F` for futures.
- For equities, prefer exchange-suffixed symbols when available; ambiguous unsuffixed symbols are write-unsafe.
- Quotes include a `regularMarketPrice` in the native currency and a USD-converted price.
- Use search first when you don't know the exact ticker symbol.
- Day change fields tell you intraday momentum; 52-week range gives broader context.
