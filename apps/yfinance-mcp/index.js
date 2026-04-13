#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { classifySymbolWithSearch } from "../shared/yahoo-symbol-policy.mjs";

// ---------------------------------------------------------------------------
// Yahoo Finance client (lazy-loaded)
// ---------------------------------------------------------------------------

let _yf = null;
async function yf() {
  if (!_yf) {
    const mod = await import("yahoo-finance2");
    const YahooFinance = mod.default;
    _yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  }
  return _yf;
}

async function getUsdRate(currency) {
  if (currency === "USD") return 1;
  const client = await yf();
  const pair = `${currency}USD=X`;
  const q = await client.quote(pair);
  const rate = q.regularMarketPrice;
  if (!rate || rate <= 0) throw new Error(`Could not fetch FX rate for ${pair}`);
  return rate;
}

async function getSearchRows(symbol) {
  const client = await yf();
  try {
    const raw = await client.search(symbol, { quotesCount: 20, newsCount: 0 });
    return (raw.quotes ?? [])
      .filter((quote) => "symbol" in quote)
      .map((quote) => ({
        symbol: quote.symbol,
        quoteType: quote.quoteType ?? "",
        exchange: quote.exchDisp ?? quote.exchange ?? "",
        name: quote.longname ?? quote.shortname ?? "",
      }));
  } catch {
    return [];
  }
}

function toolError(code, message, recoveryHint) {
  const payload = { success: false, error_code: code, message };
  if (recoveryHint) payload.recovery_hint = recoveryHint;
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "yfinance",
  version: "1.0.0",
});

server.registerTool(
  "yfinance_search",
  {
    title: "Yahoo Finance Search",
    description:
      "Search Yahoo Finance for equities, ETFs, indices, or any ticker by name or symbol. " +
      "Returns [{symbol, name, exchange, type, sector, industry}]. " +
      "Use this to discover ticker symbols before calling yfinance_quote for live prices.",
    inputSchema: {
      query: z.string().describe("Search query — company name (e.g. 'Rio Tinto'), ticker (e.g. 'RIO'), or sector keyword"),
      limit: z.number().optional().default(10).describe("Max results (default 10, max 20)"),
    },
  },
  async ({ query, limit }) => {
    try {
      const client = await yf();
      const raw = await client.search(query, { quotesCount: Math.min(limit ?? 10, 20), newsCount: 0 });
      const results = (raw.quotes ?? [])
        .filter((q) => "symbol" in q)
        .map((q) => ({
          symbol: q.symbol,
          name: q.longname ?? q.shortname ?? "",
          exchange: q.exchDisp ?? q.exchange ?? "",
          type: q.quoteType ?? "",
          sector: q.sectorDisp ?? "",
          industry: q.industryDisp ?? "",
        }));
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    } catch (err) {
      return toolError("YAHOO_SEARCH_FAILED", err.message,
        "Check the query string. Yahoo Finance may be temporarily unavailable — retry after a few seconds.");
    }
  },
);

server.registerTool(
  "yfinance_quote",
  {
    title: "Yahoo Finance Quote",
    description:
      "Get current price quotes for one or more Yahoo Finance symbols. " +
      "Returns [{symbol, name, price, priceUsd, currency, exchange, marketState, dayChange, dayChangePct, volume, marketCap, requestedSymbol, resolvedSymbol, isAmbiguous, candidates}]. " +
      "Automatically converts non-USD prices via FX rates. " +
      "Works for any stock, ETF, index, commodity, or forex pair on Yahoo Finance.",
    inputSchema: {
      symbols: z.array(z.string()).describe("Ticker symbols (e.g. ['BHP.AX', 'AAPL', 'GLEN.L', 'GC=F'])"),
    },
  },
  async ({ symbols }) => {
    try {
      const client = await yf();
      const quotes = await Promise.all(
        symbols.map(async (symbol) => {
          const searchRows = await getSearchRows(symbol);
          const classification = classifySymbolWithSearch(symbol, searchRows);
          try {
            const q = await client.quote(symbol);
            const price = q.regularMarketPrice ?? null;
            const currency = q.currency ?? "USD";
            let priceUsd = null;
            if (price != null) {
              const fxRate = await getUsdRate(currency);
              priceUsd = +(price * fxRate).toFixed(4);
            }
            return {
              requestedSymbol: symbol,
              resolvedSymbol: q.symbol ?? null,
              symbol: q.symbol,
              name: q.longName ?? q.shortName ?? "",
              price,
              priceUsd,
              currency,
              exchange: q.fullExchangeName ?? "",
              marketState: q.marketState ?? "CLOSED",
              dayChange: q.regularMarketChange ?? null,
              dayChangePct: q.regularMarketChangePercent ?? null,
              volume: q.regularMarketVolume ?? null,
              marketCap: q.marketCap ?? null,
              isAmbiguous: classification.isAmbiguous,
              candidates: classification.candidates,
            };
          } catch {
            return {
              requestedSymbol: symbol,
              resolvedSymbol: null,
              symbol,
              error: "Quote failed — check symbol format",
              isAmbiguous: classification.isAmbiguous,
              candidates: classification.candidates,
            };
          }
        }),
      );
      return { content: [{ type: "text", text: JSON.stringify(quotes, null, 2) }] };
    } catch (err) {
      return toolError("YAHOO_QUOTE_FAILED", err.message,
        "Verify symbol format; for ambiguous equities use exchange suffixes (e.g. 'BHP.AX'). Yahoo Finance may be temporarily unavailable.");
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
