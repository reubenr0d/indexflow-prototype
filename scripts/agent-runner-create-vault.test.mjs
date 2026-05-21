// Regression coverage for the 2026-05-21 cross-agent vault-address
// contamination incident, where a failed `create_vault` on the
// `quality-matrix-manager` agent silently inherited the sibling
// `mining-manager` vault address via two compounding bugs in
// scripts/agent-runner.mjs:
//
//   (a) executeToolCall ignored MCP `isError: true` responses and recorded
//       the call as a successful writeAction (no txHash, no error logged).
//   (b) extractNewestVaultAddress's fallback returned the most recently
//       created basket from the factory list when the name match missed,
//       causing the runner to capture the sibling agent's vault.
//
// These tests pin both behaviours: MCP errors are now surfaced into
// runSummary.errors (and create_vault failures arm a runtime suppression
// flag), and extractNewestVaultAddress returns null on a name miss when
// the caller has supplied an expected vault name.

import test from "node:test";
import assert from "node:assert/strict";
import { __agentRunnerInternals } from "./agent-runner.mjs";

const {
  extractNewestVaultAddress,
  extractVaultAddressFromCreateVaultResponse,
  recordMcpErrorIfPresent,
} = __agentRunnerInternals;

test("extractNewestVaultAddress returns null when vaultName is given but no entry matches", () => {
  const content = JSON.stringify({
    count: 2,
    vaults: [
      { index: 0, address: "0xaaa1", name: "Vault Manager Basket" },
      { index: 1, address: "0xbbb2", name: "Minestarters ML Picks" },
    ],
  });

  assert.equal(
    extractNewestVaultAddress(content, "Minestarters Quality Matrix"),
    null,
    "name-mismatch must NOT fall through to vaults[length - 1] — that fallback caused the 2026-05-21 cross-agent contamination",
  );
});

test("extractNewestVaultAddress returns the matching vault address (case-insensitive) when vaultName matches", () => {
  const content = JSON.stringify({
    count: 3,
    vaults: [
      { index: 0, address: "0xaaa1", name: "Vault Manager Basket" },
      { index: 1, address: "0xbbb2", name: "Minestarters ML Picks" },
      { index: 2, address: "0xccc3", name: "Minestarters Quality Matrix" },
    ],
  });

  assert.equal(
    extractNewestVaultAddress(content, "minestarters quality matrix"),
    "0xccc3",
  );
});

test("extractNewestVaultAddress retains newest-entry fallback when no vaultName is supplied", () => {
  const content = JSON.stringify({
    count: 2,
    vaults: [
      { index: 0, address: "0xaaa1", name: "Vault Manager Basket" },
      { index: 1, address: "0xbbb2", name: "Minestarters ML Picks" },
    ],
  });

  assert.equal(
    extractNewestVaultAddress(content, null),
    "0xbbb2",
    "untargeted lookups (no expected name) still use newest entry for back-compat",
  );
  assert.equal(
    extractNewestVaultAddress(content, undefined),
    "0xbbb2",
  );
});

test("extractNewestVaultAddress returns null on empty / malformed input", () => {
  assert.equal(extractNewestVaultAddress("not json", "Anything"), null);
  assert.equal(
    extractNewestVaultAddress(JSON.stringify({ count: 0, vaults: [] }), "Anything"),
    null,
  );
  assert.equal(extractNewestVaultAddress(JSON.stringify({}), "Anything"), null);
});

test("extractVaultAddressFromCreateVaultResponse parses vaultAddress on success", () => {
  const success = JSON.stringify({
    success: true,
    transactionHash: "0xabc",
    status: "success",
    blockNumber: 123,
    vaultAddress: "0xDEADBEEFcafeBABEdeadBEEFcafeBABEDEADBEEF",
  });
  assert.equal(
    extractVaultAddressFromCreateVaultResponse(success),
    "0xDEADBEEFcafeBABEdeadBEEFcafeBABEDEADBEEF",
  );
});

