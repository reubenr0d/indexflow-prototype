import assert from "node:assert/strict";
import test from "node:test";

import { __atlasMlInternals } from "./index.js";

const {
  appendQueryParams,
  buildAtlasAuthHeaders,
  buildHorizonEvaluationBody,
  buildYahooSymbol,
  httpErrorToTool,
  normaliseHorizonCandidate,
  normaliseMlRun,
  normaliseShortPick,
  selectShortPicks,
  usesDefaultAtlasHost,
} = __atlasMlInternals;

test("normaliseShortPick derives yahoo symbol and absolute predicted return", () => {
  const pick = normaliseShortPick({
    name: "Galantas Gold Corporation",
    ticker: "GAL",
    exchange: "TSXV",
    ml_score: 0.6,
    ml_predicted_return: -0.4493,
    market_cap_usd: 78098617.28,
    primary_commodity: "gold",
    drill_activity_score: 65,
    vault_fit_tier: "A",
  });

  assert.equal(pick.yahooSymbol, "GAL.V");
  assert.equal(pick.side, "short");
  assert.equal(pick.mlPredictedReturn, -0.4493);
  assert.equal(pick.absPredictedReturn, 0.4493);
  assert.equal(pick.primaryCommodity, "gold");
});

test("selectShortPicks filters negative-return low-score picks and ranks by profit potential", () => {
  const picks = selectShortPicks(
    [
      { ticker: "AAA", exchange: "TSX", ml_score: 2, ml_predicted_return: -0.2 },
      { ticker: "BBB", exchange: "ASX", ml_score: 1, ml_predicted_return: -0.5 },
      { ticker: "CCC", exchange: "NYSE", ml_score: 25, ml_predicted_return: -0.8 },
      { ticker: "DDD", exchange: "NASDAQ", ml_score: 3, ml_predicted_return: 0.4 },
      { ticker: "EEE", exchange: "UNKNOWN", ml_score: 2, ml_predicted_return: -0.9 },
    ],
    { limit: 2, maxScore: 20, minAbsPredictedReturn: 0.25 },
  );

  assert.deepEqual(
    picks.map((p) => p.yahooSymbol),
    ["BBB.AX"],
  );
  assert.equal(picks[0].absPredictedReturn, 0.5);
});

test("selectShortPicks uses ml score as tie-breaker after absolute predicted return", () => {
  const picks = selectShortPicks(
    [
      { ticker: "HIGH", exchange: "NYSE", ml_score: 8, ml_predicted_return: -0.4 },
      { ticker: "LOW", exchange: "NYSE", ml_score: 2, ml_predicted_return: -0.4 },
    ],
    { limit: 2, maxScore: 20 },
  );

  assert.deepEqual(
    picks.map((p) => p.yahooSymbol),
    ["LOW", "HIGH"],
  );
});

test("buildYahooSymbol keeps US tickers unsuffixed and maps mining exchanges", () => {
  assert.equal(buildYahooSymbol("AEM", "NYSE"), "AEM");
  assert.equal(buildYahooSymbol("BTO", "TSX"), "BTO.TO");
  assert.equal(buildYahooSymbol("BIG", "TSXV"), "BIG.V");
  assert.equal(buildYahooSymbol("MI6", "ASX"), "MI6.AX");
});

test("buildAtlasAuthHeaders builds bearer auth without changing the token", () => {
  assert.deepEqual(
    buildAtlasAuthHeaders({ authMode: "bearer", apiKey: "atlas-secret" }),
    { Authorization: "Bearer atlas-secret" },
  );
});

test("buildAtlasAuthHeaders builds basic auth without leaking username/password", () => {
  const headers = buildAtlasAuthHeaders({
    authMode: "basic",
    username: "agent",
    password: "p@ss",
  });

  assert.equal(headers.Authorization, `Basic ${Buffer.from("agent:p@ss").toString("base64")}`);
  assert.ok(!headers.Authorization.includes("agent:p@ss"));
});

test("buildAtlasAuthHeaders uses built-in basic auth for default Atlas host", () => {
  const headers = buildAtlasAuthHeaders({
    apiUrl: "https://atlas.minestarters.com",
  });

  assert.equal(
    headers.Authorization,
    `Basic ${Buffer.from("atlas:minestarters-atlas-dashboard").toString("base64")}`,
  );
  assert.ok(usesDefaultAtlasHost("https://atlas.minestarters.com/api/data"));
  assert.equal(usesDefaultAtlasHost("https://atlas.example.com"), false);
});

