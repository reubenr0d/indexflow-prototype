#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

const ATLAS_API_URL = (process.env.ATLAS_API_URL || "https://atlas.minestarters.com").replace(/\/+$/, "");
const ATLAS_API_KEY = process.env.ATLAS_API_KEY || "";
const ATLAS_REQUEST_TIMEOUT_MS = parseInt(process.env.ATLAS_REQUEST_TIMEOUT_MS || "15000", 10);

// ---------------------------------------------------------------------------
// Exchange -> Yahoo Finance suffix map
//
// Atlas exposes tickers without Yahoo's exchange suffix (e.g. "GSR" on TSXV).
// wire_asset in the vault-manager MCP enforces yahoo-symbol-policy.mjs which
// rejects ambiguous unsuffixed equities, so we surface the suffixed form as
// `yahooSymbol` for the agent to use directly.
// ---------------------------------------------------------------------------

const EXCHANGE_SUFFIX_MAP = {
  ASX: ".AX",
  TSX: ".TO",
  TSXV: ".V",
  CSE: ".CN",
  LSE: ".L",
  JSE: ".JO",
  NYSE: "",
  NASDAQ: "",
  NMS: "",
  NGM: "",
  NCM: "",
};

function exchangeToYahooSuffix(exchange) {
  if (!exchange) return null;
  const key = String(exchange).trim().toUpperCase();
  if (EXCHANGE_SUFFIX_MAP[key] !== undefined) return EXCHANGE_SUFFIX_MAP[key];
  return null;
}

