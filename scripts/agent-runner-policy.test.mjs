import test from "node:test";
import assert from "node:assert/strict";
import { __agentRunnerInternals } from "./agent-runner.mjs";

const {
  parseAgentPolicy,
  computeAutoAllocationAmount,
  getEligibleMomentumVolumeAssets,
  getEligibleMlScoreAssets,
  validatePolicyWriteBatch,
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
