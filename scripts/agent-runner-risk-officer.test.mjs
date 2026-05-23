// Unit tests for the risk-officer second-pass helpers in
// scripts/agent-runner-confirmation.mjs. These are pure functions + a thin
// orchestrator (`runRiskOfficerPass`) that takes an injectable `llmCall`,
// so the tests don't need a live OpenAI key.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildRiskOfficerUserPayload,
  parseRiskOfficerVerdict,
  applyRiskOfficerDownsize,
  runRiskOfficerPass,
  DEFAULT_RISK_OFFICER_SYSTEM_PROMPT,
} from "./agent-runner-confirmation.mjs";

test("buildRiskOfficerUserPayload normalises the write batch + caps closures at 5", () => {
  const payload = buildRiskOfficerUserPayload({
    writeBatch: [
      {
        originalName: "open_position",
        args: { vault: "0xV", assetId: "0xA", isLong: true, justification: "long ML 92" },
      },
    ],
    vaultSnapshot: { accounting: { availableCollateral: "10000000000" } },
    recentClosedPositions: Array.from({ length: 8 }, (_, i) => ({
      ticker: `T${i}`,
      side: "long",
      realizedPnlPctOfCollateral: -0.05,
    })),
    marketRegime: { regime: "metals_neutral", shortPenalty: 0, longBonus: 0, summary: "neutral" },
  });
  assert.equal(payload.writeBatch.length, 1);
  assert.equal(payload.writeBatch[0].tool, "open_position");
  assert.equal(payload.writeBatch[0].justification, "long ML 92");
  assert.equal(payload.recentClosedPositions.length, 5);
  assert.equal(payload.marketRegime.regime, "metals_neutral");
});

test("parseRiskOfficerVerdict accepts strict JSON approve", () => {
  const v = parseRiskOfficerVerdict('{"verdict":"approve","reason":"ok"}');
  assert.deepEqual(v, { verdict: "approve", reason: "ok" });
});

test("parseRiskOfficerVerdict accepts downsize with factor in (0,1]", () => {
  const v = parseRiskOfficerVerdict('{"verdict":"downsize","reason":"too concentrated","downsizeFactor":0.5}');
  assert.deepEqual(v, { verdict: "downsize", reason: "too concentrated", downsizeFactor: 0.5 });
});

test("parseRiskOfficerVerdict accepts veto", () => {
  const v = parseRiskOfficerVerdict('{"verdict":"veto","reason":"recent -12% loss on same ticker"}');
  assert.deepEqual(v, { verdict: "veto", reason: "recent -12% loss on same ticker" });
});

test("parseRiskOfficerVerdict rejects downsize without a valid factor", () => {
  assert.equal(parseRiskOfficerVerdict('{"verdict":"downsize","reason":"x"}'), null);
  assert.equal(parseRiskOfficerVerdict('{"verdict":"downsize","reason":"x","downsizeFactor":0}'), null);
  assert.equal(parseRiskOfficerVerdict('{"verdict":"downsize","reason":"x","downsizeFactor":1.5}'), null);
});

test("parseRiskOfficerVerdict tolerates surrounding prose (extracts first JSON block)", () => {
  const v = parseRiskOfficerVerdict("Sure! Here is my verdict:\n{\"verdict\":\"approve\",\"reason\":\"all good\"}\nThanks.");
  assert.deepEqual(v, { verdict: "approve", reason: "all good" });
});

test("parseRiskOfficerVerdict returns null on garbage / non-JSON", () => {
  assert.equal(parseRiskOfficerVerdict(""), null);
  assert.equal(parseRiskOfficerVerdict("approve"), null);
  assert.equal(parseRiskOfficerVerdict(null), null);
  assert.equal(parseRiskOfficerVerdict("{not json}"), null);
});

test("applyRiskOfficerDownsize scales collateral + size by factor and preserves leverage", () => {
  const writeCalls = [
    {
      originalName: "open_position",
      args: {
        vault: "0xV",
        assetId: "0xA",
        isLong: true,
        size: "1000000000000000000000000000000", // 1e30 (= $1 GMX-USD)
        collateral: "100000000",                 // $100 USDC
      },
    },
  ];
  const { adjustedCalls, audit } = applyRiskOfficerDownsize(writeCalls, 0.5);
  assert.equal(adjustedCalls[0].args.collateral, "50000000");
  assert.equal(adjustedCalls[0].args.size, "500000000000000000000000000000");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].beforeCollateral, "100000000");
  assert.equal(audit[0].afterCollateral, "50000000");
  assert.equal(audit[0].downsizeFactor, 0.5);
});

