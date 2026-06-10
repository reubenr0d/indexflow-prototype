#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

const ATLAS_API_URL = (process.env.ATLAS_API_URL || "https://atlas.minestarters.com").replace(/\/+$/, "");
const ATLAS_API_KEY = process.env.ATLAS_API_KEY || "";
const ATLAS_AUTH_MODE = (process.env.ATLAS_AUTH_MODE || "").trim().toLowerCase();
const ATLAS_BASIC_AUTH = process.env.ATLAS_BASIC_AUTH || "";
const ATLAS_USERNAME = process.env.ATLAS_USERNAME || "";
const ATLAS_PASSWORD = process.env.ATLAS_PASSWORD || "";
const ATLAS_AUTH_HEADER_NAME = process.env.ATLAS_AUTH_HEADER_NAME || "";
const ATLAS_AUTH_HEADER_VALUE = process.env.ATLAS_AUTH_HEADER_VALUE || "";
const ATLAS_REQUEST_TIMEOUT_MS = parseInt(process.env.ATLAS_REQUEST_TIMEOUT_MS || "15000", 10);
const DEFAULT_ATLAS_API_URL = "https://atlas.minestarters.com";
const DEFAULT_ATLAS_BASIC_AUTH = "atlas:minestarters-atlas-dashboard";

// When true (default), atlas-ml verifies every derived `yahooSymbol` against
// Yahoo Finance and drops picks whose symbol does not resolve to a live quote.
// This protects downstream agents from picking up tickers like Atlas's
// `0R2O.L` (Freeport-McMoRan LSE depository line) that exist in Atlas's
// universe but Yahoo Finance does not list — `wire_asset` and `yfinance_quote`
// would otherwise reject them with INVALID_SYMBOL_POLICY every run. Set
// `ATLAS_ML_VERIFY_YAHOO=0` to disable (e.g. offline tests).
const VERIFY_YAHOO = process.env.ATLAS_ML_VERIFY_YAHOO !== "0";
const YAHOO_VERIFY_TIMEOUT_MS = parseInt(process.env.ATLAS_ML_VERIFY_TIMEOUT_MS || "4000", 10);
const YAHOO_VERIFY_TTL_MS = parseInt(process.env.ATLAS_ML_VERIFY_TTL_MS || "900000", 10); // 15 min default

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

function base64Encode(value) {
  return Buffer.from(String(value), "utf8").toString("base64");
}

function usesDefaultAtlasHost(apiUrl = ATLAS_API_URL) {
  try {
    return new URL(apiUrl).origin === DEFAULT_ATLAS_API_URL;
  } catch {
    return false;
  }
}

function resolveAtlasAuthMode(config = {}) {
  const explicitMode = (config.authMode ?? ATLAS_AUTH_MODE ?? "").trim().toLowerCase();
  if (explicitMode) return explicitMode;
  if (config.apiKey ?? ATLAS_API_KEY) return "bearer";
  if ((config.basicAuth ?? ATLAS_BASIC_AUTH) || ((config.username ?? ATLAS_USERNAME) && (config.password ?? ATLAS_PASSWORD))) {
    return "basic";
  }
  if ((config.authHeaderName ?? ATLAS_AUTH_HEADER_NAME) && (config.authHeaderValue ?? ATLAS_AUTH_HEADER_VALUE)) {
    return "header";
  }
  if (usesDefaultAtlasHost(config.apiUrl)) return "basic";
  return "none";
}

function buildAtlasAuthHeaders(config = {}) {
  const mode = resolveAtlasAuthMode(config);
  if (mode === "none") return {};

  if (mode === "bearer") {
    const apiKey = config.apiKey ?? ATLAS_API_KEY;
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  }

  if (mode === "basic") {
    const configuredBasicAuth = config.basicAuth ?? ATLAS_BASIC_AUTH;
    const username = config.username ?? ATLAS_USERNAME;
    const password = config.password ?? ATLAS_PASSWORD;
    const basicAuth = configuredBasicAuth || (!username && !password && usesDefaultAtlasHost(config.apiUrl) ? DEFAULT_ATLAS_BASIC_AUTH : "");
    if (basicAuth) {
      const token = String(basicAuth).includes(":") ? base64Encode(basicAuth) : String(basicAuth);
      return { Authorization: `Basic ${token}` };
    }
    if (username && password) return { Authorization: `Basic ${base64Encode(`${username}:${password}`)}` };
    return {};
  }

  if (mode === "header") {
    const name = config.authHeaderName ?? ATLAS_AUTH_HEADER_NAME;
    const value = config.authHeaderValue ?? ATLAS_AUTH_HEADER_VALUE;
    return name && value ? { [name]: value } : {};
  }

  return {};
}

