import test from "node:test";
import assert from "node:assert/strict";
import { __agentRunnerInternals } from "./agent-runner.mjs";

const {
  parseAgentPolicy,
  computeAutoAllocationAmount,
  deriveEntryEnforcementState,
  normalizeOracleAssets,
  getEligibleMomentumVolumeAssets,
  getEligibleMlScoreAssets,
  getEligibleQualityScoreAssets,
  getActionablePicks,
  getActionableMlCandidates,
  isZeroAmountAllocation,
  validatePolicyWriteBatch,
  computeAutoRebalanceClosures,
  computeRankSwapClosures,
  computePnlBandClosures,
  parseWriteConfirmationCommand,
  pushRejectedToolResponses,
} = __agentRunnerInternals;

test("parseAgentPolicy parses enabled policy frontmatter", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 3000,
    entryMode: "momentum_volume",
    entryMomentumPctMin: 2.0,
    entryVolumeMin: 500000,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 5,
    positionSizingMode: "model_decides",
  });

  assert.equal(policy.enabled, true);
  assert.equal(policy.autoAllocateTargetBps, 3000);
  assert.equal(policy.entryMode, "momentum_volume");
  assert.equal(policy.entryMomentumPctMin, 2.0);
  assert.equal(policy.entryVolumeMin, 500000);
  assert.equal(policy.entryDirection, "long_only");
  assert.equal(policy.maxNewPositionsPerRun, 5);
  assert.equal(policy.positionSizingMode, "model_decides");
});

test("computeAutoAllocationAmount uses availableForPerp and target bps", () => {
  const amount = computeAutoAllocationAmount(
    { availableForPerp: "9950000000 [9.95e9]" },
    3000
  );
  assert.equal(amount.toString(), "2985000000");
});

test("deriveEntryEnforcementState is enforceable with available collateral", () => {
  const state = deriveEntryEnforcementState({
    accounting: { availableCollateral: "1000000" },
    openPositions: [],
  });

  assert.equal(state.enforceable, true);
  assert.equal(state.availableCollateral, 1000000n);
  assert.equal(state.openPositionCount, 0);
  assert.equal(state.blockedReason, null);
});

test("deriveEntryEnforcementState is enforceable with an open position", () => {
  const state = deriveEntryEnforcementState({
    accounting: { availableCollateral: "0" },
    openPositions: [{ exists: true, symbol: "BHP" }],
  });

  assert.equal(state.enforceable, true);
  assert.equal(state.availableCollateral, 0n);
  assert.equal(state.openPositionCount, 1);
  assert.equal(state.blockedReason, null);
});

test("deriveEntryEnforcementState blocks empty vault entry enforcement", () => {
  const state = deriveEntryEnforcementState({
    accounting: { availableCollateral: "0" },
    openPositions: [],
  });

  assert.equal(state.enforceable, false);
  assert.equal(state.availableCollateral, 0n);
  assert.equal(state.openPositionCount, 0);
  assert.equal(state.blockedReason, "no_available_collateral_or_open_positions");
});

test("deriveEntryEnforcementState is conservative before snapshot fetch", () => {
  const state = deriveEntryEnforcementState(null);

  assert.equal(state.enforceable, true);
  assert.equal(state.availableCollateral, null);
  assert.equal(state.openPositionCount, null);
  assert.equal(state.blockedReason, null);
});

test("getEligibleMomentumVolumeAssets filters to tracked assets that pass thresholds", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 3000,
    entryMode: "momentum_volume",
    entryMomentumPctMin: 2.0,
    entryVolumeMin: 500000,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 5,
    positionSizingMode: "model_decides",
  });

  const vaultState = {
    assets: ["0xasset1", "0xasset2"],
  };
  const oracleAssets = {
    assets: [
      { assetId: "0xasset1", symbol: "BHP" },
      { assetId: "0xasset2", symbol: "HL" },
      { assetId: "0xasset3", symbol: "ZZZ" },
    ],
  };
  const quotes = [
    { symbol: "BHP", dayChangePct: 2.3, volume: 900000 },
    { symbol: "HL", dayChangePct: 1.2, volume: 2000000 },
    { symbol: "ZZZ", dayChangePct: 3.0, volume: 3000000 },
  ];

  const eligible = getEligibleMomentumVolumeAssets({
    policy,
    vaultState,
    oracleAssets,
    quotes,
  });

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].assetId, "0xasset1");
  assert.equal(eligible[0].symbol, "BHP");
});

test("validatePolicyWriteBatch rejects short and over-limit open batches", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 3000,
    entryMode: "momentum_volume",
    entryMomentumPctMin: 2.0,
    entryVolumeMin: 500000,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 2,
    positionSizingMode: "model_decides",
  });

  const shortViolation = validatePolicyWriteBatch({
    policy,
    opensExecutedSoFar: 0,
    eligibleAssets: [{ assetId: "0xasset1", symbol: "BHP" }],
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        { originalName: "open_position", args: { isLong: false, assetId: "0xasset1" } },
      ],
    },
  });
  assert.match(shortViolation, /only long positions/);

  const overLimitViolation = validatePolicyWriteBatch({
    policy,
    opensExecutedSoFar: 1,
    eligibleAssets: [{ assetId: "0xasset1", symbol: "BHP" }],
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        { originalName: "open_position", args: { isLong: true, assetId: "0xasset1" } },
        { originalName: "open_position", args: { isLong: true, assetId: "0xasset1" } },
      ],
    },
  });
  assert.match(overLimitViolation, /maxNewPositionsPerRun=2/);
});

test("parseAgentPolicy parses ml_score frontmatter with tracked-asset cap", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 90,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 5,
    maxTrackedAssets: 10,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });

  assert.equal(policy.enabled, true);
  assert.equal(policy.entryMode, "ml_score");
  assert.equal(policy.entryMlScoreMin, 90);
  assert.equal(policy.maxTrackedAssets, 10);
  assert.equal(policy.rebalanceMode, "track_top_n");
  assert.equal(policy.positionSizingMode, "equal_weight");
});

test("getEligibleMlScoreAssets matches tracked oracle assets by Yahoo symbol", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 90,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 5,
    maxTrackedAssets: 10,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });

  const vaultState = {
    assets: ["0xasset1", "0xasset2", "0xasset3"],
  };
  const oracleAssets = {
    assets: [
      { assetId: "0xasset1", symbol: "GSR.V" },
      { assetId: "0xasset2", symbol: "AHR.V" },
      { assetId: "0xasset3", symbol: "PWM.V" },
      { assetId: "0xasset4", symbol: "EEE.L" },
    ],
  };
  const mlPicks = [
    { yahooSymbol: "GSR.V", mlScore: 99.9, mlPredictedReturn: 0.84, primaryCommodity: "gold" },
    { yahooSymbol: "AHR.V", mlScore: 75.0, mlPredictedReturn: 0.3, primaryCommodity: "diversified metals" },
    { yahooSymbol: "PWM.V", mlScore: 92.0, mlPredictedReturn: 0.5, primaryCommodity: "diversified metals" },
    { yahooSymbol: "EEE.L", mlScore: 95.0, mlPredictedReturn: 0.6, primaryCommodity: "diversified metals" },
  ];

  const eligible = getEligibleMlScoreAssets({ policy, vaultState, oracleAssets, mlPicks });

  // EEE.L not tracked by vault, AHR.V below score threshold => only GSR.V and PWM.V.
  assert.equal(eligible.length, 2);
  const ids = eligible.map((e) => e.assetId).sort();
  assert.deepEqual(ids, ["0xasset1", "0xasset3"]);
  const gsr = eligible.find((e) => e.symbol === "GSR.V");
  assert.equal(gsr.mlScore, 99.9);
  assert.equal(gsr.primaryCommodity, "gold");
});