test("applyRiskOfficerDownsize ignores non-open_position calls (e.g. wire_asset)", () => {
  const writeCalls = [
    { originalName: "wire_asset", args: { symbol: "GSR.V", seedPriceUsd: 1.23 } },
    {
      originalName: "open_position",
      args: { vault: "0xV", assetId: "0xA", isLong: true, size: "1000", collateral: "100" },
    },
  ];
  const { adjustedCalls, audit } = applyRiskOfficerDownsize(writeCalls, 0.25);
  // wire_asset is untouched.
  assert.deepEqual(adjustedCalls[0].args, { symbol: "GSR.V", seedPriceUsd: 1.23 });
  // open_position is scaled to 25%.
  assert.equal(adjustedCalls[1].args.collateral, "25");
  assert.equal(adjustedCalls[1].args.size, "250");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].tool, "open_position");
});

test("applyRiskOfficerDownsize is a no-op for invalid factors", () => {
  const writeCalls = [
    {
      originalName: "open_position",
      args: { vault: "0xV", assetId: "0xA", isLong: true, size: "1000", collateral: "100" },
    },
  ];
  for (const bad of [0, -0.1, 1.5, NaN, "foo"]) {
    const { adjustedCalls } = applyRiskOfficerDownsize(writeCalls, bad);
    assert.equal(adjustedCalls[0].args.collateral, "100", `factor=${bad}`);
  }
});

test("runRiskOfficerPass defaults to approve when llmCall is missing", async () => {
  const v = await runRiskOfficerPass({
    writeBatch: [
      { originalName: "open_position", args: { isLong: true, size: "100", collateral: "10" } },
    ],
  });
  assert.equal(v.verdict, "approve");
  assert.match(v.reason, /no llmCall/);
});

test("runRiskOfficerPass parses a downsize verdict and returns audit", async () => {
  const writeBatch = [
    {
      originalName: "open_position",
      args: { vault: "0xV", assetId: "0xA", isLong: true, size: "1000", collateral: "100" },
    },
  ];
  let receivedSystem = null;
  let receivedUser = null;
  const llmCall = async (system, user) => {
    receivedSystem = system;
    receivedUser = user;
    return '{"verdict":"downsize","reason":"single-name >60% of available","downsizeFactor":0.5}';
  };
  const v = await runRiskOfficerPass({ writeBatch, llmCall });
  assert.equal(v.verdict, "downsize");
  assert.equal(v.downsizeFactor, 0.5);
  assert.equal(v.audit.length, 1);
  assert.equal(v.audit[0].afterCollateral, "50");
  // System prompt is the default and the user payload is JSON-stringified.
  assert.equal(receivedSystem, DEFAULT_RISK_OFFICER_SYSTEM_PROMPT);
  assert.match(receivedUser, /writeBatch/);
});

test("runRiskOfficerPass defaults to approve when LLM throws", async () => {
  const v = await runRiskOfficerPass({
    writeBatch: [
      { originalName: "open_position", args: { size: "1", collateral: "1", isLong: true } },
    ],
    llmCall: async () => {
      throw new Error("rate limit");
    },
  });
  assert.equal(v.verdict, "approve");
  assert.match(v.reason, /risk-officer LLM call failed/);
});

test("runRiskOfficerPass defaults to approve when LLM reply is unparseable", async () => {
  const v = await runRiskOfficerPass({
    writeBatch: [
      { originalName: "open_position", args: { size: "1", collateral: "1", isLong: true } },
    ],
    llmCall: async () => "not json at all",
  });
  assert.equal(v.verdict, "approve");
  assert.match(v.reason, /not valid JSON/);
});

test("runRiskOfficerPass passes veto through as-is", async () => {
  const v = await runRiskOfficerPass({
    writeBatch: [
      { originalName: "open_position", args: { size: "1", collateral: "1", isLong: false } },
    ],
    llmCall: async () => '{"verdict":"veto","reason":"shortPenalty=2 squeeze risk"}',
  });
  assert.equal(v.verdict, "veto");
  assert.match(v.reason, /shortPenalty=2/);
});

test("runRiskOfficerPass with empty batch returns approve immediately (no LLM call)", async () => {
  let llmCalls = 0;
  const v = await runRiskOfficerPass({
    writeBatch: [],
    llmCall: async () => {
      llmCalls += 1;
      return "{}";
    },
  });
  assert.equal(v.verdict, "approve");
  assert.equal(llmCalls, 0);
});