test("extractVaultAddressFromCreateVaultResponse returns null on MCP error payloads", () => {
  const errorPayload = JSON.stringify({
    success: false,
    error_code: "TX_REVERTED",
    message: "execution reverted: Not authorized",
  });
  assert.equal(extractVaultAddressFromCreateVaultResponse(errorPayload), null);

  const noAddress = JSON.stringify({
    success: true,
    transactionHash: "0xabc",
    status: "success",
    vaultAddress: null,
  });
  assert.equal(extractVaultAddressFromCreateVaultResponse(noAddress), null);
});

test("recordMcpErrorIfPresent: no-op on successful tool result", () => {
  const runSummary = { errors: [] };
  const policyRuntime = { createVaultFailedThisRun: false };

  const isError = recordMcpErrorIfPresent({
    result: { isError: false, content: [{ type: "text", text: "{}" }] },
    content: "{}",
    runSummary,
    policyRuntime,
    toolName: "create_vault",
    originalName: "create_vault",
  });

  assert.equal(isError, false);
  assert.deepEqual(runSummary.errors, []);
  assert.equal(policyRuntime.createVaultFailedThisRun, false);
});

test("recordMcpErrorIfPresent: records error and arms create_vault flag on isError responses", () => {
  const runSummary = { errors: [] };
  const policyRuntime = { createVaultFailedThisRun: false };

  const isError = recordMcpErrorIfPresent({
    result: { isError: true },
    content: JSON.stringify({
      success: false,
      error_code: "TX_REVERTED",
      message: "execution reverted: Not authorized",
    }),
    runSummary,
    policyRuntime,
    toolName: "create_vault",
    originalName: "create_vault",
  });

  assert.equal(isError, true);
  assert.equal(runSummary.errors.length, 1);
  assert.equal(runSummary.errors[0].tool, "create_vault");
  assert.ok(
    runSummary.errors[0].error.includes("Not authorized"),
    "the failure preview must include the MCP error message so postmortems aren't blind",
  );
  assert.equal(
    policyRuntime.createVaultFailedThisRun,
    true,
    "a failed create_vault must arm the suppression flag that gates the get_all_vaults address fallback",
  );
});

test("recordMcpErrorIfPresent: does NOT arm createVaultFailedThisRun for non-create_vault tools", () => {
  const runSummary = { errors: [] };
  const policyRuntime = { createVaultFailedThisRun: false };

  const isError = recordMcpErrorIfPresent({
    result: { isError: true },
    content: JSON.stringify({
      success: false,
      error_code: "TX_REVERTED",
      message: "execution reverted: InsufficientCapital",
    }),
    runSummary,
    policyRuntime,
    toolName: "open_position",
    originalName: "open_position",
  });

  assert.equal(isError, true);
  assert.equal(runSummary.errors.length, 1);
  assert.equal(runSummary.errors[0].tool, "open_position");
  assert.equal(
    policyRuntime.createVaultFailedThisRun,
    false,
    "only create_vault failures arm the suppression flag — other write failures shouldn't suppress vault discovery on subsequent runs",
  );
});

test("recordMcpErrorIfPresent: truncates over-long error payloads to 500 chars", () => {
  const runSummary = { errors: [] };
  const policyRuntime = { createVaultFailedThisRun: false };

  const longMessage = "x".repeat(2000);
  recordMcpErrorIfPresent({
    result: { isError: true },
    content: longMessage,
    runSummary,
    policyRuntime,
    toolName: "create_vault",
    originalName: "create_vault",
  });

  assert.equal(runSummary.errors.length, 1);
  assert.equal(runSummary.errors[0].error.length, 500);
});

test("recordMcpErrorIfPresent: tolerates missing policyRuntime (defense-in-depth)", () => {
  const runSummary = { errors: [] };
  const isError = recordMcpErrorIfPresent({
    result: { isError: true },
    content: "boom",
    runSummary,
    policyRuntime: null,
    toolName: "create_vault",
    originalName: "create_vault",
  });

  assert.equal(isError, true);
  assert.equal(runSummary.errors.length, 1);
});