test("getEligibleMlScoreAssets caps results at maxTrackedAssets", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 0,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 5,
    maxTrackedAssets: 2,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });

  const vaultState = { assets: ["0xa", "0xb", "0xc"] };
  const oracleAssets = {
    assets: [
      { assetId: "0xa", symbol: "AAA.V" },
      { assetId: "0xb", symbol: "BBB.V" },
      { assetId: "0xc", symbol: "CCC.V" },
    ],
  };
  const mlPicks = [
    { yahooSymbol: "AAA.V", mlScore: 99 },
    { yahooSymbol: "BBB.V", mlScore: 95 },
    { yahooSymbol: "CCC.V", mlScore: 91 },
  ];

  const eligible = getEligibleMlScoreAssets({ policy, vaultState, oracleAssets, mlPicks });
  assert.equal(eligible.length, 2);
  assert.equal(eligible[0].symbol, "AAA.V");
  assert.equal(eligible[1].symbol, "BBB.V");
});

test("validatePolicyWriteBatch uses Atlas ML wording when entryMode is ml_score", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 90,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 5,
    maxTrackedAssets: 10,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });

  const violation = validatePolicyWriteBatch({
    policy,
    opensExecutedSoFar: 0,
    eligibleAssets: [],
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        { originalName: "open_position", args: { isLong: true, assetId: "0xZ" } },
      ],
    },
  });
  assert.match(violation, /Atlas ML score/);
});

test("parseWriteConfirmationCommand defaults empty input to approve", () => {
  assert.deepEqual(parseWriteConfirmationCommand(""), {
    input: "",
    command: "approve",
  });
  assert.deepEqual(parseWriteConfirmationCommand("   "), {
    input: "",
    command: "approve",
  });
  assert.deepEqual(parseWriteConfirmationCommand("reject"), {
    input: "reject",
    command: "reject",
  });
});

// ---------------------------------------------------------------------------
// long_short / short_only direction support
// ---------------------------------------------------------------------------

test("parseAgentPolicy accepts entryDirection: long_short with maxNewShortsPerRun", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });
  assert.equal(policy.entryDirection, "long_short");
  assert.equal(policy.maxNewShortsPerRun, 1);
});

test("parseAgentPolicy accepts entryDirection: short_only", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 3000,
    entryMode: "none",
    entryDirection: "short_only",
    maxNewPositionsPerRun: 2,
    maxNewShortsPerRun: 2,
  });
  assert.equal(policy.entryDirection, "short_only");
});

test("parseAgentPolicy rejects unknown entryDirection", () => {
  assert.throws(
    () =>
      parseAgentPolicy({
        autoAllocateTargetBps: 5000,
        entryMode: "ml_score",
        entryDirection: "double_long",
        maxNewPositionsPerRun: 3,
      }),
    /Invalid entryDirection/,
  );
});

test("parseAgentPolicy rejects maxNewShortsPerRun > maxNewPositionsPerRun", () => {
  assert.throws(
    () =>
      parseAgentPolicy({
        autoAllocateTargetBps: 5000,
        entryMode: "ml_score",
        entryDirection: "long_short",
        maxNewPositionsPerRun: 2,
        maxNewShortsPerRun: 3,
      }),
    /maxNewShortsPerRun.*<= maxNewPositionsPerRun/,
  );
});

test("parseAgentPolicy rejects maxNewShortsPerRun > 0 in long_only mode", () => {
  assert.throws(
    () =>
      parseAgentPolicy({
        autoAllocateTargetBps: 5000,
        entryMode: "ml_score",
        entryDirection: "long_only",
        maxNewPositionsPerRun: 3,
        maxNewShortsPerRun: 1,
      }),
    /must be 0 when entryDirection is 'long_only'/,
  );
});

test("validatePolicyWriteBatch allows a mixed long+short batch in long_short mode", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });

  const result = validatePolicyWriteBatch({
    policy,
    opensExecutedSoFar: 0,
    shortOpensExecutedSoFar: 0,
    eligibleAssets: [
      { assetId: "0xLONG1", symbol: "GSR.V" },
      { assetId: "0xLONG2", symbol: "PWM.V" },
    ],
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        { originalName: "open_position", args: { isLong: true, assetId: "0xLONG1" } },
        { originalName: "open_position", args: { isLong: false, assetId: "0xSHORT1" } },
      ],
    },
  });
  assert.equal(result, null);
});

test("validatePolicyWriteBatch in long_short mode rejects a long open outside the eligible set", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });

  const result = validatePolicyWriteBatch({
    policy,
    opensExecutedSoFar: 0,
    shortOpensExecutedSoFar: 0,
    eligibleAssets: [{ assetId: "0xLONG1", symbol: "GSR.V" }],
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        { originalName: "open_position", args: { isLong: true, assetId: "0xUNKNOWN" } },
      ],
    },
  });
  assert.match(result, /long open_position assetId is not in the current eligible set/);
});

test("validatePolicyWriteBatch in long_short mode enforces the short cap", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });

  const result = validatePolicyWriteBatch({
    policy,
    opensExecutedSoFar: 0,
    shortOpensExecutedSoFar: 1,
    eligibleAssets: [{ assetId: "0xLONG1", symbol: "GSR.V" }],
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        { originalName: "open_position", args: { isLong: false, assetId: "0xSHORT2" } },
      ],
    },
  });
  assert.match(result, /maxNewShortsPerRun=1/);
});

test("validatePolicyWriteBatch in short_only mode rejects long opens and skips long-eligibility check", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 3000,
    entryMode: "none",
    entryDirection: "short_only",
    maxNewPositionsPerRun: 2,
    maxNewShortsPerRun: 2,
  });

  const longViolation = validatePolicyWriteBatch({
    policy,
    opensExecutedSoFar: 0,
    shortOpensExecutedSoFar: 0,
    eligibleAssets: [],
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        { originalName: "open_position", args: { isLong: true, assetId: "0xL" } },
      ],
    },
  });
  assert.match(longViolation, /only short positions/);

  const okShortBatch = validatePolicyWriteBatch({
    policy,
    opensExecutedSoFar: 0,
    shortOpensExecutedSoFar: 0,
    eligibleAssets: [],
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        { originalName: "open_position", args: { isLong: false, assetId: "0xS1" } },
      ],
    },
  });
  assert.equal(okShortBatch, null);
});

test("validatePolicyWriteBatch rejects shorts when marketRegime.shortPenalty >= 2", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 4,
    maxNewShortsPerRun: 2,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });

  const violation = validatePolicyWriteBatch({
    policy,
    opensExecutedSoFar: 0,
    shortOpensExecutedSoFar: 0,
    eligibleAssets: [{ assetId: "0xLONG1", symbol: "GSR.V" }],
    marketRegime: {
      regime: "metals_risk_on",
      shortPenalty: 2,
      summary: "metals_risk_on (XME: +3.40%, GDX: +2.80%)",
    },
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        { originalName: "open_position", args: { isLong: false, assetId: "0xSHORT1" } },
      ],
    },
  });
  assert.match(violation, /shortPenalty=2/);
  assert.match(violation, /SHORT_BLOCKED_BY_REGIME/);
});

