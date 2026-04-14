import test from "node:test";
import assert from "node:assert/strict";
import { __agentRunnerInternals } from "./agent-runner.mjs";

const {
  parseAgentPolicy,
  computeAutoAllocationAmount,
  getEligibleMomentumVolumeAssets,
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
