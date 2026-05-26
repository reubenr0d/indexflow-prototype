#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { classifySymbolWithSearch } from "../../shared/yahoo-symbol-policy.mjs";
import { fetchOracleSeedPriceUsd } from "../../shared/oracle-seed-price.mjs";
import {
  getCachedNews,
  writeNewsCache,
} from "../../shared/agent-shared-memory.mjs";
import {
  classifyMarketRegime,
  REGIME_COMPONENT_SYMBOLS,
} from "../../shared/market-regime.mjs";
import { fetchPriceHistory } from "../../shared/yahoo-price-history.mjs";

const AGENT_NAME = process.env.AGENT_NAME || "";
const NEWS_CACHE_DISABLED = ["1", "true", "yes"].includes(
  String(process.env.AGENT_NEWS_CACHE_DISABLED || "").toLowerCase().trim(),
);
const NEWS_CACHE_TTL_MS = (() => {
  const raw = process.env.AGENT_NEWS_CACHE_TTL_MS;
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
})();

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
      "Returns [{symbol, name, price, priceUsd, currency, exchange, marketState, source, yahooTicker, bybitSymbol, dayChange, dayChangePct, volume, marketCap, requestedSymbol, resolvedSymbol, isAmbiguous, candidates}]. " +
      "Automatically converts non-USD prices via FX rates. " +
      "For allowlisted crypto (BASE-USD), falls back to Bybit index when Yahoo has no quote. " +
      "Works for stocks, ETFs, commodities, forex, and crypto oracle symbols.",
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
            const live = await fetchOracleSeedPriceUsd(symbol);
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
              source: live.source,
              yahooTicker: live.yahooTicker,
              bybitSymbol: live.bybitSymbol,
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
      const freshEntries = {};
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          // Cache lookup first. The cache key is the requested symbol
          // string verbatim (uppercased inside the helper). Cached entries
          // are sliced down to `perSymbolCap` so a previous call that
          // requested 10 headlines transparently serves a request for 3.
          if (!NEWS_CACHE_DISABLED) {
            const cached = getCachedNews({ symbol, ttlMs: NEWS_CACHE_TTL_MS });
            if (cached) {
              return {
                symbol,
                headlines: (cached.headlines || []).slice(0, perSymbolCap),
                _cacheHit: true,
                _cacheFetchedAt: cached.fetchedAt,
                _cacheSourceAgent: cached.sourceAgent || null,
              };
            }
          }

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
            // Stash for the post-call cache write; we batch all freshly
            // fetched symbols into a single atomic write at the end so
            // partial failures don't leave the cache half-updated.
            if (!NEWS_CACHE_DISABLED) {
              freshEntries[symbol] = headlines;
            }
            return { symbol, headlines, _cacheHit: false };
          } catch (err) {
            return {
              symbol,
              headlines: [],
              error: err?.message ?? "news lookup failed",
              _cacheHit: false,
            };
          }
        }),
      );
      if (!NEWS_CACHE_DISABLED && AGENT_NAME && Object.keys(freshEntries).length > 0) {
        try {
          writeNewsCache({
            agentName: AGENT_NAME,
            entries: freshEntries,
            ttlMs: NEWS_CACHE_TTL_MS,
          });
        } catch (err) {
          // Cache write failures are non-fatal; surface in stderr only.
          console.error(`yfinance_news: cache write failed: ${err?.message || err}`);
        }
      }
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

server.registerTool(
  "get_price_history",
  {
    title: "Yahoo Finance Price History",
    description:
      "Trailing price returns for trade-timing / priced-in checks. Returns return5dPct, return20dPct, return60dPct, and the largest single-day move in the last 30 sessions. On failure, ok=false — callers should skip the priced-in filter rather than blocking the pick.",
    inputSchema: {
      symbols: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe("Yahoo Finance symbols (e.g. ['GSR.V', 'NEM'])."),
    },
  },
  async ({ symbols }) => {
    try {
      const client = await yf();
      const results = await Promise.all(
        symbols.map((symbol) => fetchPriceHistory(symbol, { yfClient: client })),
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    } catch (err) {
      return toolError(
        "YAHOO_HISTORY_FAILED",
        err.message,
        "Verify symbol format; TSXV/ASX tickers may have sparse history. On failure, skip priced-in filtering for that symbol.",
      );
    }
  },
);

server.registerTool(
  "get_market_regime",
  {
    title: "Get Market Regime (Metals + Miners)",
    description:
      "Snapshot of today's metals/miners tape derived from five Yahoo Finance day-change components: " +
      `${REGIME_COMPONENT_SYMBOLS.join(", ")}. ` +
      "Returns {regime, components, shortPenalty, longBonus, summary}. " +
      "`regime` is one of `metals_risk_on` / `metals_risk_off` / `metals_neutral` " +
      "based on whether ≥3 of the 5 components agree on direction (miners ETFs up, USD down = bullish for miners). " +
      "`shortPenalty` is the runner's gate for new shorts: 0 (allowed), 1 (caution), 2 (auto-blocked by the runner — XME or GDX day change >= +3%). " +
      "`longBonus` mirrors on the downside (miners deeply red). Call this once near the top of every run to size and gate new entries against the macro tape — it is free vs the equivalent batch of yfinance_quote calls (no FX leg). " +
      "Per-symbol fetch failures are surfaced via `components[symbol].status === \"unavailable\"`; the regime classification proceeds with whatever components were available.",
    inputSchema: {},
  },
  async () => {
    const components = {};
    await Promise.all(
      REGIME_COMPONENT_SYMBOLS.map(async (symbol) => {
        try {
          const client = await yf();
          const q = await client.quote(symbol);
          const dayChangePct = q?.regularMarketChangePercent;
          if (Number.isFinite(dayChangePct)) {
            components[symbol] = dayChangePct;
          }
        } catch {
          // Leave the symbol out so classifyMarketRegime marks it `unavailable`.
        }
      }),
    );
    const classified = classifyMarketRegime(components);
    const payload = {
      ...classified,
      fetchedAt: new Date().toISOString(),
      gateNote:
        classified.shortPenalty >= 2
          ? "shortPenalty=2 — the agent runner WILL reject every new short open_position in this batch with error_code: 'SHORT_BLOCKED_BY_REGIME'."
          : classified.shortPenalty === 1
            ? "shortPenalty=1 — proceed with shorts only on clear red-flag names; the runner does not auto-block at this level."
            : "shortPenalty=0 — no regime-based short blocking active.",
    };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