test("validatePolicyWriteBatch allows shorts when marketRegime.shortPenalty === 1", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 4,
    maxNewShortsPerRun: 2,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });
  const result = validatePolicyWriteBatch({
    policy,
    opensExecutedSoFar: 0,
    shortOpensExecutedSoFar: 0,
    eligibleAssets: [],
    marketRegime: { regime: "metals_neutral", shortPenalty: 1 },
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        { originalName: "open_position", args: { isLong: false, assetId: "0xS1" } },
      ],
    },
  });
  // Caution-only at shortPenalty=1; nothing else trips here because the
  // direction is long_short and we don't fail without a long open in the batch.
  assert.equal(result, null);
});

test("validatePolicyWriteBatch ignores regime when marketRegime is null (back-compat)", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 4,
    maxNewShortsPerRun: 2,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });
  const result = validatePolicyWriteBatch({
    policy,
    opensExecutedSoFar: 0,
    shortOpensExecutedSoFar: 0,
    eligibleAssets: [],
    // marketRegime omitted entirely
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        { originalName: "open_position", args: { isLong: false, assetId: "0xS1" } },
      ],
    },
  });
  assert.equal(result, null);
});

test("computeAutoRebalanceClosures in long_short mode does not close shorts outside the ML top-N", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });

  const positions = [
    { exists: true, isLong: true, symbol: "GSR.V", assetId: "0xLONG_KEEP" },
    { exists: true, isLong: true, symbol: "DROPPED.V", assetId: "0xLONG_DROP" },
    { exists: true, isLong: false, symbol: "BADCO.V", assetId: "0xSHORT" },
  ];
  const eligibleSymbols = ["GSR.V", "PWM.V"];

  const closures = computeAutoRebalanceClosures({
    policy,
    positions,
    eligibleSymbols,
    minScore: 85,
    cap: 12,
  });

  assert.equal(closures.length, 1);
  assert.equal(closures[0].pos.assetId, "0xLONG_DROP");
  assert.match(closures[0].reason, /dropped from ML top-12/);
});

test("computeAutoRebalanceClosures in long_only mode still closes any short leg", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 3,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });

  const positions = [
    { exists: true, isLong: false, symbol: "GSR.V", assetId: "0xSHORT_LEG" },
    { exists: true, isLong: true, symbol: "GSR.V", assetId: "0xLONG_KEEP" },
  ];
  const eligibleSymbols = ["GSR.V"];

  const closures = computeAutoRebalanceClosures({
    policy,
    positions,
    eligibleSymbols,
    minScore: 85,
    cap: 12,
  });

  assert.equal(closures.length, 1);
  assert.equal(closures[0].pos.assetId, "0xSHORT_LEG");
  assert.match(closures[0].reason, /closing short leg/);
});

// ---------------------------------------------------------------------------
// quality_score (Quality Matrix) entry mode
// ---------------------------------------------------------------------------

test("parseAgentPolicy accepts entryMode: quality_score with entryQualityScoreMin", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "quality_score",
    entryQualityScoreMin: 75,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });
  assert.equal(policy.entryMode, "quality_score");
  assert.equal(policy.entryQualityScoreMin, 75);
  assert.equal(policy.rebalanceMode, "track_top_n");
});

test("parseAgentPolicy rejects entryQualityScoreMin > 100", () => {
  assert.throws(
    () =>
      parseAgentPolicy({
        autoAllocateTargetBps: 5000,
        entryMode: "quality_score",
        entryQualityScoreMin: 150,
        entryDirection: "long_only",
        maxNewPositionsPerRun: 3,
      }),
    /Invalid entryQualityScoreMin/,
  );
});

test("getEligibleQualityScoreAssets matches tracked oracle assets by Yahoo symbol", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "quality_score",
    entryQualityScoreMin: 75,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });
  const vaultState = { assets: ["0xa", "0xb", "0xc"] };
  const oracleAssets = {
    assets: [
      { assetId: "0xa", symbol: "GSR.V" },
      { assetId: "0xb", symbol: "PWM.V" },
      { assetId: "0xc", symbol: "OOO.V" },
      { assetId: "0xd", symbol: "EEE.L" },
    ],
  };
  const qualityPicks = [
    { yahooSymbol: "GSR.V", compositeScore: 92, tier: "exceptional", primaryCommodity: "gold" },
    { yahooSymbol: "PWM.V", compositeScore: 78, tier: "strong", primaryCommodity: "copper" },
    { yahooSymbol: "OOO.V", compositeScore: 60, tier: "moderate", primaryCommodity: "silver" },
    { yahooSymbol: "EEE.L", compositeScore: 88, tier: "strong", primaryCommodity: "uranium" },
  ];

  const eligible = getEligibleQualityScoreAssets({ policy, vaultState, oracleAssets, qualityPicks });
  // OOO.V drops out (composite < 75); EEE.L not tracked by vault.
  assert.equal(eligible.length, 2);
  const ids = eligible.map((e) => e.assetId).sort();
  assert.deepEqual(ids, ["0xa", "0xb"]);
  const gsr = eligible.find((e) => e.symbol === "GSR.V");
  assert.equal(gsr.compositeScore, 92);
  assert.equal(gsr.tier, "exceptional");
});

test("getEligibleQualityScoreAssets caps results at maxTrackedAssets", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "quality_score",
    entryQualityScoreMin: 0,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 5,
    maxTrackedAssets: 2,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });
  const vaultState = { assets: ["0xa", "0xb", "0xc"] };
  const oracleAssets = {
    assets: [
      { assetId: "0xa", symbol: "AAA.V" },
      { assetId: "0xb", symbol: "BBB.V" },
      { assetId: "0xc", symbol: "CCC.V" },
    ],
  };
  const qualityPicks = [
    { yahooSymbol: "AAA.V", compositeScore: 99 },
    { yahooSymbol: "BBB.V", compositeScore: 95 },
    { yahooSymbol: "CCC.V", compositeScore: 91 },
  ];
  const eligible = getEligibleQualityScoreAssets({ policy, vaultState, oracleAssets, qualityPicks });
  assert.equal(eligible.length, 2);
  assert.equal(eligible[0].symbol, "AAA.V");
  assert.equal(eligible[1].symbol, "BBB.V");
});

test("validatePolicyWriteBatch in quality_score mode uses 'Quality Matrix composite score' wording", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "quality_score",
    entryQualityScoreMin: 75,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 3,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });

  const violation = validatePolicyWriteBatch({
    policy,
    opensExecutedSoFar: 0,
    shortOpensExecutedSoFar: 0,
    eligibleAssets: [],
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        { originalName: "open_position", args: { isLong: true, assetId: "0xZ" } },
      ],
    },
  });
  assert.match(violation, /Quality Matrix composite score/);
});

