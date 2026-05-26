#!/usr/bin/env node

// Read-only MCP server over Bybit's V5 public market endpoints.
// Implements the two tools agents/funding-rate-harvester.md requires:
//
//   - bybit_perp_quote({ symbol })
//       Returns mark price, index price, open interest (USD), the latest
//       8h funding rate (bps and annualised bps) and the next funding
//       timestamp. Sourced from `/v5/market/tickers?category=linear` —
//       a single fully-public endpoint, no auth required.
//
//   - bybit_funding_history({ symbol, lookbackHours? })
//       Returns the last N funding payments from
//       `/v5/market/funding/history?category=linear`. We compute the
//       mean / stdev annualised in bps so the agent can sanity-check
//       that the live spread isn't a one-off blip.
//
// Auth is **not required** for these endpoints — the V5 docs explicitly
// classify market endpoints as public. `BYBIT_API_KEY` / `BYBIT_API_SECRET`
// are accepted via env passthrough so the v2 stretch (Byreal Perps CLI
// execution) can reuse the same server, but v1 ignores them. The
// `BYBIT_TESTNET=1` default routes to `api-testnet.bybit.com` so a CI run
// without operator action never touches mainnet pricing.
//
// Smoke mode: `node index.js --smoke` makes a single `bybit_perp_quote`
// call for BTC-USD and exits 0/1.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { normaliseAgentSymbolToBybit } from "./symbol-mapping.mjs";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HISTORY_LIMIT = 200;
const FUNDING_INTERVAL_HOURS = 8;
const FUNDINGS_PER_YEAR = (365 * 24) / FUNDING_INTERVAL_HOURS;

// Bybit's testnet host serves identical V5 market endpoints to mainnet
// against testnet liquidity (which is itself a mirror of mainnet for
// market-data purposes). Default to testnet so a no-secret CI run can't
// accidentally pull mainnet OI into a vault's run log.
function getBaseUrl() {
  const useMainnet = String(process.env.BYBIT_TESTNET || "1").toLowerCase();
  const isTestnet = ["1", "true", "yes"].includes(useMainnet);
  return isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
}

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

async function bybitFetch(path, searchParams) {
  const base = getBaseUrl();
  const qs = new URLSearchParams(searchParams).toString();
  const url = `${base}${path}?${qs}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`);
    }
    const body = await resp.json();
    if (body?.retCode !== 0) {
      throw new Error(
        `Bybit retCode=${body?.retCode} retMsg=${String(body?.retMsg || "unknown")}`,
      );
    }
    return { body, url };
  } finally {
    clearTimeout(t);
  }
}

function annualiseFundingBps(fundingRateDecimal) {
  // Bybit returns funding as a decimal (e.g. 0.0001 = 0.01% per 8h).
  // bps per 8h = decimal * 10_000; annualised bps = bps per 8h * (365*24/8).
  const bps8h = fundingRateDecimal * 10_000;
  return { bps8h, bpsAnnualised: bps8h * (FUNDINGS_PER_YEAR / 1) };
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
    const { body, url } = await bybitFetch("/v5/market/tickers", {
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
      venue: getBaseUrl().includes("testnet") ? "bybit-testnet" : "bybit-mainnet",
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
    const { body, url } = await bybitFetch("/v5/market/funding/history", {
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
      venue: getBaseUrl().includes("testnet") ? "bybit-testnet" : "bybit-mainnet",
    });
  } catch (err) {
    return toolError("BYBIT_FETCH_FAILED", String(err?.message || err));
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "bybit", version: "1.0.0" });

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
