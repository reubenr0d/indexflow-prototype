#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  scoreCompany,
  scoreDrillProgramType,
  pickShortRedFlags,
} from "./scoring/matrix.js";

// ---------------------------------------------------------------------------
// Config from env (mirrors atlas-ml)
// ---------------------------------------------------------------------------

const ATLAS_API_URL = (process.env.ATLAS_API_URL || "https://atlas.minestarters.com").replace(/\/+$/, "");
const ATLAS_API_KEY = process.env.ATLAS_API_KEY || "";
const ATLAS_REQUEST_TIMEOUT_MS = parseInt(process.env.ATLAS_REQUEST_TIMEOUT_MS || "15000", 10);

const __dirname = dirname(fileURLToPath(import.meta.url));
const MATRIX = JSON.parse(readFileSync(resolve(__dirname, "scoring/matrix.json"), "utf8"));
const DEPOSIT_TYPES = JSON.parse(readFileSync(resolve(__dirname, "scoring/depositTypes.json"), "utf8"));

// ---------------------------------------------------------------------------
// Exchange -> Yahoo Finance suffix map (verbatim copy from atlas-ml so the
// agent gets the same .V / .AX / .TO / .L / .CN / .JO discipline)
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
      "The Atlas endpoint may not be live or the ticker/profile is missing. Try get_quality_matrix_definition or get_quality_top_picks first.",
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
// Atlas data fetchers (defensive — accept whatever shape comes back)
// ---------------------------------------------------------------------------

async function fetchBasketUniverse({ commodity, exchange, vaultFitTier = "B+" } = {}) {
  // Atlas exposes /api/v1/dashboard/stocks/baskets — broad coverage filtered by vault_fit_tier.
  try {
    const data = await atlasGet("/api/v1/dashboard/stocks/baskets", {
      vault_fit_tier: vaultFitTier,
      primary_commodity: commodity,
      exchange,
      limit: 100,
    });
    // Atlas /dashboard/stocks/baskets currently returns a flat array
    // [{id, name, ticker, exchange, ...}]. Fall through every plausible shape.
    const items = Array.isArray(data)
      ? data
      : Array.isArray(data?.companies)
        ? data.companies
        : Array.isArray(data?.baskets)
          ? data.baskets
          : Array.isArray(data?.items)
            ? data.items
            : [];
    return items;
  } catch (err) {
    if (err.code === "ATLAS_NOT_FOUND") {
      // Fallback to the browse endpoint.
      const data = await atlasGet("/api/v1/dashboard/companies/browse", {
        primary_commodity: commodity,
        exchange,
        limit: 100,
      });
      return Array.isArray(data)
        ? data
        : Array.isArray(data?.companies)
          ? data.companies
          : Array.isArray(data?.items)
            ? data.items
            : [];
    }
    throw err;
  }
}

async function fetchCompanyProfile(ticker) {
  try {
    const data = await atlasGet(`/api/v1/dashboard/company/${encodeURIComponent(ticker)}/profile`);
    return data || {};
  } catch (err) {
    if (err.code === "ATLAS_NOT_FOUND") return null;
    throw err;
  }
}

async function fetchCompanyEvents(ticker) {
  try {
    const data = await atlasGet("/api/v1/dashboard/stocks/events", { tickers: ticker, limit: 25 });
    return Array.isArray(data?.events) ? data.events : Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.code === "ATLAS_NOT_FOUND") return [];
    throw err;
  }
}

async function fetchCompanyDrills(profile) {
  // Atlas exposes drill results on the profile payload in some shapes; also
  // try /api/v1/dashboard/drill-results/global/top-intercepts as a fallback.
  if (Array.isArray(profile?.drill_results) && profile.drill_results.length > 0) return profile.drill_results;
  if (Array.isArray(profile?.drills) && profile.drills.length > 0) return profile.drills;
  return [];
}

// ---------------------------------------------------------------------------
// Build companyContext used by scoreCompany — defensively maps Atlas fields
// to the matrix.js expected keys.
// ---------------------------------------------------------------------------

