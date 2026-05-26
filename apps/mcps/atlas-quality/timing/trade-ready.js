import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchPriceHistory } from "../../../shared/yahoo-price-history.mjs";
import { computeSignalFreshness } from "./freshness.js";
import { classifyPricingIn } from "./pricing-in.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let _defaultConfig = null;
export function loadTimingCalibration() {
  if (_defaultConfig) return _defaultConfig;
  _defaultConfig = JSON.parse(
    readFileSync(resolve(__dirname, "timing-calibration.json"), "utf8"),
  );
  return _defaultConfig;
}

const CATEGORY_KEYS = [
  "drilling",
  "resources",
  "metallurgy",
  "economicStudies",
  "permitting",
  "offtake",
  "capitalRaises",
  "construction",
];

export function countPopulatedCategories(pick) {
  const scores = pick?.categoryScores || {};
  let count = 0;
  for (const key of CATEGORY_KEYS) {
    const entry = scores[key];
    if (!entry) continue;
    if (entry.skipped) continue;
    if (entry.score === null || entry.score === undefined) continue;
    if (String(entry.tier || "").toLowerCase() === "unknown") continue;
    count += 1;
  }
  return count;
}

/**
 * Cap drilling-heavy composites so one category cannot dominate trade rank.
 * Uses compositeWeights × category score contribution estimate.
 */
export function computeCategoryBalanceMultiplier(pick, config = {}) {
  const maxShare = Number(config.maxSingleCategoryShare ?? 0.7);
  const weights = pick?._explain?.compositeWeights || {};
  const scores = pick?.categoryScores || {};
  const contributions = [];
  for (const key of CATEGORY_KEYS) {
    const w = Number(weights[key] ?? 0);
    const s = Number(scores[key]?.score ?? 0);
    if (w <= 0 || !Number.isFinite(s)) continue;
    contributions.push({ key, share: w * s });
  }
  const total = contributions.reduce((a, c) => a + c.share, 0);
  if (total <= 0) return { categoryBalanceMultiplier: 1, dominantCategory: null, dominantShare: null };
  contributions.sort((a, b) => b.share - a.share);
  const top = contributions[0];
  const dominantShare = top.share / total;
  if (dominantShare <= maxShare) {
    return {
      categoryBalanceMultiplier: 1,
      dominantCategory: top.key,
      dominantShare,
    };
  }
  const excess = dominantShare - maxShare;
  const penalty = Math.max(0.75, 1 - excess);
  return {
    categoryBalanceMultiplier: penalty,
    dominantCategory: top.key,
    dominantShare,
  };
}

export function computeDataCompletenessMultiplier(pick, config = {}) {
  const minCats = Number(config.minPopulatedCategories ?? 3);
  const thinMult = Number(config.thinDataMultiplier ?? 0.85);
  const populated = countPopulatedCategories(pick);
  if (populated >= minCats) {
    return { dataCompletenessScore: populated / CATEGORY_KEYS.length, dataCompletenessMultiplier: 1 };
  }
  return {
    dataCompletenessScore: populated / CATEGORY_KEYS.length,
    dataCompletenessMultiplier: thinMult,
    thinData: true,
  };
}

/**
 * @param {object} pick - get_quality_top_picks row
 * @param {object} ctx - company context (optional; built if missing fields)
 * @param {object} [opts]
 */
export async function enrichPickForTradeReady(pick, ctx, opts = {}) {
  const config = { ...loadTimingCalibration(), ...opts.config };
  const freshness = computeSignalFreshness(ctx || {}, config);
  const yahooSymbol = pick?.yahooSymbol;
  const priceHistory = yahooSymbol
    ? await fetchPriceHistory(yahooSymbol, { yfClient: opts.yfClient })
    : { ok: false, error: "no_yahoo_symbol" };
  const pricingIn = classifyPricingIn({ priceHistory, freshness }, config);
  const { dataCompletenessScore, dataCompletenessMultiplier, thinData } =
    computeDataCompletenessMultiplier(pick, config);
  const { categoryBalanceMultiplier, dominantCategory, dominantShare } =
    computeCategoryBalanceMultiplier(pick, config);

  const compositeScore = Number(pick.compositeScore ?? 0);
  const maxStale = Number(config.maxStaleMaterialEventDays ?? 180);
  const daysMaterial = freshness.daysSinceLastMaterialEvent;
  const staleSignal =
    daysMaterial !== null && Number.isFinite(daysMaterial) && daysMaterial > maxStale;

  let tradeReadinessScore = compositeScore;
  tradeReadinessScore *= freshness.freshnessMultiplier;
  tradeReadinessScore *= 1 - (pricingIn.pricedInPenalty || 0);
  tradeReadinessScore *= dataCompletenessMultiplier;
  tradeReadinessScore *= categoryBalanceMultiplier;
  tradeReadinessScore = Math.round(tradeReadinessScore * 10) / 10;

  const filteredReasons = [];
  if (staleSignal) filteredReasons.push(`material_event_older_than_${maxStale}d`);
  if (pricingIn.pricedInLevel === "skip") filteredReasons.push("priced_in_skip");

  return {
    ...pick,
    timing: {
      freshness,
      priceHistory: {
        ok: priceHistory.ok,
        return5dPct: priceHistory.return5dPct,
        return20dPct: priceHistory.return20dPct,
        return60dPct: priceHistory.return60dPct,
        max1dMove30dPct: priceHistory.max1dMove30dPct,
        max1dMoveDate: priceHistory.max1dMoveDate,
        error: priceHistory.error ?? null,
      },
      pricingIn,
      dataCompletenessScore,
      dataCompletenessMultiplier,
      thinData: thinData ?? false,
      categoryBalanceMultiplier,
      dominantCategory,
      dominantShare,
    },
    tradeReadinessScore,
    tradeReady: filteredReasons.length === 0,
    filteredOut: filteredReasons.length > 0,
    filterReasons: filteredReasons,
  };
}

/**
 * Batch-enrich and filter picks for trading.
 */
export async function buildTradeReadyPicks(picks, { buildContext, config, yfClient } = {}) {
  const mergedConfig = { ...loadTimingCalibration(), ...config };
  const enriched = [];
  for (const pick of picks || []) {
    let ctx = null;
    if (typeof buildContext === "function") {
      try {
        ctx = await buildContext(pick);
      } catch {
        ctx = {};
      }
    }
    const row = await enrichPickForTradeReady(pick, ctx, { config: mergedConfig, yfClient });
    enriched.push(row);
  }
  const ready = enriched
    .filter((p) => p.tradeReady)
    .sort((a, b) => (b.tradeReadinessScore ?? 0) - (a.tradeReadinessScore ?? 0));
  const filtered = enriched.filter((p) => p.filteredOut);
  return {
    asOfDate: new Date().toISOString().slice(0, 10),
    count: ready.length,
    picks: ready,
    filteredCount: filtered.length,
    filtered: filtered.map((p) => ({
      ticker: p.ticker,
      yahooSymbol: p.yahooSymbol,
      compositeScore: p.compositeScore,
      tradeReadinessScore: p.tradeReadinessScore,
      filterReasons: p.filterReasons,
    })),
    timingConfig: mergedConfig,
  };
}