// Regression test for the 2026-05-22 quality-matrix-manager crash:
//   "An assistant message with 'tool_calls' must be followed by tool
//    messages responding to each 'tool_call_id'. The following
//    tool_call_ids did not have response messages: call_..."
//
// The pre-LLM policy guards (bad allocate_to_perp amount=0 and
// validatePolicyWriteBatch violations) push `choice.message` (which carries
// `tool_calls`) and then a `role: "user"` directive. Without a matching
// `role: "tool"` response per `tool_call_id`, the next chatCompletion
// rejects with HTTP 400. `pushRejectedToolResponses` must emit one tool
// response per pending tool_call_id so the conversation stays valid.
test("pushRejectedToolResponses preserves OpenAI tool_call_id invariant after a policy rejection", () => {
  const messages = [
    { role: "system", content: "You are an agent." },
    { role: "user", content: "Manage the vault." },
  ];

  const assistantMessage = {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call_alpha",
        type: "function",
        function: { name: "open_position", arguments: "{}" },
      },
      {
        id: "call_beta",
        type: "function",
        function: { name: "allocate_to_perp", arguments: "{}" },
      },
    ],
  };

  messages.push(assistantMessage);
  pushRejectedToolResponses(
    messages,
    assistantMessage.tool_calls,
    "Policy violation: example reason for the regression test.",
  );
  messages.push({ role: "user", content: "Revise your tool calls." });

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !Array.isArray(msg.tool_calls) || msg.tool_calls.length === 0) {
      continue;
    }
    const pendingIds = msg.tool_calls.map((tc) => tc.id);
    const respondedIds = [];
    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j];
      if (next.role === "tool" && typeof next.tool_call_id === "string") {
        respondedIds.push(next.tool_call_id);
        continue;
      }
      break;
    }
    assert.deepEqual(
      respondedIds,
      pendingIds,
      `assistant message at index ${i} must be followed by tool responses for each tool_call_id in order`,
    );
  }

  const toolMessages = messages.filter((m) => m.role === "tool");
  assert.equal(toolMessages.length, 2, "exactly one tool response per pending tool_call_id");
  for (const tm of toolMessages) {
    const payload = JSON.parse(tm.content);
    assert.equal(payload.success, false);
    assert.equal(payload.rejected, true);
    assert.match(payload.reason, /Policy violation/);
  }
});

test("pushRejectedToolResponses is a no-op when there are no pending tool calls", () => {
  const messages = [{ role: "user", content: "hi" }];
  pushRejectedToolResponses(messages, undefined, "n/a");
  pushRejectedToolResponses(messages, [], "n/a");
  pushRejectedToolResponses(messages, [{ id: "" }, { id: null }, null], "n/a");
  assert.equal(messages.length, 1);
});

test("computeAutoRebalanceClosures in quality_score mode references the Quality top-N in reason text", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "quality_score",
    entryQualityScoreMin: 75,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });
  const positions = [
    { exists: true, isLong: true, symbol: "GSR.V", assetId: "0xLONG_KEEP" },
    { exists: true, isLong: true, symbol: "DROPPED.V", assetId: "0xLONG_DROP" },
  ];
  const eligibleSymbols = ["GSR.V"];

  const closures = computeAutoRebalanceClosures({
    policy,
    positions,
    eligibleSymbols,
    minScore: 75,
    cap: 12,
    signalLabel: "Quality top",
  });

  assert.equal(closures.length, 1);
  assert.equal(closures[0].pos.assetId, "0xLONG_DROP");
  assert.match(closures[0].reason, /Quality top-12/);
});

test("computeAutoRebalanceClosures in short_only mode closes any long leg", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 3000,
    entryMode: "none",
    entryDirection: "short_only",
    maxNewPositionsPerRun: 2,
    maxNewShortsPerRun: 2,
  });

  const positions = [
    { exists: true, isLong: true, symbol: "GSR.V", assetId: "0xLONG_LEG" },
    { exists: true, isLong: false, symbol: "BADCO.V", assetId: "0xSHORT_KEEP" },
  ];

  const closures = computeAutoRebalanceClosures({
    policy,
    positions,
    eligibleSymbols: [],
    minScore: 0,
    cap: 12,
  });

  assert.equal(closures.length, 1);
  assert.equal(closures[0].pos.assetId, "0xLONG_LEG");
  assert.match(closures[0].reason, /closing long leg/);
});

test("getActionablePicks returns score-passing quality picks regardless of tracked status", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "quality_score",
    entryQualityScoreMin: 75,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
  });

  const picks = [
    { yahooSymbol: "AYM.AX", compositeScore: 90, tier: "Exceptional" },
    { yahooSymbol: "GRSL.V", compositeScore: 85, tier: "Strong" },
    { yahooSymbol: "LOWSCORE.V", compositeScore: 50, tier: "Moderate" },
    { yahooSymbol: "", compositeScore: 95, tier: "Exceptional" },
    null,
    { yahooSymbol: "DUPE.V", compositeScore: 80, tier: "Strong" },
    { yahooSymbol: "DUPE.V", compositeScore: 81, tier: "Strong" },
  ];

  const actionable = getActionablePicks({ policy, picks });

  assert.deepEqual(
    actionable.map((p) => p.yahooSymbol),
    ["AYM.AX", "GRSL.V", "DUPE.V"],
  );
  assert.equal(actionable[0].score, 90);
  assert.equal(actionable[0].tier, "Exceptional");
});

test("getActionablePicks caps at maxTrackedAssets for quality picks", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "quality_score",
    entryQualityScoreMin: 50,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 2,
  });

  const picks = [
    { yahooSymbol: "A.V", compositeScore: 90 },
    { yahooSymbol: "B.V", compositeScore: 80 },
    { yahooSymbol: "C.V", compositeScore: 70 },
  ];

  const actionable = getActionablePicks({ policy, picks });

  assert.equal(actionable.length, 2);
  assert.deepEqual(
    actionable.map((p) => p.yahooSymbol),
    ["A.V", "B.V"],
  );
});

test("getActionablePicks returns score-passing ML picks ignoring tracked status", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 3000,
    entryMode: "ml_score",
    entryMlScoreMin: 75,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 3,
    maxTrackedAssets: 10,
  });

  const picks = [
    { yahooSymbol: "AHR.V", mlScore: 99.5 },
    { yahooSymbol: "GSR.V", mlScore: 75.0 },
    { yahooSymbol: "BELOW.V", mlScore: 50.0 },
  ];

  const actionable = getActionablePicks({ policy, picks });

  assert.deepEqual(
    actionable.map((p) => p.yahooSymbol),
    ["AHR.V", "GSR.V"],
  );
});

test("getActionablePicks returns [] for non-score entry modes", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 3000,
    entryMode: "momentum_volume",
    entryMomentumPctMin: 2.0,
    entryVolumeMin: 500000,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 3,
  });

  const actionable = getActionablePicks({
    policy,
    picks: [{ yahooSymbol: "FOO.V", compositeScore: 90 }],
  });

  assert.deepEqual(actionable, []);
});

test("getActionablePicks returns [] when picks is null/undefined", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "quality_score",
    entryQualityScoreMin: 75,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
  });

  assert.deepEqual(getActionablePicks({ policy, picks: null }), []);
  assert.deepEqual(getActionablePicks({ policy, picks: undefined }), []);
  assert.deepEqual(getActionablePicks({ policy }), []);
});

