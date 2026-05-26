import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { __agentRunnerInternals } from "./agent-runner.mjs";

const { publishPaperclipHeartbeat } = __agentRunnerInternals;

// Tests run against the real `agents/memory/<agent>/` tree because
// `publishPaperclipHeartbeat` resolves paths via the module-scoped
// MEMORY_DIR. Use a unique synthetic agent name per test and clean up
// the directory afterwards so we never collide with a real agent's
// committed memory.
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MEMORY_DIR = resolve(PROJECT_ROOT, "agents", "memory");

function withTempAgent(label, fn) {
  const name = `__paperclip_bridge_test_${label}_${process.pid}_${Date.now()}`;
  const dir = resolve(MEMORY_DIR, name);
  try {
    return fn(name, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("publishPaperclipHeartbeat writes a v1 schema snapshot for a trading agent", () => {
  withTempAgent("trader_v1", (name, dir) => {
    publishPaperclipHeartbeat({
      config: {
        name,
        description: "Mining ML Picks vault manager",
        mcpServers: [{ name: "atlas-ml-mcp" }, { name: "vault-manager-mcp" }],
        vaultName: "Minestarters ML Picks",
        policy: { entryMode: "ml_score" },
      },
      state: {
        vaultAddress: "0xabc0000000000000000000000000000000000001",
        vaultName: "Minestarters ML Picks",
        thesis: "Long-only mining basket aligned with Atlas top-N.",
      },
      runSummary: {
        startedAt: "2026-05-26T12:18:00.000Z",
        finishedAt: "2026-05-26T12:21:43.000Z",
        turns: 8,
        toolCalls: [{ tool: "get_oracle_assets" }, { tool: "get_ml_top_picks" }],
        writeActions: [
          {
            tool: "open_position",
            txHash: "0xdeadbeef",
            justification: "Atlas top-pick GSR.V crossed 88 ml_score.",
            riskOfficer: { verdict: "approve", reason: "fits policy" },
          },
          {
            tool: "wire_asset",
            txHash: "0xfeedface",
            justification: "Onboard GSR.V at live oracle price.",
          },
          {
            tool: "open_position",
            skipped: true,
            justification: "skipped by risk officer downsize",
          },
        ],
        errors: [],
        softFailures: [],
        summary: "Opened GSR.V long after Atlas refresh.",
      },
      network: "sepolia",
      status: "succeeded",
    });

    const payloadPath = resolve(dir, "paperclip-heartbeat.json");
    assert.ok(existsSync(payloadPath), "heartbeat file should exist");
    const payload = JSON.parse(readFileSync(payloadPath, "utf8"));

    assert.equal(payload.schema, "paperclip.heartbeat/v1");
    assert.equal(payload.agentName, name);
    assert.equal(payload.agentDescription, "Mining ML Picks vault manager");
    assert.equal(payload.signalSource, "atlas-ml");
    assert.equal(payload.entryMode, "ml_score");
    assert.equal(payload.network, "sepolia");
    assert.equal(payload.vaultAddress, "0xabc0000000000000000000000000000000000001");
    assert.equal(payload.vaultName, "Minestarters ML Picks");
    assert.equal(payload.startedAt, "2026-05-26T12:18:00.000Z");
    assert.equal(payload.finishedAt, "2026-05-26T12:21:43.000Z");
    assert.equal(payload.runId, "2026-05-26T12:21:43.000Z");
    assert.equal(payload.status, "succeeded");
    assert.equal(payload.thesis, "Long-only mining basket aligned with Atlas top-N.");
    assert.equal(payload.summary, "Opened GSR.V long after Atlas refresh.");

    assert.deepEqual(payload.usage, {
      turns: 8,
      toolCalls: 2,
      errors: 0,
      softFailures: 0,
      writeActions: 2, // skipped action is excluded
    });

    assert.equal(payload.writeActions.length, 2);
    assert.deepEqual(payload.writeActions[0], {
      tool: "open_position",
      txHash: "0xdeadbeef",
      justification: "Atlas top-pick GSR.V crossed 88 ml_score.",
      riskOfficer: { verdict: "approve", reason: "fits policy" },
    });
    assert.deepEqual(payload.writeActions[1], {
      tool: "wire_asset",
      txHash: "0xfeedface",
      justification: "Onboard GSR.V at live oracle price.",
    });
    assert.deepEqual(payload.errors, []);
  });
});

test("publishPaperclipHeartbeat handles non-trading agents with no vault", () => {
  withTempAgent("no_vault", (name, dir) => {
    publishPaperclipHeartbeat({
      config: {
        name,
        description: "Issues channel meta-agent",
        mcpServers: [{ name: "repo-editor-mcp" }],
      },
      state: null,
      runSummary: {
        startedAt: "2026-05-26T12:30:00.000Z",
        finishedAt: "2026-05-26T12:30:42.000Z",
        turns: 3,
        toolCalls: [{ tool: "propose_issue" }],
        writeActions: [],
        errors: [],
        softFailures: [],
        summary: "Drafted 1 issue.",
      },
      network: "sepolia",
      status: "succeeded",
    });

    const payload = JSON.parse(
      readFileSync(resolve(dir, "paperclip-heartbeat.json"), "utf8"),
    );

    assert.equal(payload.vaultAddress, null);
    assert.equal(payload.vaultName, null);
    assert.equal(payload.signalSource, null);
    assert.equal(payload.entryMode, null);
    assert.equal(payload.thesis, null);
    assert.equal(payload.status, "succeeded");
    assert.equal(payload.usage.writeActions, 0);
  });
});

test("publishPaperclipHeartbeat records failure status and truncates long error strings", () => {
  withTempAgent("failed", (name, dir) => {
    const longErr = "x".repeat(2000);
    publishPaperclipHeartbeat({
      config: {
        name,
        description: "Trading agent",
        mcpServers: [{ name: "vault-manager-mcp" }],
        policy: { entryMode: "momentum_volume" },
      },
      state: { vaultAddress: "0xabc0000000000000000000000000000000000002" },
      runSummary: {
        startedAt: "2026-05-26T12:18:00.000Z",
        finishedAt: "2026-05-26T12:18:15.000Z",
        turns: 1,
        toolCalls: [],
        writeActions: [],
        errors: [{ tool: "_agent", error: longErr }],
        softFailures: [],
        summary: "FAILED: " + longErr,
      },
      network: "sepolia",
      status: "failed",
    });

    const payload = JSON.parse(
      readFileSync(resolve(dir, "paperclip-heartbeat.json"), "utf8"),
    );

    assert.equal(payload.status, "failed");
    assert.equal(payload.errors.length, 1);
    assert.equal(payload.errors[0].tool, "_agent");
    assert.equal(payload.errors[0].error.length, 500);
    assert.equal(payload.usage.errors, 1);
  });
});

test("publishPaperclipHeartbeat picks atlas-quality signalSource when both MCPs present", () => {
  withTempAgent("quality", (name, dir) => {
    publishPaperclipHeartbeat({
      config: {
        name,
        description: "Quality matrix agent",
        mcpServers: [
          { name: "vault-manager-mcp" },
          { name: "atlas-quality-mcp" },
          { name: "atlas-ml-mcp" }, // present but quality wins
        ],
        policy: { entryMode: "quality_score" },
      },
      state: { vaultAddress: "0xabc0000000000000000000000000000000000003" },
      runSummary: {
        startedAt: "2026-05-26T12:18:00.000Z",
        finishedAt: "2026-05-26T12:18:15.000Z",
        turns: 1,
        toolCalls: [],
        writeActions: [],
        errors: [],
        softFailures: [],
        summary: "no-op",
      },
      network: "sepolia",
      status: "succeeded",
    });

    const payload = JSON.parse(
      readFileSync(resolve(dir, "paperclip-heartbeat.json"), "utf8"),
    );

    assert.equal(payload.signalSource, "atlas-quality");
    assert.equal(payload.entryMode, "quality_score");
  });
});

test("publishPaperclipHeartbeat overwrites the previous heartbeat in place", () => {
  withTempAgent("overwrite", (name, dir) => {
    const path = resolve(dir, "paperclip-heartbeat.json");
    const baseRunSummary = {
      startedAt: "2026-05-26T12:18:00.000Z",
      turns: 1,
      toolCalls: [],
      writeActions: [],
      errors: [],
      softFailures: [],
    };
    publishPaperclipHeartbeat({
      config: { name, description: "x", mcpServers: [] },
      state: { vaultAddress: "0xabc0000000000000000000000000000000000004" },
      runSummary: {
        ...baseRunSummary,
        finishedAt: "2026-05-26T12:18:15.000Z",
        summary: "first",
      },
      network: "sepolia",
      status: "succeeded",
    });
    publishPaperclipHeartbeat({
      config: { name, description: "x", mcpServers: [] },
      state: { vaultAddress: "0xabc0000000000000000000000000000000000004" },
      runSummary: {
        ...baseRunSummary,
        finishedAt: "2026-05-26T13:18:15.000Z",
        summary: "second",
      },
      network: "sepolia",
      status: "succeeded",
    });

    const payload = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(payload.summary, "second");
    assert.equal(payload.finishedAt, "2026-05-26T13:18:15.000Z");
    assert.equal(payload.runId, "2026-05-26T13:18:15.000Z");
  });
});