function appendQueryParams(url, query) {
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item === undefined || item === null || item === "") continue;
          url.searchParams.append(k, String(item));
        }
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url;
}

function buildHorizonEvaluationBody(input = {}) {
  const body = {
    nan_threshold: input.nanThreshold ?? 0.95,
    persist_models: input.persistModels ?? false,
  };
  if (input.horizons !== undefined) body.horizons = input.horizons;
  if (input.featureModes !== undefined) body.feature_modes = input.featureModes;
  if (input.labelType !== undefined) body.label_type = input.labelType;
  if (input.targetType !== undefined) body.target_type = input.targetType;
  if (input.evalFrequency !== undefined) body.eval_frequency = input.evalFrequency;
  return body;
}

async function atlasRequest(path, { method = "GET", query, body } = {}) {
  const url = appendQueryParams(new URL(`${ATLAS_API_URL}${path}`), query);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ATLAS_REQUEST_TIMEOUT_MS);
  try {
    const headers = {
      Accept: "application/json",
      ...buildAtlasAuthHeaders(),
    };
    const fetchOptions = { method, headers, signal: controller.signal };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(body);
    }
    const res = await fetch(url, fetchOptions);
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`Atlas API ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
      if (res.status === 401 || res.status === 403) err.code = "ATLAS_UNAUTHORIZED";
      else err.code = res.status === 404 ? "ATLAS_NOT_FOUND" : "ATLAS_HTTP_ERROR";
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

async function atlasGet(path, query) {
  return atlasRequest(path, { method: "GET", query });
}

async function atlasPost(path, body, query) {
  return atlasRequest(path, { method: "POST", query, body });
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
  if (err.code === "ATLAS_UNAUTHORIZED") {
    return toolError(
      "ATLAS_UNAUTHORIZED",
      err.message,
      "Atlas rejected the request. Configure ATLAS_AUTH_MODE=bearer with ATLAS_API_KEY, ATLAS_AUTH_MODE=basic with ATLAS_BASIC_AUTH or ATLAS_USERNAME/ATLAS_PASSWORD, or ATLAS_AUTH_MODE=header with ATLAS_AUTH_HEADER_NAME/ATLAS_AUTH_HEADER_VALUE.",
    );
  }
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
// Yahoo symbol resolution (band-aid)
//
// Atlas's `LSE_TICKERS` universe currently contains depository / dual-listed
// names like `0R2O` (Freeport-McMoRan, also NYSE `FCX`) that Yahoo Finance
// does not list. After `buildYahooSymbol` prepends `.L`, the resulting
// `0R2O.L` does not resolve, and downstream agents repeatedly retry
// `wire_asset(0R2O.L)` which then trips the symbol-policy guard with
// `INVALID_SYMBOL_POLICY`. Filtering at the atlas-ml MCP boundary stops the
// retry loop entirely; the durable fix lives in atlas-prototype's universe
// builder (see `feature-requests/lse-ticker-yahoo-resolution.md`).
//
// Implementation note: we use Yahoo's lightweight chart-meta endpoint via
// `fetch` rather than adding a `yahoo-finance2` dep to atlas-ml so the
// package stays a thin Atlas wrapper. Results are cached for 15 minutes by
// default to avoid hammering Yahoo on every `get_ml_top_picks` call.
// ---------------------------------------------------------------------------

const _yahooCache = new Map(); // symbol -> { resolves: bool, ts: number }

async function symbolResolvesOnYahoo(symbol) {
  const sym = String(symbol || "").trim();
  if (!sym) return false;

  const cached = _yahooCache.get(sym);
  if (cached && Date.now() - cached.ts < YAHOO_VERIFY_TTL_MS) {
    return cached.resolves;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), YAHOO_VERIFY_TIMEOUT_MS);
  let resolves = false;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 atlas-ml-mcp",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      resolves = false;
    } else {
      const json = await res.json().catch(() => null);
      const result = json?.chart?.result;
      const err = json?.chart?.error;
      resolves = Array.isArray(result) && result.length > 0 && !err;
    }
  } catch {
    // Network failure or abort — treat as "unresolved" but only cache for a
    // short window so a flaky verifier doesn't poison subsequent runs.
    resolves = false;
    _yahooCache.set(sym, { resolves, ts: Date.now() - YAHOO_VERIFY_TTL_MS + 60_000 });
    clearTimeout(timeoutId);
    return resolves;
  } finally {
    clearTimeout(timeoutId);
  }

  _yahooCache.set(sym, { resolves, ts: Date.now() });
  return resolves;
}

// Filter an array of normalised picks/companies, dropping any whose
// `yahooSymbol` doesn't resolve on Yahoo. Logs each drop to stderr so CI logs
// surface non-resolving Atlas entries.
async function filterPicksByYahooResolution(picks, label = "pick") {
  if (!VERIFY_YAHOO || !Array.isArray(picks) || picks.length === 0) return picks;
  const checks = await Promise.all(
    picks.map(async (p) => {
      if (!p || !p.yahooSymbol) return { keep: false, p };
      const ok = await symbolResolvesOnYahoo(p.yahooSymbol);
      if (!ok) {
        const ticker = p.ticker ?? "?";
        const exchange = p.exchange ?? "?";
        process.stderr.write(
          `[atlas-ml] Dropped non-resolving ${label}: ${ticker}/${exchange} -> ${p.yahooSymbol}\n`,
        );
      }
      return { keep: ok, p };
    }),
  );
  return checks.filter((c) => c.keep).map((c) => c.p);
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

function normaliseShortPick(raw) {
  const pick = normalisePick(raw);
  if (!pick) return null;
  const predictedReturn = Number(pick.mlPredictedReturn);
  const absPredictedReturn = Number.isFinite(predictedReturn) ? Math.abs(predictedReturn) : null;
  return {
    ...pick,
    side: "short",
    absPredictedReturn,
  };
}

function selectShortPicks(rawPicks, { limit = 10, maxScore = 20, minAbsPredictedReturn = 0 } = {}) {
  if (!Array.isArray(rawPicks)) return [];
  const cap = Math.max(1, Math.min(50, Number(limit) || 10));
  const scoreCap = Number(maxScore);
  const minAbsReturn = Number(minAbsPredictedReturn);
  return rawPicks
    .map(normaliseShortPick)
    .filter((p) => p && p.yahooSymbol)
    .filter((p) => {
      const mlScore = Number(p.mlScore);
      const predictedReturn = Number(p.mlPredictedReturn);
      const absPredictedReturn = Number(p.absPredictedReturn);
      if (!Number.isFinite(mlScore) || !Number.isFinite(predictedReturn)) return false;
      if (predictedReturn >= 0) return false;
      if (Number.isFinite(scoreCap) && mlScore > scoreCap) return false;
      if (Number.isFinite(minAbsReturn) && absPredictedReturn < minAbsReturn) return false;
      return true;
    })
    .sort((a, b) => {
      const aAbs = Number(a.absPredictedReturn) || 0;
      const bAbs = Number(b.absPredictedReturn) || 0;
      if (bAbs !== aAbs) return bAbs - aAbs;
      return (Number(a.mlScore) || 0) - (Number(b.mlScore) || 0);
    })
    .slice(0, cap);
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

function summariseFoldMetrics(foldMetrics, limit = 5) {
  if (!Array.isArray(foldMetrics)) return { count: 0, sample: [] };
  return {
    count: foldMetrics.length,
    sample: foldMetrics.slice(0, limit),
  };
}

function normaliseMlRun(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: raw.id ?? null,
    tag: raw.tag ?? null,
    trainedAt: raw.trained_at ?? null,
    createdAt: raw.created_at ?? null,
    horizonDays: raw.horizon_days ?? null,
    targetType: raw.target_type ?? null,
    labelType: raw.label_type ?? null,
    featureMode: raw.feature_mode ?? null,
    nFeatures: raw.n_features ?? null,
    nSamples: raw.n_samples ?? null,
    nFolds: raw.n_folds ?? null,
    nanThreshold: raw.nan_threshold ?? null,
    evalFrequency: raw.eval_frequency ?? null,
    meanMae: raw.mean_mae ?? null,
    meanSpearmanIc: raw.mean_spearman_ic ?? null,
    meanHitRate: raw.mean_hit_rate ?? null,
    trainDurationSeconds: raw.train_duration_seconds ?? null,
  };
}

function normaliseHorizonCandidate(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    status: raw.status ?? null,
    experimentId: raw.experiment_id ?? null,
    createdAt: raw.created_at ?? null,
    horizonDays: raw.horizon_days ?? null,
    featureMode: raw.feature_mode ?? null,
    labelType: raw.label_type ?? null,
    targetType: raw.target_type ?? null,
    modelTag: raw.model_tag ?? null,
    nSamples: raw.n_samples ?? null,
    nFeatures: raw.n_features ?? null,
    nFolds: raw.n_folds ?? null,
    meanMae: raw.mean_mae ?? null,
    meanRmse: raw.mean_rmse ?? null,
    meanR2: raw.mean_r2 ?? null,
    meanSpearmanIc: raw.mean_spearman_ic ?? null,
    meanQuintileSpread: raw.mean_quintile_spread ?? null,
    meanHitRate: raw.mean_hit_rate ?? null,
    trainDurationSeconds: raw.train_duration_seconds ?? null,
    featuresBeforePrune: raw.features_before_prune ?? null,
    featureCoverageMeanRatio: raw.feature_coverage_mean_ratio ?? null,
    rowCoverageMeanRatio: raw.row_coverage_mean_ratio ?? null,
    coverage: raw.coverage ?? null,
    error: raw.error ?? null,
  };
}

function normaliseHorizonExperiment(raw) {
  if (!raw || typeof raw !== "object") return null;
  const results = Array.isArray(raw.results)
    ? raw.results.map(normaliseHorizonCandidate).filter(Boolean)
    : [];
  return {
    type: raw.type ?? null,
    experimentId: raw.experiment_id ?? null,
    createdAt: raw.created_at ?? null,
    settings: raw.settings ?? null,
    request: raw.request ?? null,
    count: results.length,
    results,
    recommendedCandidate: normaliseHorizonCandidate(raw.recommended_candidate),
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
      const filtered = await filterPicksByYahooResolution(picks, "pick");
      const result = {
        status,
        asOfDate: new Date().toISOString().slice(0, 10),
        count: filtered.length,
        picks: filtered,
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
      "Get a compact summary of the currently deployed or historical Atlas ML model: status, training metadata, top feature importances, score distribution, " +
      "and the bundled top predictions. Trimmed to fit in the LLM context budget (drops per-fold metrics and feature importance below the top 5). " +
      "Use this once at the start of a run to ground the agent in what the model is actually measuring. " +
      "Pass runId to inspect a historical run returned by get_ml_runs.",
    inputSchema: {
      tag: z.string().optional().default("latest").describe("Model tag to inspect when runId is omitted (default 'latest')"),
      runId: z.string().optional().describe("Historical ml_model_runs UUID to inspect"),
    },
  },
  async ({ tag, runId } = {}) => {
    try {
      const data = await atlasGet("/api/v1/dashboard/stocks/ml-model-info", {
        tag: tag ?? "latest",
        run_id: runId,
      });
      const meta = data?.metadata ?? {};
      const aggregate = meta?.aggregate_metrics ?? {};
      const featureImportance = Array.isArray(data?.feature_importance) ? data.feature_importance : [];
      const topPredictions = Array.isArray(data?.top_predictions) ? data.top_predictions : [];
      const shortPredictions = Array.isArray(data?.short_predictions) ? data.short_predictions : [];
      const normalisedPredictions = topPredictions.slice(0, 10).map(normalisePick).filter(Boolean);
      const normalisedShortPredictions = selectShortPicks(shortPredictions, { limit: 10, maxScore: 20 });
      const filteredPredictions = await filterPicksByYahooResolution(normalisedPredictions, "topPrediction");
      const filteredShortPredictions = await filterPicksByYahooResolution(normalisedShortPredictions, "shortPrediction");
      const slim = {
        status: data?.status ?? "unknown",
        isHistorical: Boolean(data?.is_historical),
        horizonDays: meta?.horizon_days ?? null,
        targetType: meta?.target_type ?? null,
        labelType: meta?.label_type ?? null,
        featureMode: meta?.feature_mode ?? null,
        nanThreshold: meta?.nan_threshold ?? null,
        evalFrequency: meta?.eval_frequency ?? null,
        trainedAt: aggregate?.trained_at ?? null,
        nFeatures: aggregate?.n_features ?? null,
        nSamples: aggregate?.n_samples ?? null,
        nFolds: aggregate?.n_folds ?? null,
        featuresBeforePrune: aggregate?.features_before_prune ?? null,
        pruned: aggregate?.pruned ?? null,
        meanMae: aggregate?.mean_mae ?? null,
        meanRmse: aggregate?.mean_rmse ?? null,
        meanR2: aggregate?.mean_r2 ?? null,
        meanSpearmanIc: aggregate?.mean_spearman_ic ?? null,
        meanHitRate: aggregate?.mean_hit_rate ?? null,
        meanQuintileSpread: aggregate?.mean_quintile_spread ?? null,
        trainDurationSeconds: aggregate?.train_duration_seconds ?? null,
        pipelineDurationSeconds: aggregate?.pipeline_duration_seconds ?? null,
        featureBuildSeconds: aggregate?.feature_build_seconds ?? null,
        droppedFeatures: Array.isArray(meta?.dropped_features) ? meta.dropped_features.slice(0, 20) : [],
        droppedFeatureCount: Array.isArray(meta?.dropped_features) ? meta.dropped_features.length : 0,
        foldMetrics: summariseFoldMetrics(meta?.fold_metrics),
        topFeatures: featureImportance.slice(0, 10).map((f) => ({
          feature: f.feature,
          importance: f.importance,
        })),
        scoreDistribution: data?.score_distribution ?? null,
        topPredictions: filteredPredictions,
        shortPredictions: filteredShortPredictions,
      };
      return { content: [{ type: "text", text: JSON.stringify(slim, null, 2) }] };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

server.registerTool(
  "get_ml_short_picks",
  {
    title: "Atlas ML Short Picks",
    description:
      "Get current mining-stock short candidates from the Atlas ML model, sourced from ml-model-info.short_predictions. " +
      "Each pick includes derived `yahooSymbol`, `side: 'short'`, and `absPredictedReturn` for comparing against long candidates. " +
      "Returns {status, asOfDate, picks: [{name, ticker, exchange, yahooSymbol, side, mlScore, mlPredictedReturn, absPredictedReturn, marketCapUsd, primaryCommodity, drillActivityScore, vaultFitTier}]}. " +
      "Only negative ml_predicted_return picks are returned; use absPredictedReturn to rank short profit potential against long mlPredictedReturn.",
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().default(10).describe("Number of short picks to return (default 10, max 50)"),
      maxScore: z.number().min(0).max(100).optional().default(20).describe("Maximum ml_score filter for shorts (default 20)"),
      minAbsPredictedReturn: z.number().min(0).optional().default(0).describe("Minimum absolute negative predicted return, decimal form (0.25 = 25%)"),
    },
  },
  async ({ limit, maxScore, minAbsPredictedReturn }) => {
    try {
      const data = await atlasGet("/api/v1/dashboard/stocks/ml-model-info");
      const status = data?.status ?? "unknown";
      const shortPredictions = Array.isArray(data?.short_predictions) ? data.short_predictions : [];
      const picks = selectShortPicks(shortPredictions, {
        limit: limit ?? 10,
        maxScore: maxScore ?? 20,
        minAbsPredictedReturn: minAbsPredictedReturn ?? 0,
      });
      const filtered = await filterPicksByYahooResolution(picks, "short pick");
      const result = {
        status,
        asOfDate: new Date().toISOString().slice(0, 10),
        source: "ml-model-info.short_predictions",
        count: filtered.length,
        picks: filtered,
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

server.registerTool(
  "get_ml_runs",
  {
    title: "Atlas ML Training Runs",
    description:
      "List recent Atlas ML training runs from the dashboard API. " +
      "Use this to inspect model freshness and pick a runId for get_ml_model_info({ runId }). " +
      "Returns {count, runs: [{id, tag, trainedAt, horizonDays, targetType, labelType, featureMode, nFeatures, nSamples, meanSpearmanIc, meanHitRate, ...}]}",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().default(10).describe("Maximum number of runs to return (default 10, max 100)"),
    },
  },
  async ({ limit } = {}) => {
    try {
      const data = await atlasGet("/api/v1/dashboard/stocks/ml-runs");
      const runs = Array.isArray(data)
        ? data.map(normaliseMlRun).filter(Boolean).slice(0, limit ?? 10)
        : [];
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ count: runs.length, runs }, null, 2),
        }],
      };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

server.registerTool(
  "get_ml_horizon_config",
  {
    title: "Atlas ML Horizon Config",
    description:
      "Return Atlas's active horizon-selection API configuration: supported horizons, feature modes, label types, defaults, and model-selection thresholds.",
    inputSchema: {},
  },
  async () => {
    try {
      const data = await atlasGet("/api/v1/ml/horizons/config");
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

server.registerTool(
  "get_ml_horizon_coverage",
  {
    title: "Atlas ML Horizon Feature Coverage",
    description:
      "Inspect current prediction feature coverage across raw/relative/absolute feature modes without retraining. " +
      "Use this to understand whether sparse features may make a horizon experiment unreliable.",
    inputSchema: {
      asOfDate: z.string().optional().describe("YYYY-MM-DD as-of date; defaults to Atlas server today"),
      featureModes: z.array(z.string()).optional().describe("Optional feature modes; repeated as feature_modes query params"),
    },
  },
  async ({ asOfDate, featureModes } = {}) => {
    try {
      const data = await atlasGet("/api/v1/ml/horizons/coverage", {
        as_of_date: asOfDate,
        feature_modes: featureModes,
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

server.registerTool(
  "get_ml_horizon_experiments",
  {
    title: "Atlas ML Horizon Experiments",
    description:
      "List persisted horizon-grid experiment summaries. These are previous non-destructive model-selection runs stored by Atlas.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().default(20).describe("Maximum number of experiments to return (default 20, max 100)"),
    },
  },
  async ({ limit } = {}) => {
    try {
      const data = await atlasGet("/api/v1/ml/horizons/experiments", { limit: limit ?? 20 });
      const items = Array.isArray(data?.items)
        ? data.items.map(normaliseHorizonExperiment).filter(Boolean)
        : [];
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ count: items.length, items }, null, 2),
        }],
      };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

server.registerTool(
  "get_ml_horizon_recommendation",
  {
    title: "Atlas ML Horizon Recommendation",
    description:
      "Return the best currently known horizon candidate from the latest Atlas horizon-grid experiment. " +
      "This is read-only and does not change the active latest model.",
    inputSchema: {},
  },
  async () => {
    try {
      const data = await atlasGet("/api/v1/ml/horizons/recommendation");
      const result = {
        settings: data?.settings ?? null,
        experimentId: data?.experiment_id ?? null,
        recommendedCandidate: normaliseHorizonCandidate(data?.recommended_candidate),
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

server.registerTool(
  "trigger_ml_horizon_evaluation",
  {
    title: "Trigger Atlas ML Horizon Evaluation",
    description:
      "Start a non-destructive Atlas horizon-grid evaluation over selected horizons and feature modes. " +
      "Defaults are read by Atlas when omitted; persistModels defaults false so the current latest model is not overwritten.",
    inputSchema: {
      horizons: z.array(z.number().int().positive()).optional().describe("Optional forward-return horizons in days"),
      featureModes: z.array(z.string()).optional().describe("Optional feature modes such as raw, relative, absolute"),
      labelType: z.string().optional().describe("Optional label type such as raw, relative, barrier"),
      targetType: z.string().optional().describe("Optional target family such as regression or classification"),
      evalFrequency: z.string().optional().describe("Optional evaluation cadence such as monthly or quarterly"),
      nanThreshold: z.number().min(0).max(1).optional().default(0.95).describe("Maximum tolerated NaN ratio before prune eligibility"),
      persistModels: z.boolean().optional().default(false).describe("Persist evaluated models under dedicated tags; never overwrites latest"),
    },
  },
  async (input = {}) => {
    try {
      const data = await atlasPost(
        "/api/v1/ml/horizons/evaluate",
        buildHorizonEvaluationBody(input),
      );
      const result = normaliseHorizonExperiment(data);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
      const filtered = await filterPicksByYahooResolution(companies, "basket entry");
      const result = {
        tag: data?.tag ?? tag ?? "latest",
        summary: data?.summary ?? {},
        count: filtered.length,
        companies: filtered,
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
      const filtered = await filterPicksByYahooResolution(companies, "thesis entry");
      const result = {
        tag: data?.tag ?? tag ?? "latest",
        anthropicModel: data?.anthropic_model ?? null,
        thesis: typeof data?.thesis === "string" ? data.thesis : null,
        summary: data?.summary ?? {},
        count: filtered.length,
        companies: filtered,
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

async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isDirectCliEntry =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectCliEntry) {
  await startServer();
}

export const __atlasMlInternals = {
  appendQueryParams,
  buildAtlasAuthHeaders,
  buildHorizonEvaluationBody,
  exchangeToYahooSuffix,
  buildYahooSymbol,
  normalisePick,
  normaliseShortPick,
  selectShortPicks,
  normaliseMlRun,
  normaliseHorizonCandidate,
  normaliseHorizonExperiment,
  httpErrorToTool,
  usesDefaultAtlasHost,
};
