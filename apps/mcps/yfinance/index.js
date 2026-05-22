#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { classifySymbolWithSearch } from "../../shared/yahoo-symbol-policy.mjs";
import { fetchLivePriceUsd } from "../../shared/yahoo-usd-quote.mjs";

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
      const quotes = await Promise.all(
        symbols.map(async (symbol) => {
          const searchRows = await getSearchRows(symbol);
          const classification = classifySymbolWithSearch(symbol, searchRows);
          try {
            const live = await fetchLivePriceUsd(symbol);
            return {
              requestedSymbol: symbol,
              resolvedSymbol: live.resolvedSymbol,
              symbol: live.resolvedSymbol ?? symbol,
              name: live.name,
              price: live.price,
              priceUsd: live.priceUsd,
              currency: live.currency,
              exchange: live.exchange,
              marketState: live.marketState,
              dayChange: live.dayChange,
              dayChangePct: live.dayChangePct,
              volume: live.volume,
              marketCap: live.marketCap,
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

server.registerTool(
  "yfinance_news",
  {
    title: "Yahoo Finance News",
    description:
      "Recent news headlines for one or more Yahoo Finance symbols. " +
      "Returns [{symbol, title, publisher, link, publishedAt, type, relatedTickers}], " +
      "sorted newest-first per requested symbol. Backed by Yahoo Finance search " +
      "(no API key required). Best-effort: symbols whose lookup fails are returned " +
      "with an empty headline list rather than aborting the whole call. Use this to " +
      "ground trade justifications and thesis text in real news.",
    inputSchema: {
      symbols: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe("Yahoo Finance ticker symbols (e.g. ['BHP.AX', 'NEM', 'GSR.V']). Max 10 per call."),
      limitPerSymbol: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .default(3)
        .describe("Max headlines to return per symbol (default 3, max 10)."),
    },
  },
  async ({ symbols, limitPerSymbol }) => {
    const perSymbolCap = Math.min(Math.max(limitPerSymbol ?? 3, 1), 10);
    try {
      const client = await yf();
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const raw = await client.search(symbol, {
              quotesCount: 0,
              newsCount: perSymbolCap,
            });
            const headlines = (raw.news ?? []).slice(0, perSymbolCap).map((item) => {
              const ts = item.providerPublishTime;
              let publishedAt = null;
              if (ts instanceof Date) {
                publishedAt = ts.toISOString();
              } else if (typeof ts === "number" && Number.isFinite(ts)) {
                publishedAt = new Date(ts * 1000).toISOString();
              } else if (typeof ts === "string") {
                const parsed = new Date(ts);
                publishedAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
              }
              return {
                title: item.title ?? "",
                publisher: item.publisher ?? "",
                link: item.link ?? "",
                publishedAt,
                type: item.type ?? "",
                relatedTickers: Array.isArray(item.relatedTickers) ? item.relatedTickers : [],
              };
            });
            return { symbol, headlines };
          } catch (err) {
            return {
              symbol,
              headlines: [],
              error: err?.message ?? "news lookup failed",
            };
          }
        }),
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    } catch (err) {
      return toolError(
        "YAHOO_NEWS_FAILED",
        err.message,
        "Yahoo Finance search may be temporarily unavailable — retry after a few seconds. " +
          "Per-symbol errors are returned inline, so a full-call failure usually indicates a transient outage.",
      );
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
