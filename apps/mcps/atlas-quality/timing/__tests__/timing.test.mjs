import test from "node:test";
import assert from "node:assert/strict";

import {
  computeSignalFreshness,
  freshnessMultiplierFromAge,
  pickFreshIntercept,
} from "../freshness.js";
import { classifyPricingIn } from "../pricing-in.js";
import {
  computeDataCompletenessMultiplier,
  computeCategoryBalanceMultiplier,
} from "../trade-ready.js";

test("freshnessMultiplierFromAge: fresh signal near 1.0, old signal decays toward floor", () => {
  assert.equal(freshnessMultiplierFromAge(10, { halfLifeDays: 90, floor: 0.4 }), 1);
  const old = freshnessMultiplierFromAge(200, { halfLifeDays: 90, floor: 0.4 });
  assert.ok(old >= 0.4 && old < 0.6);
});

test("pickFreshIntercept ignores drills outside window", () => {
  const now = Date.parse("2026-05-26");
  const drills = [
    { date: "2020-01-01", intercept_m: 100, grade: 10 },
    { date: "2026-04-01", intercept_m: 50, grade: 5 },
  ];
  const fresh = pickFreshIntercept(drills, { withinDays: 90, nowMs: now });
  assert.equal(fresh.gt, 250);
});

test("classifyPricingIn skips on spike near drill release", () => {
  const out = classifyPricingIn(
    {
      priceHistory: {
        ok: true,
        return5dPct: 10,
        return20dPct: 15,
        max1dMove30dPct: 22,
      },
      freshness: { daysSinceLastDrillRelease: 3 },
    },
    { spike1dMovePct: 15, spikeNearDrillDays: 7 },
  );
  assert.equal(out.pricedInLevel, "skip");
  assert.equal(out.pricedInPenalty, 1);
});

test("data completeness penalizes thin picks", () => {
  const pick = {
    categoryScores: {
      drilling: { score: 80, tier: "strong" },
      resources: { score: null, tier: "unknown" },
    },
  };
  const { dataCompletenessMultiplier, thinData } = computeDataCompletenessMultiplier(pick, {
    minPopulatedCategories: 3,
    thinDataMultiplier: 0.85,
  });
  assert.equal(thinData, true);
  assert.equal(dataCompletenessMultiplier, 0.85);
});

test("category balance penalizes drilling-dominated composites", () => {
  const pick = {
    compositeScore: 90,
    categoryScores: {
      drilling: { score: 95, tier: "exceptional" },
      resources: { score: 40, tier: "moderate" },
    },
    _explain: {
      compositeWeights: { drilling: 0.35, resources: 0.2, metallurgy: 0.1, economicStudies: 0.15, permitting: 0.05, offtake: 0.05, capitalRaises: 0.05, construction: 0.05 },
    },
  };
  const { categoryBalanceMultiplier, dominantCategory } = computeCategoryBalanceMultiplier(pick, {
    maxSingleCategoryShare: 0.7,
  });
  assert.equal(dominantCategory, "drilling");
  assert.ok(categoryBalanceMultiplier <= 1);
});

test("computeSignalFreshness reports freshness gap when stale >> fresh", () => {
  const ctx = {
    drills: [
      { date: "2018-06-01", intercept_m: 200, grade: 10 },
      { date: "2026-04-01", intercept_m: 20, grade: 2 },
    ],
    events: [],
    profile: {},
  };
  const f = computeSignalFreshness(ctx, { freshInterceptWindowDays: 90 });
  assert.ok(f.freshnessGap > 0.5);
  assert.ok(f.freshIntercept.gt < f.staleIntercept.gt);
});
