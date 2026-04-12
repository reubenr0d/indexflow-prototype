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

Returns per-symbol: current price, currency, USD-converted price, day change (absolute and percent), volume, market cap, and 52-week range.

## Example Calls

```
// Search for a company
yfinance_search({ query: "Rio Tinto", limit: 5 })

// Get live quotes for multiple symbols
yfinance_quote({ symbols: ["BHP.AX", "RIO.AX", "NEM"] })

// Look up a commodity future
yfinance_search({ query: "gold futures" })
yfinance_quote({ symbols: ["GC=F"] })
```

## Tips

- Symbols follow Yahoo Finance conventions: `.AX` for ASX, `.L` for London, `=F` for futures.
- Quotes include a `regularMarketPrice` in the native currency and a USD-converted price.
- Use search first when you don't know the exact ticker symbol.
- Day change fields tell you intraday momentum; 52-week range gives broader context.