// ---------------------------------------------------------------------------
// normalizeOracleAssets + compact-mode eligibility regression
//
// Pins the fix for the 2026-05-22 mining-manager loop: when the LLM called
// `get_oracle_assets({ compact: true })`, the response omitted `assets[]`
// entirely and the three eligibility helpers short-circuited to `[]` for
// the whole run, which kept the `needsRoll` enforcement branch firing
// every turn and burned 7 redundant `set_vault_assets` transactions.
// ---------------------------------------------------------------------------

test("normalizeOracleAssets returns assets[] verbatim when present (non-compact response)", () => {
  const list = normalizeOracleAssets({
    count: 2,
    summary: { symbols: ["BHP.AX", "AHR.V"] },
    assets: [
      { index: 0, assetId: "0xa", symbol: "BHP.AX", price: "1" },
      { index: 1, assetId: "0xb", symbol: "AHR.V", price: "2" },
    ],
  });
  assert.equal(list.length, 2);
  assert.equal(list[0].symbol, "BHP.AX");
  assert.equal(list[1].assetId, "0xb");
});

test("normalizeOracleAssets projects summary.symbolToAssetId when assets[] is absent (compact response)", () => {
  const list = normalizeOracleAssets({
    count: 3,
    summary: {
      symbols: ["BHP.AX", "AHR.V", "GSR.V"],
      activeSymbols: ["BHP.AX", "AHR.V", "GSR.V"],
      symbolToAssetId: {
        "BHP.AX": "0xaaa",
        "AHR.V": "0xbbb",
        "GSR.V": "0xccc",
      },
    },
  });
  assert.equal(list.length, 3);
  const map = Object.fromEntries(list.map((a) => [a.symbol, a.assetId]));
  assert.equal(map["BHP.AX"], "0xaaa");
  assert.equal(map["AHR.V"], "0xbbb");
  assert.equal(map["GSR.V"], "0xccc");
});

test("normalizeOracleAssets returns null when neither shape is usable", () => {
  assert.equal(normalizeOracleAssets(null), null);
  assert.equal(normalizeOracleAssets(undefined), null);
  assert.equal(normalizeOracleAssets({ count: 0 }), null);
  assert.equal(normalizeOracleAssets({ summary: {} }), null);
  assert.equal(normalizeOracleAssets({ summary: { symbolToAssetId: null } }), null);
});

test("normalizeOracleAssets drops symbol/assetId entries that are missing or empty", () => {
  const list = normalizeOracleAssets({
    summary: {
      symbolToAssetId: {
        "AHR.V": "0xaaa",
        "": "0xbbb",
        "BAD.V": "",
        "GSR.V": "0xccc",
      },
    },
  });
  assert.equal(list.length, 2);
  assert.deepEqual(
    list.map((a) => a.symbol).sort(),
    ["AHR.V", "GSR.V"],
  );
});

test("getEligibleMlScoreAssets works against a compact get_oracle_assets response", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
  });

  // Exact tracked-asset set from the 2026-05-22T22:58:50 mining-manager run
  // (after set_vault_assets succeeded on turn 5).
  const trackedAssetIds = [
    "0x7557d8b4b2347d33b4ebf35476c1a988024bfdc83b89ea7aa4d85372a4ddd1f6", // AHR.V
    "0x165172deb918184492c76b77c8e69f07dbdddeb00d99acd1a720b31adaa72245", // GSR.V
    "0x3343b81aa26c772d76db082011ee4340ce75e9dd86ce00965dce81d10be6122d", // PWM.V
    "0xcb6c73b659a7080d37020bf99df803ff73df4164dde6afd39b4867f1518cf206", // 0KXS.L
    "0xc046404b0803dafd50388584d33c83661011a555f6bfac862d8d00d515a6b2de", // VGZ.TO
  ];
  const vaultState = { assets: trackedAssetIds };

  const oracleAssetsCompact = {
    count: 5,
    summary: {
      symbols: ["AHR.V", "GSR.V", "PWM.V", "0KXS.L", "VGZ.TO"],
      activeSymbols: ["AHR.V", "GSR.V", "PWM.V", "0KXS.L", "VGZ.TO"],
      symbolToAssetId: {
        "AHR.V": trackedAssetIds[0],
        "GSR.V": trackedAssetIds[1],
        "PWM.V": trackedAssetIds[2],
        "0KXS.L": trackedAssetIds[3],
        "VGZ.TO": trackedAssetIds[4],
      },
    },
  };

  const mlPicks = [
    { yahooSymbol: "AHR.V", mlScore: 99.5 },
    { yahooSymbol: "GSR.V", mlScore: 95.0 },
    { yahooSymbol: "PWM.V", mlScore: 90.0 },
    { yahooSymbol: "0KXS.L", mlScore: 88.0 },
    { yahooSymbol: "VGZ.TO", mlScore: 85.0 },
    { yahooSymbol: "0R2O.L", mlScore: 89.0 }, // unwired, must NOT show as eligible
  ];

  const eligible = getEligibleMlScoreAssets({
    policy,
    vaultState,
    oracleAssets: oracleAssetsCompact,
    mlPicks,
  });

  // The whole point of the regression: under compact mode this used to be 0.
  assert.equal(eligible.length, 5);
  assert.deepEqual(
    eligible.map((a) => a.symbol).sort(),
    ["0KXS.L", "AHR.V", "GSR.V", "PWM.V", "VGZ.TO"],
  );
  // Unwired pick must be filtered out.
  assert.equal(
    eligible.find((a) => a.symbol === "0R2O.L"),
    undefined,
  );
});

test("getEligibleQualityScoreAssets works against a compact get_oracle_assets response", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "quality_score",
    entryQualityScoreMin: 75,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
  });

  const vaultState = { assets: ["0xaaa", "0xbbb"] };
  const oracleAssetsCompact = {
    count: 2,
    summary: {
      symbols: ["AYM.AX", "GRSL.V"],
      symbolToAssetId: { "AYM.AX": "0xaaa", "GRSL.V": "0xbbb" },
    },
  };
  const qualityPicks = [
    { yahooSymbol: "AYM.AX", compositeScore: 90 },
    { yahooSymbol: "GRSL.V", compositeScore: 80 },
    { yahooSymbol: "NOT_TRACKED.V", compositeScore: 95 },
  ];

  const eligible = getEligibleQualityScoreAssets({
    policy,
    vaultState,
    oracleAssets: oracleAssetsCompact,
    qualityPicks,
  });

  assert.equal(eligible.length, 2);
  assert.deepEqual(
    eligible.map((a) => a.symbol).sort(),
    ["AYM.AX", "GRSL.V"],
  );
});

test("getEligibleMomentumVolumeAssets works against a compact get_oracle_assets response", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 3000,
    entryMode: "momentum_volume",
    entryMomentumPctMin: 2.0,
    entryVolumeMin: 500000,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 5,
    positionSizingMode: "model_decides",
  });

  const vaultState = { assets: ["0xasset1", "0xasset2"] };
  const oracleAssetsCompact = {
    count: 2,
    summary: {
      symbols: ["BHP", "HL"],
      symbolToAssetId: { BHP: "0xasset1", HL: "0xasset2" },
    },
  };
  const quotes = [
    { symbol: "BHP", dayChangePct: 2.3, volume: 900000 },
    { symbol: "HL", dayChangePct: 1.2, volume: 2000000 },
  ];

  const eligible = getEligibleMomentumVolumeAssets({
    policy,
    vaultState,
    oracleAssets: oracleAssetsCompact,
    quotes,
  });

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].symbol, "BHP");
});

