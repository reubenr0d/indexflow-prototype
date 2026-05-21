import test from "node:test";
import assert from "node:assert/strict";
import { __agentRunnerInternals } from "./agent-runner.mjs";

const {
  parseAgentPolicy,
  computeAutoAllocationAmount,
  getEligibleMomentumVolumeAssets,
  getEligibleMlScoreAssets,
  getEligibleQualityScoreAssets,
  validatePolicyWriteBatch,
  computeAutoRebalanceClosures,
  parseWriteConfirmationCommand,
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