async function buildCompanyContext(rawCompany) {
  const ticker = rawCompany.ticker || rawCompany.symbol || null;
  const exchange = rawCompany.exchange || null;
  const yahooSymbol = buildYahooSymbol(ticker, exchange);
  const profile = ticker ? await fetchCompanyProfile(ticker) : {};
  const events = ticker ? await fetchCompanyEvents(ticker) : [];
  const drills = await fetchCompanyDrills(profile);

  // Atlas profile shape:
  //   {
  //     company: { name, ticker, primary_commodity, market_cap_usd, vault_fit_tier, ... },
  //     financials: [...], drill_results: [...], capital_raises: [...],
  //     resource_updates: [...], feasibility_studies: [...], permitting_events: [...],
  //     digbee_projects: [...], tenure_summary: {...}, recent_documents: [...]
  //   }
  // Older shapes inline the company fields at the top level; we tolerate both.
  const profileCompany = profile?.company || profile || {};
  const primaryCommodity = (
    rawCompany.primary_commodity ||
    profileCompany.primary_commodity ||
    ""
  ).toLowerCase();
  const depositTypes =
    profile?.deposit_types ||
    profileCompany.deposit_types ||
    rawCompany.deposit_types ||
    [];

  // Surface the structured Atlas sub-payloads as first-class context fields so
  // the matrix.js scorers can read them without re-walking `profile`.
  return {
    ticker,
    exchange,
    yahooSymbol,
    name: rawCompany.name || profileCompany.name || ticker,
    marketCapUsd: rawCompany.market_cap_usd || profileCompany.market_cap_usd || null,
    primaryCommodity,
    depositTypes,
    profile: { ...profile, ...profileCompany },
    events: events || [],
    drills: drills || [],
    feasibilityStudies: Array.isArray(profile?.feasibility_studies) ? profile.feasibility_studies : [],
    resourceUpdates: Array.isArray(profile?.resource_updates) ? profile.resource_updates : [],
    capitalRaises: Array.isArray(profile?.capital_raises) ? profile.capital_raises : [],
    permittingEvents: Array.isArray(profile?.permitting_events) ? profile.permitting_events : [],
    tenureSummary: profile?.tenure_summary || null,
    digbeeProjects: Array.isArray(profile?.digbee_projects) ? profile.digbee_projects : [],
    recentDocuments: Array.isArray(profile?.recent_documents) ? profile.recent_documents : [],
    manualScores: profile?.manual_scores || null,
  };
}

function buildPickPayload(ctx, scoreResult) {
  const composite = scoreResult.composite;
  const perCategory = composite.perCategory || {};
  return {
    ticker: ctx.ticker,
    exchange: ctx.exchange,
    yahooSymbol: ctx.yahooSymbol,
    name: ctx.name,
    primaryCommodity: ctx.primaryCommodity || null,
    marketCapUsd: ctx.marketCapUsd,
    compositeScore: composite.composite,
    tier: composite.tier,
    categoryScores: Object.fromEntries(
      Object.entries(perCategory).map(([k, v]) => [k, { score: v.score ?? null, tier: v.tier ?? "unknown", provenanceDiscounted: v.provenanceDiscounted ?? false }]),
    ),
    unknownCategoryCount: Object.values(perCategory).filter((v) => v.skipped).length,
    _explain: {
      compositeWeights: composite.weightsUsed,
      provenanceDiscount: composite.provenanceDiscount,
    },
  };
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "atlas-quality", version: "1.0.0" });

// ---------------------------------------------------------------------------
// Tool 1: get_quality_top_picks
// ---------------------------------------------------------------------------