test("compact-mode eligibility helpers still respect tracked-asset intersection", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
  });

  // Oracle has 3 symbols wired, but the vault only tracks 1 of them.
  const vaultState = { assets: ["0xaaa"] };
  const oracleAssetsCompact = {
    summary: {
      symbolToAssetId: {
        "AHR.V": "0xaaa",
        "GSR.V": "0xbbb",
        "PWM.V": "0xccc",
      },
    },
  };
  const mlPicks = [
    { yahooSymbol: "AHR.V", mlScore: 99 },
    { yahooSymbol: "GSR.V", mlScore: 95 },
    { yahooSymbol: "PWM.V", mlScore: 90 },
  ];

  const eligible = getEligibleMlScoreAssets({
    policy,
    vaultState,
    oracleAssets: oracleAssetsCompact,
    mlPicks,
  });

  // Only the tracked asset should be eligible — the helper must intersect
  // wired-on-oracle with the vault's tracked set, even under compact mode.
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].symbol, "AHR.V");
});

// ---------------------------------------------------------------------------
// autoExitMode policy parsing
// ---------------------------------------------------------------------------

test("parseAgentPolicy defaults autoExitMode to 'none' when only legacy fields are set", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
  });
  assert.equal(policy.autoExitMode, "none");
});

test("parseAgentPolicy accepts autoExitMode='rank_swap' under track_top_n", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
    autoExitMode: "rank_swap",
  });
  assert.equal(policy.autoExitMode, "rank_swap");
});

test("parseAgentPolicy accepts autoExitMode='pnl_band'", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_only",
    maxNewPositionsPerRun: 3,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
    autoExitMode: "pnl_band",
  });
  assert.equal(policy.autoExitMode, "pnl_band");
});

test("parseAgentPolicy normalises combined autoExitMode tokens to sorted '+'-join", () => {
  for (const raw of ["rank_swap+pnl_band", "pnl_band+rank_swap", "rank_swap,pnl_band"]) {
    const policy = parseAgentPolicy({
      autoAllocateTargetBps: 5000,
      entryMode: "ml_score",
      entryMlScoreMin: 85,
      entryDirection: "long_short",
      maxNewPositionsPerRun: 3,
      maxNewShortsPerRun: 1,
      maxTrackedAssets: 12,
      positionSizingMode: "equal_weight",
      rebalanceMode: "track_top_n",
      autoExitMode: raw,
    });
    assert.equal(policy.autoExitMode, "pnl_band+rank_swap", `for raw=${raw}`);
  }
});

test("parseAgentPolicy rejects unknown autoExitMode tokens", () => {
  assert.throws(
    () =>
      parseAgentPolicy({
        autoAllocateTargetBps: 5000,
        entryMode: "ml_score",
        entryMlScoreMin: 85,
        entryDirection: "long_only",
        maxNewPositionsPerRun: 3,
        maxTrackedAssets: 12,
        positionSizingMode: "equal_weight",
        rebalanceMode: "track_top_n",
        autoExitMode: "yolo",
      }),
    /Invalid autoExitMode token/,
  );
});

test("parseAgentPolicy rejects 'none' combined with other tokens", () => {
  assert.throws(
    () =>
      parseAgentPolicy({
        autoAllocateTargetBps: 5000,
        entryMode: "ml_score",
        entryMlScoreMin: 85,
        entryDirection: "long_only",
        maxNewPositionsPerRun: 3,
        maxTrackedAssets: 12,
        positionSizingMode: "equal_weight",
        rebalanceMode: "track_top_n",
        autoExitMode: "none+rank_swap",
      }),
    /'none' cannot be combined/,
  );
});

test("parseAgentPolicy rejects rank_swap without rebalanceMode='track_top_n'", () => {
  assert.throws(
    () =>
      parseAgentPolicy({
        autoAllocateTargetBps: 5000,
        entryMode: "ml_score",
        entryMlScoreMin: 85,
        entryDirection: "long_only",
        maxNewPositionsPerRun: 3,
        maxTrackedAssets: 12,
        positionSizingMode: "equal_weight",
        rebalanceMode: "none",
        autoExitMode: "rank_swap",
      }),
    /'rank_swap' requires rebalanceMode='track_top_n'/,
  );
});

// ---------------------------------------------------------------------------
// computeRankSwapClosures
// ---------------------------------------------------------------------------

function rankSwapPolicy(overrides = {}) {
  return parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
    autoExitMode: "rank_swap",
    ...overrides,
  });
}

test("getActionableMlCandidates ranks mixed long/short picks by model-implied return", () => {
  const selected = getActionableMlCandidates({
    policy: rankSwapPolicy(),
    longPicks: [
      { yahooSymbol: "TOP.V", mlScore: 99, mlPredictedReturn: 0.6 },
      { yahooSymbol: "MID.V", mlScore: 96, mlPredictedReturn: 0.4 },
      { yahooSymbol: "WEAK.V", mlScore: 90, mlPredictedReturn: 0.2 },
      { yahooSymbol: "SHORTME.V", mlScore: 88, mlPredictedReturn: 0.1 },
    ],
    shortPicks: [
      { yahooSymbol: "SHORTME.V", mlScore: 2, mlPredictedReturn: -0.9, absPredictedReturn: 0.9 },
      { yahooSymbol: "BAD.V", mlScore: 3, mlPredictedReturn: -0.5, absPredictedReturn: 0.5 },
      { yahooSymbol: "TOOLOW.V", mlScore: 4, mlPredictedReturn: -0.1, absPredictedReturn: 0.1 },
    ],
  });

  assert.deepEqual(
    selected.map((c) => `${c.yahooSymbol}:${c.side}`),
    ["TOP.V:long", "BAD.V:short", "MID.V:long"],
  );
});

test("getActionableMlCandidates can select a short when fewer than max long entrants exist", () => {
  const selected = getActionableMlCandidates({
    policy: rankSwapPolicy(),
    longPicks: [{ yahooSymbol: "ONLY.V", mlScore: 95, mlPredictedReturn: 0.3 }],
    shortPicks: [{ yahooSymbol: "SHORT.V", mlScore: 5, mlPredictedReturn: -0.1, absPredictedReturn: 0.1 }],
  });

  assert.deepEqual(
    selected.map((c) => `${c.yahooSymbol}:${c.side}`),
    ["ONLY.V:long", "SHORT.V:short"],
  );
});

test("isZeroAmountAllocation detects zero raw USDC allocation no-ops", () => {
  assert.equal(isZeroAmountAllocation({ amount: "0" }), true);
  assert.equal(isZeroAmountAllocation({ amount: 0 }), true);
  assert.equal(isZeroAmountAllocation({ amount: "1" }), false);
});

test("computeRankSwapClosures returns [] when autoExitMode does not include rank_swap", () => {
  const closures = computeRankSwapClosures({
    policy: parseAgentPolicy({
      autoAllocateTargetBps: 5000,
      entryMode: "ml_score",
      entryMlScoreMin: 85,
      entryDirection: "long_short",
      maxNewPositionsPerRun: 3,
      maxNewShortsPerRun: 1,
      maxTrackedAssets: 12,
      positionSizingMode: "equal_weight",
      rebalanceMode: "track_top_n",
    }),
    positions: [
      { exists: true, isLong: true, symbol: "LOW.V", assetId: "0xLOW", size: "1", collateral: "1" },
    ],
    rankedPicks: [{ yahooSymbol: "AHR.V", mlScore: 99 }],
    availableCollateralUsdc: "0",
    minSlotCollateralUsdc: "100",
  });
  assert.equal(closures.length, 0);
});

