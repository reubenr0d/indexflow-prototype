import test from "node:test";
import assert from "node:assert/strict";
import { __agentRunnerInternals } from "./agent-runner.mjs";

const { buildRunDetail, summarizeActionParams } = __agentRunnerInternals;

test("summarizeActionParams keeps symbol and seedPriceUsd for wire_asset", () => {
  const params = summarizeActionParams("wire_asset", {
    symbol: "BHP.AX",
    seedPriceUsd: 45.2,
    justification: "...",
  });
  assert.deepEqual(params, {
    kind: "wire_asset",
    symbol: "BHP.AX",
    seedPriceUsd: 45.2,
  });
});

test("buildRunDetail persists no-action run details for web metadata", () => {
  const detail = buildRunDetail({
    config: { name: "no-op-agent" },
    runId: "2026-06-01T00:00:00.000Z",
    runSummary: {
      startedAt: "2026-06-01T00:00:00.000Z",
      finishedAt: "2026-06-01T00:01:00.000Z",
      summary: "No qualifying trades this run.",
      model: "gpt-5-codex",
      modelSource: "frontmatter",
      network: "sepolia",
      dryRun: false,
      confirmWrites: true,
      turns: 2,
      toolCalls: ["get_vault_state", "get_quality_top_picks"],
      writeActions: [],
      reasoningSummaries: ["Checked the inputs and found no eligible action."],
      errors: [],
      softFailures: [{ tool: "open_position", error: "INSUFFICIENT_COLLATERAL" }],
      riskOfficerVerdicts: [],
      confirmationBatches: [],
    },
  });

  assert.equal(detail.runId, "2026-06-01T00:00:00.000Z");
  assert.equal(detail.actionCount, 0);
  assert.equal(detail.onChainActionCount, 0);
  assert.deepEqual(detail.toolCalls, ["get_vault_state", "get_quality_top_picks"]);
  assert.deepEqual(detail.reasoningSummaries, [
    "Checked the inputs and found no eligible action.",
  ]);
  assert.deepEqual(detail.softFailures, [
    { tool: "open_position", error: "INSUFFICIENT_COLLATERAL" },
  ]);
});

test("buildRunDetail preserves full markdown summaries for expandable UI", () => {
  const summary = "### Final Summary\n\n" + "- item\n".repeat(200);
  const detail = buildRunDetail({
    config: { name: "markdown-agent" },
    runId: "2026-06-01T00:00:00.000Z",
    runSummary: {
      startedAt: "2026-06-01T00:00:00.000Z",
      finishedAt: "2026-06-01T00:01:00.000Z",
      summary,
      writeActions: [],
    },
  });

  assert.equal(detail.summary, summary);
  assert.ok(detail.summary.length > 500);
  assert.match(detail.summary, /^### Final Summary/);
});

test("summarizeActionParams omits seedPriceUsd when missing for wire_asset", () => {
  const params = summarizeActionParams("wire_asset", { symbol: "BHP.AX" });
  assert.deepEqual(params, { kind: "wire_asset", symbol: "BHP.AX" });
});

test("summarizeActionParams returns undefined for wire_asset without symbol", () => {
  assert.equal(summarizeActionParams("wire_asset", {}), undefined);
});

test("summarizeActionParams captures vault creation knobs", () => {
  const params = summarizeActionParams("create_vault", {
    name: "Mining Basket",
    depositFeeBps: 50,
    redeemFeeBps: 50,
    deployToSpokes: true,
    justification: "...",
  });
  assert.deepEqual(params, {
    kind: "create_vault",
    name: "Mining Basket",
    depositFeeBps: 50,
    redeemFeeBps: 50,
    deployToSpokes: true,
  });
});

test("summarizeActionParams omits deployToSpokes when not provided", () => {
  const params = summarizeActionParams("create_vault", {
    name: "Mining Basket",
    depositFeeBps: 50,
    redeemFeeBps: 50,
  });
  assert.deepEqual(params, {
    kind: "create_vault",
    name: "Mining Basket",
    depositFeeBps: 50,
    redeemFeeBps: 50,
  });
});

test("summarizeActionParams summarizes set_vault_assets with count", () => {
  const params = summarizeActionParams("set_vault_assets", {
    vault: "0xvault",
    assetIds: ["0xaaa", "0xbbb", "0xccc"],
  });
  assert.deepEqual(params, {
    kind: "set_vault_assets",
    assetIds: ["0xaaa", "0xbbb", "0xccc"],
    count: 3,
  });
});

test("summarizeActionParams returns undefined when set_vault_assets has no assetIds array", () => {
  assert.equal(
    summarizeActionParams("set_vault_assets", { vault: "0xvault" }),
    undefined,
  );
});

test("summarizeActionParams reports amount for allocate_to_perp and withdraw_from_perp", () => {
  assert.deepEqual(
    summarizeActionParams("allocate_to_perp", {
      vault: "0xvault",
      amount: "1000000000",
    }),
    { kind: "allocate_to_perp", amountUsdc: "1000000000" },
  );
  assert.deepEqual(
    summarizeActionParams("withdraw_from_perp", {
      vault: "0xvault",
      amount: "500000000",
    }),
    { kind: "withdraw_from_perp", amountUsdc: "500000000" },
  );
});

test("summarizeActionParams keeps side, size, and collateral for open_position", () => {
  const params = summarizeActionParams("open_position", {
    vault: "0xvault",
    assetId: "0xassetid",
    isLong: true,
    size: "10000000000000000000000000000000000",
    collateral: "2000000000",
    justification: "...",
  });
  assert.deepEqual(params, {
    kind: "open_position",
    assetId: "0xassetid",
    isLong: true,
    size: "10000000000000000000000000000000000",
    collateral: "2000000000",
  });
});

test("summarizeActionParams keeps side and deltas for close_position", () => {
  const params = summarizeActionParams("close_position", {
    vault: "0xvault",
    assetId: "0xassetid",
    isLong: false,
    sizeDelta: "5000000000000000000000000000000000",
    collateralDelta: "1000000000",
  });
  assert.deepEqual(params, {
    kind: "close_position",
    assetId: "0xassetid",
    isLong: false,
    sizeDelta: "5000000000000000000000000000000000",
    collateralDelta: "1000000000",
  });
});

test("summarizeActionParams returns undefined for unknown tools", () => {
  assert.equal(summarizeActionParams("get_vault_state", { vault: "0x" }), undefined);
  assert.equal(summarizeActionParams("foobar", { foo: "bar" }), undefined);
});

test("summarizeActionParams returns undefined when args are missing", () => {
  assert.equal(summarizeActionParams("open_position", null), undefined);
  assert.equal(summarizeActionParams("open_position", undefined), undefined);
});

test("summarizeActionParams coerces numeric size/collateral to strings", () => {
  const params = summarizeActionParams("open_position", {
    assetId: "0xassetid",
    isLong: true,
    size: 123,
    collateral: 456,
  });
  assert.equal(params.size, "123");
  assert.equal(params.collateral, "456");
});