server.registerTool(
  "get_quality_top_picks",
  {
    title: "Quality Matrix Top Picks",
    description:
      "Rank mining companies by the analyst's 8-category quality matrix (Drilling / Resources / Met / Econ / Permitting / Offtake / Capital Raises / Construction). " +
      "Filters universe via Atlas baskets (vault_fit B+ default), enriches up to 30 candidates with profile + events, scores each via matrix.json, returns the top-N by composite score. " +
      "Returns {asOfDate, count, picks: [{ticker, exchange, yahooSymbol, name, compositeScore, tier, primaryCommodity, marketCapUsd, categoryScores, unknownCategoryCount, _explain}]}. " +
      "Each composite blends per-category scores using compositeWeights from matrix.json and applies provenanceDiscount to PUBLISHED_REFERENCE_ONLY categories.",
    inputSchema: {
      limit: z.number().int().min(1).max(30).optional().default(10).describe("Number of top picks to return (default 10, max 30)."),
      minCompositeScore: z.number().min(0).max(100).optional().default(0).describe("Minimum composite score filter (default 0)."),
      commodity: z.string().optional().describe("Filter universe by primary commodity (e.g. 'gold', 'copper')."),
      exchange: z.string().optional().describe("Filter universe by exchange (e.g. 'TSX', 'ASX')."),
      watchlistOnly: z.boolean().optional().default(false).describe("If true, only score vault_fit_tier A+ / A names (default false)."),
    },
  },
  async ({ limit, minCompositeScore, commodity, exchange, watchlistOnly }) => {
    try {
      const universe = await fetchBasketUniverse({
        commodity,
        exchange,
        vaultFitTier: watchlistOnly ? "A" : "B+",
      });
      const candidates = universe.slice(0, 30);

      const picks = [];
      const errors = [];
      for (const raw of candidates) {
        try {
          const ctx = await buildCompanyContext(raw);
          if (!ctx.ticker || !ctx.yahooSymbol) continue;
          const scored = scoreCompany(MATRIX, ctx);
          const compositeScoreValue = scored.composite.composite;
          if (compositeScoreValue === null) continue;
          if (compositeScoreValue < (minCompositeScore ?? 0)) continue;
          picks.push(buildPickPayload(ctx, scored));
        } catch (err) {
          errors.push({ ticker: raw.ticker, error: err.message });
        }
      }
      picks.sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
      const trimmed = picks.slice(0, limit ?? 10);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                asOfDate: new Date().toISOString().slice(0, 10),
                count: trimmed.length,
                picks: trimmed,
                errorCount: errors.length,
                errors: errors.slice(0, 5),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Tool 2: get_quality_company_card
// ---------------------------------------------------------------------------

server.registerTool(
  "get_quality_company_card",
  {
    title: "Quality Matrix Company Card",
    description:
      "Full per-signal tier card for one company — every category, every signal, with tier, raw value, provenance, analyst caveat, source link, and matched workbook anchor. " +
      "Use this payload as `justification` content when opening positions: quote the top 2 contributing signals (e.g. 'Exceptional GT=754 (NGEx anchor); Strong Cu grade 2.25%'). " +
      "Returns {ticker, yahooSymbol, name, composite, categoryResults: {drilling, resources, ...}}.",
    inputSchema: {
      ticker: z.string().describe("Atlas ticker (e.g. 'GSR' on TSXV). Exchange suffix will be derived."),
      exchange: z.string().optional().describe("Optional Atlas exchange code; speeds up yahooSymbol resolution."),
    },
  },
  async ({ ticker, exchange }) => {
    try {
      const ctx = await buildCompanyContext({ ticker, exchange });
      if (!ctx.profile || (!ctx.profile.name && !ctx.profile.ticker)) {
        return toolError(
          "ATLAS_PROFILE_MISSING",
          `No Atlas profile found for ticker ${ticker}.`,
          "Confirm the ticker matches Atlas's symbol field (no exchange suffix); try get_quality_top_picks to see valid tickers.",
        );
      }
      const scored = scoreCompany(MATRIX, ctx);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ticker: ctx.ticker,
                yahooSymbol: ctx.yahooSymbol,
                name: ctx.name,
                exchange: ctx.exchange,
                primaryCommodity: ctx.primaryCommodity,
                marketCapUsd: ctx.marketCapUsd,
                composite: scored.composite,
                categoryResults: scored.categoryResults,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Tool 3: get_quality_matrix_definition
// ---------------------------------------------------------------------------

server.registerTool(
  "get_quality_matrix_definition",
  {
    title: "Quality Matrix Definition",
    description:
      "Returns the analyst's full quality matrix verbatim from matrix.json (or a single section). " +
      "Sections: 'drilling', 'resources', 'metallurgy', 'economicStudies', 'permitting', 'offtake', 'capitalRaises', 'construction', 'drillProgramSubRubric', 'compositeWeights', 'provenanceDiscount'. " +
      "Call this once at the start of a run so the agent reasons about tier semantics from the same source of truth the scorer uses.",
    inputSchema: {
      section: z.string().optional().describe("Optional matrix section name; omit to receive the entire matrix."),
    },
  },
  async ({ section }) => {
    if (!section) {
      return { content: [{ type: "text", text: JSON.stringify(MATRIX, null, 2) }] };
    }
    const part = MATRIX[section];
    if (part === undefined) {
      return toolError("UNKNOWN_SECTION", `Section "${section}" not found in matrix.`, "Valid sections: drilling, resources, metallurgy, economicStudies, permitting, offtake, capitalRaises, construction, drillProgramSubRubric, compositeWeights, provenanceDiscount, tierScores.");
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              section,
              analystSource: MATRIX.analystSource,
              version: MATRIX.version,
              depositTypeAdjustments: section === "drilling" ? DEPOSIT_TYPES : undefined,
              data: part,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool 4: get_quality_short_candidates
// ---------------------------------------------------------------------------

server.registerTool(
  "get_quality_short_candidates",
  {
    title: "Quality Matrix Short Candidates",
    description:
      "Scan the broader Atlas universe for Red-Flag signals in critical categories (permit refused, dilution >30%, schedule blowout, capex >140%, grade-recon shortfall, failed raise, refractory + high-penalty met). " +
      "Returns candidates suitable for short positions, each with the specific Red-Flag signal name, tier, raw value, source link from the matrix, and a citable bearish news headline if available. " +
      "Use only on names outside your current quality top-N. The agent must still pair each candidate with a citable bearish news headline in justification.",
    inputSchema: {
      limit: z.number().int().min(1).max(20).optional().default(5).describe("Max candidates to return (default 5)."),
      excludeTickers: z.array(z.string()).optional().default([]).describe("Tickers already in your top-N — exclude them from short candidates."),
    },
  },
  async ({ limit, excludeTickers }) => {
    try {
      const excludeSet = new Set((excludeTickers || []).map((t) => String(t).toUpperCase()));
      const universe = await fetchBasketUniverse({ vaultFitTier: "B+" });
      const candidates = universe.slice(0, 50).filter((c) => !excludeSet.has(String(c.ticker || "").toUpperCase()));

      const shorts = [];
      for (const raw of candidates) {
        try {
          const ctx = await buildCompanyContext(raw);
          if (!ctx.ticker || !ctx.yahooSymbol) continue;
          const scored = scoreCompany(MATRIX, ctx);
          const redFlags = pickShortRedFlags(MATRIX, scored.categoryResults);
          if (redFlags.length === 0) continue;
          shorts.push({
            ticker: ctx.ticker,
            exchange: ctx.exchange,
            yahooSymbol: ctx.yahooSymbol,
            name: ctx.name,
            primaryCommodity: ctx.primaryCommodity,
            compositeScore: scored.composite.composite,
            redFlagSignals: redFlags,
            _explain: {
              note: "Agent must pair each Red-Flag signal with a citable bearish headline before opening a short.",
              shortDirective: "Confirm the bearish signal with yfinance_news on the yahooSymbol before opening.",
            },
          });
        } catch {
          // Skip companies that error out — they're noise for the short scan.
        }
        if (shorts.length >= (limit ?? 5) * 3) break;
      }
      shorts.sort((a, b) => (a.compositeScore ?? 100) - (b.compositeScore ?? 100));
      const trimmed = shorts.slice(0, limit ?? 5);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                asOfDate: new Date().toISOString().slice(0, 10),
                count: trimmed.length,
                shortCandidates: trimmed,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return httpErrorToTool(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Optional helper tool: surface the sub-rubric directly (for debugging /
// the agent inspecting why a release classified as Exploration vs Resource).
// Hidden from the main tool list; kept for parity with the analyst's
// linked sub-sheet.
// ---------------------------------------------------------------------------

server.registerTool(
  "classify_drill_release_text",
  {
    title: "Classify Drill Release (Exploration vs Resource)",
    description:
      "Pass any drill release headline / summary text; returns the matched 58-signal sub-rubric breakdown (which phrases triggered which weights) and the final classification (exceptional/strong/moderate/weak/redFlag). " +
      "Useful when debugging why a company's Drill Program Type signal classified the way it did.",
    inputSchema: {
      text: z.string().describe("Drill release headline + summary text."),
    },
  },
  async ({ text }) => {
    const result = scoreDrillProgramType(MATRIX, text);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