test("computeRankSwapClosures returns [] when all wanted picks already fit available collateral", () => {
  const closures = computeRankSwapClosures({
    policy: rankSwapPolicy(),
    positions: [
      { exists: true, isLong: true, symbol: "HELD.V", assetId: "0xHELD" },
    ],
    rankedPicks: [
      { yahooSymbol: "AHR.V", mlScore: 100 },
      { yahooSymbol: "GSR.V", mlScore: 95 },
      { yahooSymbol: "HELD.V", mlScore: 90 },
    ],
    availableCollateralUsdc: "1000",
    minSlotCollateralUsdc: "100",
  });
  assert.equal(closures.length, 0);
});

test("computeRankSwapClosures closes lowest-ranked held long to make room for top-ranked newcomer", () => {
  const closures = computeRankSwapClosures({
    policy: rankSwapPolicy(),
    positions: [
      {
        exists: true,
        isLong: true,
        symbol: "TOPHELD.V",
        assetId: "0xTOP",
        unrealisedPnlPctOfCollateral: 0.05,
      },
      {
        exists: true,
        isLong: true,
        symbol: "LOWHELD.V",
        assetId: "0xLOW",
        unrealisedPnlPctOfCollateral: 0.0,
      },
    ],
    rankedPicks: [
      { yahooSymbol: "AHR.V", mlScore: 100 },
      { yahooSymbol: "TOPHELD.V", mlScore: 95 },
      { yahooSymbol: "LOWHELD.V", mlScore: 90 },
    ],
    availableCollateralUsdc: "0",
    minSlotCollateralUsdc: "100",
  });
  assert.equal(closures.length, 1);
  assert.equal(closures[0].pos.assetId, "0xLOW");
  assert.match(closures[0].reason, /profit rotation/);
  assert.match(closures[0].reason, /AHR\.V/);
});

test("computeRankSwapClosures uses PnL tiebreaker when two held legs share the worst rank", () => {
  const closures = computeRankSwapClosures({
    policy: rankSwapPolicy(),
    positions: [
      {
        exists: true,
        isLong: true,
        symbol: "OFFA.V",
        assetId: "0xOFFA",
        unrealisedPnlPctOfCollateral: 0.04,
      },
      {
        exists: true,
        isLong: true,
        symbol: "OFFB.V",
        assetId: "0xOFFB",
        unrealisedPnlPctOfCollateral: -0.03,
      },
    ],
    rankedPicks: [
      { yahooSymbol: "AHR.V", mlScore: 100 },
      { yahooSymbol: "GSR.V", mlScore: 95 },
    ],
    availableCollateralUsdc: "0",
    minSlotCollateralUsdc: "100",
  });
  // Both held legs are off-top-N (rank Infinity); PnL tiebreaker picks the
  // worse one (-3% < +4%).
  assert.ok(closures.length >= 1);
  assert.equal(closures[0].pos.assetId, "0xOFFB");
});

test("computeRankSwapClosures closes a weaker held leg for a stronger unheld ML candidate", () => {
  const closures = computeRankSwapClosures({
    policy: rankSwapPolicy(),
    positions: [
      {
        exists: true,
        isLong: true,
        symbol: "HELD.V",
        assetId: "0xHELD",
        unrealisedPnlPctOfCollateral: 0.01,
      },
    ],
    rankedPicks: [
      { yahooSymbol: "NEW.V", isLong: true, profitPotential: 0.55 },
      { yahooSymbol: "HELD.V", isLong: true, profitPotential: 0.2 },
    ],
    availableCollateralUsdc: "0",
    minSlotCollateralUsdc: "100",
  });
  assert.equal(closures.length, 1);
  assert.equal(closures[0].pos.assetId, "0xHELD");
  assert.match(closures[0].reason, /NEW\.V/);
});

test("computeRankSwapClosures does not close when held leg has stronger model potential", () => {
  const closures = computeRankSwapClosures({
    policy: rankSwapPolicy(),
    positions: [
      {
        exists: true,
        isLong: true,
        symbol: "HELD.V",
        assetId: "0xHELD",
        unrealisedPnlPctOfCollateral: -0.02,
      },
    ],
    rankedPicks: [
      { yahooSymbol: "HELD.V", isLong: true, profitPotential: 0.6 },
      { yahooSymbol: "NEW.V", isLong: true, profitPotential: 0.4 },
    ],
    availableCollateralUsdc: "0",
    minSlotCollateralUsdc: "100",
  });
  assert.equal(closures.length, 0);
});

test("computeRankSwapClosures can rotate a weaker held short in long_short", () => {
  const closures = computeRankSwapClosures({
    policy: rankSwapPolicy(),
    positions: [
      {
        exists: true,
        isLong: false,
        symbol: "BADCO.V",
        assetId: "0xSHORT",
        unrealisedPnlPctOfCollateral: -0.5,
      },
    ],
    rankedPicks: [{ yahooSymbol: "AHR.V", isLong: true, profitPotential: 0.5 }],
    availableCollateralUsdc: "0",
    minSlotCollateralUsdc: "100",
  });
  assert.equal(closures.length, 1);
  assert.equal(closures[0].pos.assetId, "0xSHORT");
  assert.match(closures[0].reason, /short BADCO\.V/);
});

test("computeRankSwapClosures is a no-op in short_only direction", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "short_only",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 3,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
    autoExitMode: "rank_swap",
  });
  const closures = computeRankSwapClosures({
    policy,
    positions: [
      { exists: true, isLong: true, symbol: "HELD.V", assetId: "0xHELD", unrealisedPnlPctOfCollateral: 0 },
    ],
    rankedPicks: [{ yahooSymbol: "AHR.V", mlScore: 100 }],
    availableCollateralUsdc: "0",
    minSlotCollateralUsdc: "100",
  });
  assert.equal(closures.length, 0);
});

test("computeRankSwapClosures bails out when minSlotCollateralUsdc is 0 (no sizing target)", () => {
  const closures = computeRankSwapClosures({
    policy: rankSwapPolicy(),
    positions: [
      { exists: true, isLong: true, symbol: "HELD.V", assetId: "0xHELD", unrealisedPnlPctOfCollateral: 0 },
    ],
    rankedPicks: [{ yahooSymbol: "AHR.V", mlScore: 100 }],
    availableCollateralUsdc: "0",
    minSlotCollateralUsdc: "0",
  });
  assert.equal(closures.length, 0);
});

// ---------------------------------------------------------------------------
// computePnlBandClosures
// ---------------------------------------------------------------------------

test("computePnlBandClosures returns [] when autoExitMode does not include pnl_band", () => {
  const closures = computePnlBandClosures({
    policy: rankSwapPolicy(),
    positions: [
      { exists: true, isLong: true, symbol: "BAD.V", assetId: "0xBAD", pnlBandOutcome: "below_stop_loss", unrealisedPnlPctOfCollateral: -0.1 },
    ],
  });
  assert.equal(closures.length, 0);
});