test("httpErrorToTool maps 401/403 to ATLAS_UNAUTHORIZED with auth recovery hint", () => {
  const err = new Error("Atlas API 401 Unauthorized: nginx");
  err.code = "ATLAS_UNAUTHORIZED";
  err.status = 401;

  const result = httpErrorToTool(err);
  const payload = JSON.parse(result.content[0].text);

  assert.equal(result.isError, true);
  assert.equal(payload.error_code, "ATLAS_UNAUTHORIZED");
  assert.match(payload.recovery_hint, /ATLAS_AUTH_MODE=basic/);
  assert.match(payload.recovery_hint, /ATLAS_API_KEY/);
});

test("appendQueryParams serializes arrays as repeated query params", () => {
  const url = appendQueryParams(new URL("https://atlas.example/api/v1/ml/horizons/coverage"), {
    as_of_date: "2026-06-10",
    feature_modes: ["raw", "relative"],
    empty: "",
  });

  assert.equal(
    url.toString(),
    "https://atlas.example/api/v1/ml/horizons/coverage?as_of_date=2026-06-10&feature_modes=raw&feature_modes=relative",
  );
});

test("buildHorizonEvaluationBody maps MCP camelCase input to Atlas snake_case POST body", () => {
  assert.deepEqual(
    buildHorizonEvaluationBody({
      horizons: [30, 90],
      featureModes: ["raw", "relative"],
      labelType: "relative",
      targetType: "regression",
      evalFrequency: "monthly",
      nanThreshold: 0.8,
      persistModels: true,
    }),
    {
      horizons: [30, 90],
      feature_modes: ["raw", "relative"],
      label_type: "relative",
      target_type: "regression",
      eval_frequency: "monthly",
      nan_threshold: 0.8,
      persist_models: true,
    },
  );
});

test("normaliseMlRun exposes historical run fields in agent-friendly casing", () => {
  const run = normaliseMlRun({
    id: "run-1",
    tag: "latest",
    trained_at: "2026-06-10T00:00:00",
    created_at: "2026-06-10T00:01:00",
    horizon_days: 90,
    target_type: "regression",
    label_type: "relative",
    feature_mode: "raw",
    n_features: 73,
    n_samples: 1200,
    n_folds: 8,
    nan_threshold: 0.95,
    eval_frequency: "monthly",
    mean_mae: 0.12,
    mean_spearman_ic: 0.33,
    mean_hit_rate: 0.54,
    train_duration_seconds: 81.5,
  });

  assert.deepEqual(run, {
    id: "run-1",
    tag: "latest",
    trainedAt: "2026-06-10T00:00:00",
    createdAt: "2026-06-10T00:01:00",
    horizonDays: 90,
    targetType: "regression",
    labelType: "relative",
    featureMode: "raw",
    nFeatures: 73,
    nSamples: 1200,
    nFolds: 8,
    nanThreshold: 0.95,
    evalFrequency: "monthly",
    meanMae: 0.12,
    meanSpearmanIc: 0.33,
    meanHitRate: 0.54,
    trainDurationSeconds: 81.5,
  });
});

test("normaliseHorizonCandidate exposes rich candidate metrics", () => {
  const candidate = normaliseHorizonCandidate({
    status: "ok",
    experiment_id: "exp-1",
    created_at: "2026-06-10T00:00:00",
    horizon_days: 180,
    feature_mode: "relative",
    label_type: "relative",
    target_type: "regression",
    model_tag: "regression_180d_relative_relative_exp",
    n_samples: 900,
    n_features: 42,
    n_folds: 7,
    mean_spearman_ic: 0.41,
    mean_hit_rate: 0.58,
    feature_coverage_mean_ratio: 0.72,
    row_coverage_mean_ratio: 0.66,
  });

  assert.equal(candidate.experimentId, "exp-1");
  assert.equal(candidate.horizonDays, 180);
  assert.equal(candidate.featureMode, "relative");
  assert.equal(candidate.meanSpearmanIc, 0.41);
  assert.equal(candidate.featureCoverageMeanRatio, 0.72);
});
