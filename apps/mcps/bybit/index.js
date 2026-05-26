#!/usr/bin/env node

// Read-only MCP server over Bybit's V5 public market endpoints.
//
//   - bybit_perp_quote({ symbol })
//   - bybit_funding_history({ symbol, lookbackHours? })
//   - bybit_kline({ symbol, lookbackHours? })
//
// Auth is **not required** for these endpoints. CI defaults to testnet when
// BYBIT_TESTNET is unset (see entrypoint below). Production keepers should
// set BYBIT_TESTNET=0 for mainnet index/kline data.

if (process.env.BYBIT_TESTNET === undefined) {
  process.env.BYBIT_TESTNET = "1";
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { normaliseAgentSymbolToBybit } from "./symbol-mapping.mjs";
import { bybitPublicFetch, getBybitBaseUrl } from "../../shared/bybit-public-market.mjs";
import { fetchBybitPriceHistory } from "../../shared/bybit-price-history.mjs";

const MAX_HISTORY_LIMIT = 200;
const FUNDING_INTERVAL_HOURS = 8;
const FUNDINGS_PER_YEAR = (365 * 24) / FUNDING_INTERVAL_HOURS;

function toolText(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function toolError(error_code, message, extra = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { success: false, error_code, message, ...extra },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

function annualiseFundingBps(fundingRateDecimal) {
  const bps8h = fundingRateDecimal * 10_000;
  return { bps8h, bpsAnnualised: bps8h * FUNDINGS_PER_YEAR };
}

function stdev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

async function bybitPerpQuote({ symbol }) {
  const bybitSymbol = normaliseAgentSymbolToBybit(symbol);
  if (!bybitSymbol) {
    return toolError(
      "UNKNOWN_SYMBOL",
      `Symbol ${JSON.stringify(symbol)} is not a recognised Bybit perp. Use the canonical agent shape (e.g. "BTC-USD", "ETH-USD") for a base in the supported set.`,
      { recovery_hint: "See apps/mcps/bybit/symbol-mapping.mjs for the supported base list." },
    );
  }
  try {
    const { body, url } = await bybitPublicFetch("/v5/market/tickers", {
      category: "linear",
      symbol: bybitSymbol,
    });
    const row = body?.result?.list?.[0];
    if (!row) {
      return toolError("EMPTY_RESPONSE", `Bybit returned no ticker row for ${bybitSymbol}`, {
        endpoint: url,
      });
    }
    const fundingRate = Number(row.fundingRate ?? 0);
    const { bps8h, bpsAnnualised } = annualiseFundingBps(fundingRate);
    return toolText({
      success: true,
      symbol,
      bybitSymbol,
      markPriceUsd: Number(row.markPrice),
      indexPriceUsd: Number(row.indexPrice),
      lastPriceUsd: Number(row.lastPrice),
      openInterestUsd: Number(row.openInterestValue ?? 0),
      openInterestContracts: Number(row.openInterest ?? 0),
      fundingRateBps8h: bps8h,
      fundingRateAnnualizedBps: bpsAnnualised,
      nextFundingAtMs: Number(row.nextFundingTime ?? 0),
      venue: getBybitBaseUrl().includes("testnet") ? "bybit-testnet" : "bybit-mainnet",
      asOfMs: Date.now(),
    });
  } catch (err) {
    return toolError("BYBIT_FETCH_FAILED", String(err?.message || err));
  }
}

async function bybitFundingHistory({ symbol, lookbackHours = 168 }) {
  const bybitSymbol = normaliseAgentSymbolToBybit(symbol);
  if (!bybitSymbol) {
    return toolError(
      "UNKNOWN_SYMBOL",
      `Symbol ${JSON.stringify(symbol)} is not a recognised Bybit perp.`,
    );
  }
  const requestedSamples = Math.ceil(lookbackHours / FUNDING_INTERVAL_HOURS);
  const limit = Math.max(1, Math.min(MAX_HISTORY_LIMIT, requestedSamples));
  try {
    const { body, url } = await bybitPublicFetch("/v5/market/funding/history", {
      category: "linear",
      symbol: bybitSymbol,
      limit: String(limit),
    });
    const rows = Array.isArray(body?.result?.list) ? body.result.list : [];
    if (rows.length === 0) {
      return toolText({
        success: true,
        symbol,
        bybitSymbol,
        samples: [],
        meanAnnualizedBps: 0,
        stdevAnnualizedBps: 0,
        lookbackHours,
        endpoint: url,
        note: "Bybit returned an empty funding history (likely testnet symbol with no recent settlements).",
      });
    }
    const samples = rows.map((r) => {
      const rate = Number(r.fundingRate ?? 0);
      const { bps8h, bpsAnnualised } = annualiseFundingBps(rate);
      return {
        timestampMs: Number(r.fundingRateTimestamp ?? 0),
        fundingRate: rate,
        bps8h,
        annualizedBps: bpsAnnualised,
      };
    });
    const annualised = samples.map((s) => s.annualizedBps);
    const mean = annualised.reduce((a, b) => a + b, 0) / annualised.length;
    return toolText({
      success: true,
      symbol,
      bybitSymbol,
      samples,
      meanAnnualizedBps: mean,
      stdevAnnualizedBps: stdev(annualised),
      lookbackHours,
      sampleCount: samples.length,
      venue: getBybitBaseUrl().includes("testnet") ? "bybit-testnet" : "bybit-mainnet",
    });
  } catch (err) {
    return toolError("BYBIT_FETCH_FAILED", String(err?.message || err));
  }
}

async function bybitKline({ symbol, lookbackHours = 168 }) {
  const bybitSymbol = normaliseAgentSymbolToBybit(symbol);
  if (!bybitSymbol) {
    return toolError(
      "UNKNOWN_SYMBOL",
      `Symbol ${JSON.stringify(symbol)} is not a recognised Bybit perp.`,
    );
  }
  const history = await fetchBybitPriceHistory(bybitSymbol, { lookbackHours });
  if (!history.ok) {
    return toolError("BYBIT_KLINE_FAILED", history.error || "insufficient_history", {
      symbol,
      bybitSymbol,
      lookbackHours,
    });
  }
  return toolText({
    success: true,
    symbol,
    bybitSymbol,
    lookbackHours: history.lookbackHours,
    interval: history.interval,
    returnBps: history.returnBps,
    sevenDayVolBps: history.sevenDayVolBps,
    maxPeriodMoveBps: history.maxPeriodMoveBps,
    barCount: history.barCount,
    venue: getBybitBaseUrl().includes("testnet") ? "bybit-testnet" : "bybit-mainnet",
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "bybit", version: "1.1.0" });

server.registerTool(
  "bybit_perp_quote",
  {
    description:
      "Return the latest Bybit V5 linear-perp quote for a symbol: mark price, index price, open interest (USD), current 8h funding rate (bps + annualized bps), next funding timestamp. Read-only.",
    inputSchema: {
      symbol: z
        .string()
        .min(1)
        .describe('Canonical agent symbol (e.g. "BTC-USD"). Bybit-style symbols ("BTCUSDT") are also accepted.'),
    },
  },
  bybitPerpQuote,
);

server.registerTool(
  "bybit_funding_history",
  {
    description:
      "Return the last N Bybit 8h funding payments for a symbol with mean and stdev (annualized bps). Used to confirm that a live funding spread isn't a one-off blip. Default lookback: 168h (~21 samples).",
    inputSchema: {
      symbol: z.string().min(1),
      lookbackHours: z
        .number()
        .int()
        .min(8)
        .max(MAX_HISTORY_LIMIT * FUNDING_INTERVAL_HOURS)
        .optional()
        .describe("Hours of funding history to fetch (rounded up to whole 8h samples)."),
    },
  },
  bybitFundingHistory,
);

server.registerTool(
  "bybit_kline",
  {
    description:
      "Return trailing price stats from Bybit V5 klines for a linear perp: return over lookback (bps), sevenDayVolBps (stdev of period returns), maxPeriodMoveBps. Read-only; use to cross-check vol when Yahoo history is missing.",
    inputSchema: {
      symbol: z.string().min(1).describe('Canonical agent symbol (e.g. "SOL-USD").'),
      lookbackHours: z
        .number()
        .int()
        .min(8)
        .max(24 * 90)
        .optional()
        .describe("Hours of kline history (default 168 = 7d)."),
    },
  },
  bybitKline,
);

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  if (process.argv.includes("--smoke")) {
    const res = await bybitPerpQuote({ symbol: "BTC-USD" });
    const text = res?.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text);
    if (parsed?.success) {
      console.log(JSON.stringify(parsed, null, 2));
      process.exit(0);
    }
    console.error(text);
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