test("computePnlBandClosures closes long legs above_take_profit and below_stop_loss", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
    autoExitMode: "pnl_band",
  });
  const closures = computePnlBandClosures({
    policy,
    positions: [
      { exists: true, isLong: true, symbol: "OK.V", assetId: "0xOK", pnlBandOutcome: "within", unrealisedPnlPctOfCollateral: 0.01 },
      { exists: true, isLong: true, symbol: "BAD.V", assetId: "0xBAD", pnlBandOutcome: "below_stop_loss", unrealisedPnlPctOfCollateral: -0.07 },
      { exists: true, isLong: true, symbol: "WIN.V", assetId: "0xWIN", pnlBandOutcome: "above_take_profit", unrealisedPnlPctOfCollateral: 0.09 },
    ],
  });
  const assetIds = closures.map((c) => c.pos.assetId).sort();
  assert.deepEqual(assetIds, ["0xBAD", "0xWIN"]);
});

test("parseAgentPolicy parses quality timing and band overrides", () => {
  const policy = parseAgentPolicy({
    entryMode: "quality_score",
    entryQualityScoreMin: 75,
    entryMaxSignalAgeDays: 180,
    entryRecencyHalfLifeDays: 90,
    entryRequireLongNews: true,
    minHoldingHours: 48,
    takeProfitPct: 0.15,
    stopLossPct: 0.1,
    autoAllocateTargetBps: 5000,
    maxNewPositionsPerRun: 3,
    maxTrackedAssets: 12,
    positionSizingMode: "conviction_weighted",
    rebalanceMode: "track_top_n",
    autoExitMode: "rank_swap+pnl_band",
  });
  assert.equal(policy.entryMaxSignalAgeDays, 180);
  assert.equal(policy.entryRequireLongNews, true);
  assert.equal(policy.minHoldingHours, 48);
  assert.equal(policy.takeProfitPct, 0.15);
  assert.equal(policy.stopLossPct, 0.1);
});

test("getEligibleQualityScoreAssets prefers tradeReadinessScore over compositeScore", () => {
  const policy = parseAgentPolicy({
    entryMode: "quality_score",
    entryQualityScoreMin: 80,
    autoAllocateTargetBps: 5000,
    maxNewPositionsPerRun: 3,
    maxTrackedAssets: 12,
    positionSizingMode: "conviction_weighted",
    rebalanceMode: "track_top_n",
    autoExitMode: "pnl_band",
  });
  const eligible = getEligibleQualityScoreAssets({
    policy,
    vaultState: { assets: ["0xa"] },
    oracleAssets: { assets: [{ assetId: "0xa", symbol: "LOW.V" }] },
    qualityPicks: [
      { yahooSymbol: "LOW.V", compositeScore: 90, tradeReadinessScore: 70 },
      { yahooSymbol: "HIGH.V", compositeScore: 70, tradeReadinessScore: 85 },
    ],
  });
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].symbol, "HIGH.V");
  assert.equal(eligible[0].compositeScore, 85);
});

test("computePnlBandClosures uses policy takeProfitPct/stopLossPct overrides", () => {
  const policy = parseAgentPolicy({
    entryMode: "quality_score",
    entryQualityScoreMin: 75,
    takeProfitPct: 0.15,
    stopLossPct: 0.1,
    autoAllocateTargetBps: 5000,
    maxNewPositionsPerRun: 3,
    maxTrackedAssets: 12,
    positionSizingMode: "conviction_weighted",
    rebalanceMode: "track_top_n",
    autoExitMode: "pnl_band",
  });
  const closures = computePnlBandClosures({
    policy,
    positions: [
      {
        exists: true,
        isLong: true,
        symbol: "EDGE.V",
        assetId: "0xedge",
        pnlBandOutcome: "within",
        unrealisedPnlPctOfCollateral: 0.12,
      },
    ],
  });
  assert.equal(closures.length, 0);
  const closuresTp = computePnlBandClosures({
    policy,
    positions: [
      {
        exists: true,
        isLong: true,
        symbol: "EDGE.V",
        assetId: "0xedge",
        pnlBandOutcome: "within",
        unrealisedPnlPctOfCollateral: 0.16,
      },
    ],
  });
  assert.equal(closuresTp.length, 1);
});

test("computeRankSwapClosures respects minHoldingHours via positionOpenAgeMs", () => {
  const policy = parseAgentPolicy({
    entryMode: "quality_score",
    entryQualityScoreMin: 75,
    minHoldingHours: 48,
    autoAllocateTargetBps: 5000,
    maxNewPositionsPerRun: 3,
    maxTrackedAssets: 12,
    positionSizingMode: "conviction_weighted",
    rebalanceMode: "track_top_n",
    autoExitMode: "rank_swap",
  });
  const youngMs = 2 * 60 * 60 * 1000;
  const closures = computeRankSwapClosures({
    policy,
    positions: [
      {
        exists: true,
        isLong: true,
        symbol: "OLD.V",
        assetId: "0xold",
        unrealisedPnlPctOfCollateral: 0,
      },
    ],
    rankedPicks: [{ yahooSymbol: "NEW.V" }],
    availableCollateralUsdc: "0",
    minSlotCollateralUsdc: "10000000",
    positionOpenAgeMs: () => youngMs,
  });
  assert.equal(closures.length, 0);
});

test("validatePolicyWriteBatch rejects quality long without confirming news", () => {
  const policy = parseAgentPolicy({
    entryMode: "quality_score",
    entryQualityScoreMin: 75,
    entryRequireLongNews: true,
    autoAllocateTargetBps: 5000,
    maxNewPositionsPerRun: 3,
    maxTrackedAssets: 12,
    positionSizingMode: "conviction_weighted",
    rebalanceMode: "track_top_n",
    autoExitMode: "pnl_band",
  });
  const news = new Map([["GSR.V", { qualifies: false }]]);
  const violation = validatePolicyWriteBatch({
    classified: {
      hasWriteCalls: true,
      writeCalls: [
        {
          originalName: "open_position",
          args: { assetId: "0xgsr", isLong: true },
        },
      ],
    },
    policy,
    opensExecutedSoFar: 0,
    eligibleAssets: [{ assetId: "0xgsr", symbol: "GSR.V" }],
    longNewsBySymbol: news,
    assetIdToSymbol: () => "GSR.V",
  });
  assert.match(violation, /bullish or factual headline/);
});

test("computePnlBandClosures skips shorts in long_short (LLM owns short exits)", () => {
  const policy = parseAgentPolicy({
    autoAllocateTargetBps: 5000,
    entryMode: "ml_score",
    entryMlScoreMin: 85,
    entryDirection: "long_short",
    maxNewPositionsPerRun: 3,
    maxNewShortsPerRun: 1,
    maxTrackedAssets: 12,
    positionSizingMode: "equal_weight",
    rebalanceMode: "track_top_n",
    autoExitMode: "pnl_band",
  });
  const closures = computePnlBandClosures({
    policy,
    positions: [
      { exists: true, isLong: false, symbol: "SHORT.V", assetId: "0xSHORT", pnlBandOutcome: "below_stop_loss", unrealisedPnlPctOfCollateral: -0.5 },
    ],
  });
  assert.equal(closures.length, 0);
});