function buildYahooSymbol(ticker, exchange) {
  const t = String(ticker || "").trim().toUpperCase();
  if (!t) return null;
  const suffix = exchangeToYahooSuffix(exchange);
  if (suffix === null) return null;
  if (t.includes(".")) return t;
  return suffix === "" ? t : `${t}${suffix}`;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function atlasGet(path, query) {
  const url = new URL(`${ATLAS_API_URL}${path}`);
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ATLAS_REQUEST_TIMEOUT_MS);
  try {
    const headers = { Accept: "application/json" };
    if (ATLAS_API_KEY) headers.Authorization = `Bearer ${ATLAS_API_KEY}`;
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`Atlas API ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
      err.code = res.status === 404 ? "ATLAS_NOT_FOUND" : "ATLAS_HTTP_ERROR";
      err.status = res.status;
      throw err;
    }
    try {
      return JSON.parse(text);
    } catch {
      const err = new Error(`Atlas API returned non-JSON body: ${text.slice(0, 200)}`);
      err.code = "ATLAS_BAD_RESPONSE";
      throw err;
    }
  } finally {
    clearTimeout(timeoutId);
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

function httpErrorToTool(err) {
  if (err.code === "ATLAS_NOT_FOUND") {
    return toolError(
      "ATLAS_NOT_FOUND",
      err.message,
      "The Atlas ML model may not have run yet, or the endpoint path is wrong. Try get_ml_model_info first.",
    );
  }
  if (err.name === "AbortError") {
    return toolError(
      "ATLAS_TIMEOUT",
      `Atlas API timed out after ${ATLAS_REQUEST_TIMEOUT_MS}ms`,
      "Atlas may be cold-starting; retry once. If it keeps timing out, increase ATLAS_REQUEST_TIMEOUT_MS.",
    );
  }
  return toolError(err.code || "ATLAS_REQUEST_FAILED", err.message);
}

// ---------------------------------------------------------------------------
// Shape normalisers
// ---------------------------------------------------------------------------

function normalisePick(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ticker = raw.ticker ?? null;
  const exchange = raw.exchange ?? null;
  const yahooSymbol = buildYahooSymbol(ticker, exchange);
  return {
    name: raw.name ?? null,
    ticker,
    exchange,
    yahooSymbol,
    mlScore: raw.ml_score ?? null,
    mlPredictedReturn: raw.ml_predicted_return ?? null,
    marketCapUsd: raw.market_cap_usd ?? null,
    primaryCommodity: raw.primary_commodity ?? null,
    drillActivityScore: raw.drill_activity_score ?? null,
    vaultFitTier: raw.vault_fit_tier ?? null,
  };
}

function normaliseBasketCompany(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ticker = raw.ticker ?? null;
  const exchange = raw.exchange ?? null;
  return {
    id: raw.id ?? null,
    name: raw.name ?? null,
    ticker,
    exchange,
    yahooSymbol: buildYahooSymbol(ticker, exchange),
    mlScore: raw.ml_score ?? null,
    mlPredictedReturn: raw.ml_predicted_return ?? null,
    marketCapUsd: raw.market_cap_usd ?? null,
    primaryCommodity: raw.primary_commodity ?? null,
    jurisdiction: raw.jurisdiction ?? null,
    cashUsd: raw.cash_usd ?? null,
    debtUsd: raw.total_debt_usd ?? raw.debt_usd ?? null,
    enterpriseValueUsd: raw.enterprise_value_usd ?? null,
    quarterlyGaUsd: raw.quarterly_ga_usd ?? null,
  };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "atlas-ml",
  version: "1.0.0",
});

server.registerTool(
  "get_ml_top_picks",
  {
    title: "Atlas ML Top Picks",
    description:
      "Get the current top mining-stock picks from the Atlas ML model, ranked by ml_score. " +
      "Each pick includes derived `yahooSymbol` with the correct exchange suffix (e.g. 'GSR' on TSXV becomes 'GSR.V') " +
      "for direct use with wire_asset / yfinance_quote. " +
      "Returns {status, asOfDate, picks: [{name, ticker, exchange, yahooSymbol, mlScore, mlPredictedReturn, marketCapUsd, primaryCommodity, drillActivityScore, vaultFitTier}]}. " +
      "ml_score is 0-100. ml_predicted_return is a decimal (0.85 = +85% expected return over the model horizon).",
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().default(10).describe("Number of top picks to return (default 10, max 50)"),
      minScore: z.number().min(0).max(100).optional().default(0).describe("Minimum ml_score filter (default 0 = no filter)"),
    },
  },
  async ({ limit, minScore }) => {
    try {
      const data = await atlasGet("/api/v1/dashboard/stocks/ml-rankings", {
        min_score: minScore ?? 0,
        sort_by: "ml_score",
        limit: limit ?? 10,
      });
      const status = data?.status ?? "unknown";
      const companies = Array.isArray(data?.companies) ? data.companies : [];
      const picks = companies
        .map(normalisePick)
        .filter((p) => p && p.yahooSymbol);
      const result = {
        status,
        asOfDate: new Date().toISOString().slice(0, 10),
        count: picks.length,
        picks,
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

server.registerTool(
  "get_ml_model_info",
  {
    title: "Atlas ML Model Info",
    description:
      "Get a compact summary of the currently deployed Atlas ML model: status, training metadata, top feature importances, score distribution, " +
      "and the bundled top predictions. Trimmed to fit in the LLM context budget (drops per-fold metrics and feature importance below the top 5). " +
      "Use this once at the start of a run to ground the agent in what the model is actually measuring.",
    inputSchema: {},
  },
  async () => {
    try {
      const data = await atlasGet("/api/v1/dashboard/stocks/ml-model-info");
      const meta = data?.metadata ?? {};
      const featureImportance = Array.isArray(data?.feature_importance) ? data.feature_importance : [];
      const topPredictions = Array.isArray(data?.top_predictions) ? data.top_predictions : [];
      const slim = {
        status: data?.status ?? "unknown",
        isHistorical: Boolean(data?.is_historical),
        horizonDays: meta?.horizon_days ?? null,
        targetType: meta?.target_type ?? null,
        trainedAt: meta?.aggregate_metrics?.trained_at ?? null,
        nFeatures: meta?.aggregate_metrics?.n_features ?? null,
        nSamples: meta?.aggregate_metrics?.n_samples ?? null,
        meanSpearmanIc: meta?.aggregate_metrics?.mean_spearman_ic ?? null,
        meanHitRate: meta?.aggregate_metrics?.mean_hit_rate ?? null,
        meanQuintileSpread: meta?.aggregate_metrics?.mean_quintile_spread ?? null,
        topFeatures: featureImportance.slice(0, 5).map((f) => ({
          feature: f.feature,
          importance: f.importance,
        })),
        scoreDistribution: data?.score_distribution ?? null,
        topPredictions: topPredictions.slice(0, 10).map(normalisePick).filter(Boolean),
      };
      return { content: [{ type: "text", text: JSON.stringify(slim, null, 2) }] };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

server.registerTool(
  "get_ml_basket",
  {
    title: "Atlas ML Basket (enriched)",
    description:
      "Build the top-N mining basket from the Atlas ML model with financial enrichment (cash, debt, enterprise value, jurisdiction). " +
      "Heavier payload than get_ml_top_picks — prefer this only when you need EV/cash/debt context to reason about company quality. " +
      "Returns {tag, summary, companies: [{name, ticker, exchange, yahooSymbol, mlScore, mlPredictedReturn, marketCapUsd, primaryCommodity, jurisdiction, cashUsd, debtUsd, enterpriseValueUsd, quarterlyGaUsd}]}.",
    inputSchema: {
      n: z.number().int().min(1).max(50).optional().default(10).describe("Basket size (default 10)"),
      tag: z.string().optional().default("latest").describe("Model tag (default 'latest')"),
    },
  },
  async ({ n, tag }) => {
    try {
      const data = await atlasGet("/api/v1/ml/basket", { n: n ?? 10, tag: tag ?? "latest" });
      const companies = Array.isArray(data?.companies)
        ? data.companies.map(normaliseBasketCompany).filter(Boolean)
        : [];
      const result = {
        tag: data?.tag ?? tag ?? "latest",
        summary: data?.summary ?? {},
        count: companies.length,
        companies,
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

server.registerTool(
  "get_ml_thesis",
  {
    title: "Atlas ML Investment Thesis",
    description:
      "Fetch a Claude-generated investment thesis for the current top-N mining basket. " +
      "Returns {tag, thesis, summary, count, companies[]}. " +
      "This call hits an Anthropic-backed endpoint upstream — use sparingly (e.g. once per scheduled run when summarising). " +
      "If the thesis endpoint is unavailable, falls back to get_ml_basket without a thesis.",
    inputSchema: {
      n: z.number().int().min(1).max(50).optional().default(10).describe("Basket size for the thesis (default 10)"),
      tag: z.string().optional().default("latest").describe("Model tag (default 'latest')"),
    },
  },
  async ({ n, tag }) => {
    try {
      const data = await atlasGet("/api/v1/ml/thesis", { n: n ?? 10, tag: tag ?? "latest" });
      const companies = Array.isArray(data?.companies)
        ? data.companies.map(normaliseBasketCompany).filter(Boolean)
        : [];
      const result = {
        tag: data?.tag ?? tag ?? "latest",
        anthropicModel: data?.anthropic_model ?? null,
        thesis: typeof data?.thesis === "string" ? data.thesis : null,
        summary: data?.summary ?? {},
        count: companies.length,
        companies,
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
