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

Returns per-symbol: current price, currency, USD-converted price, day change (absolute and percent), volume, market cap, plus symbol-resolution fields (`requestedSymbol`, `resolvedSymbol`, `isAmbiguous`, `candidates`).

### yfinance_news(symbols, limitPerSymbol?)

Recent news headlines for one or more tickers. Backed by Yahoo Finance's search endpoint (no API key required).

- `symbols`: Array of ticker strings (max 10).
- `limitPerSymbol`: Headlines per symbol (default 3, max 10).

Returns `[{ symbol, headlines: [{ title, publisher, link, publishedAt (ISO), type, relatedTickers }], error? }]`. Symbols whose lookup fails return an empty `headlines` array plus an `error` field — the rest of the call still succeeds. Use this to ground trade justifications and thesis text in real news rather than guessing.

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
