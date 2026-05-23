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
  classifyMcpErrorPayload,
  SOFT_REFUSAL_ERROR_CODES,
  MCP_ERROR_MAX_CHARS,
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

test("recordMcpErrorIfPresent: preserves full error payload up to MCP_ERROR_MAX_CHARS (no silent truncation)", () => {
  // Pre-2026-05-23 the runner sliced MCP errors to 500 chars, chopping
  // CHURN_GUARD_COOLDOWN / INSUFFICIENT_COLLATERAL payloads mid-JSON and
  // hiding the `recovery_hint`, `assetId`, and structured fields that the
  // self-improvement detector relies on. The cap is now 8 KB by default
  // (overridable via AGENT_RUNNER_MCP_ERROR_MAX_CHARS) so a typical 2-4 KB
  // revert payload round-trips intact.
  const runSummary = { errors: [] };
  const policyRuntime = { createVaultFailedThisRun: false };

  const mediumPayload = JSON.stringify({
    success: false,
    error_code: "TX_REVERTED",
    message: "execution reverted",
    raw: "x".repeat(3500),
  });
  assert.ok(mediumPayload.length > 500, "test fixture must be larger than the legacy 500-char cap");
  assert.ok(mediumPayload.length < MCP_ERROR_MAX_CHARS, "test fixture must fit under the new cap");

  recordMcpErrorIfPresent({
    result: { isError: true },
    content: mediumPayload,
    runSummary,
    policyRuntime,
    toolName: "open_position",
    originalName: "open_position",
  });

  assert.equal(runSummary.errors.length, 1);
  assert.equal(
    runSummary.errors[0].error.length,
    mediumPayload.length,
    "payloads below the cap must be preserved verbatim — no slicing",
  );
  assert.equal(runSummary.errors[0].errorCode, "TX_REVERTED");
});

test("recordMcpErrorIfPresent: elides payloads OVER the cap with a transparent marker", () => {
  const runSummary = { errors: [] };
  const oversized = "x".repeat(MCP_ERROR_MAX_CHARS + 500);
  recordMcpErrorIfPresent({
    result: { isError: true },
    content: oversized,
    runSummary,
    policyRuntime: null,
    toolName: "create_vault",
    originalName: "create_vault",
  });

  assert.equal(runSummary.errors.length, 1);
  const stored = runSummary.errors[0].error;
  assert.ok(
    stored.length > MCP_ERROR_MAX_CHARS,
    "elided payloads include a marker after the cap so operators see truncation happened",
  );
  assert.ok(stored.startsWith("x".repeat(MCP_ERROR_MAX_CHARS)));
  assert.ok(
    stored.includes("[truncated"),
    "elision marker must explain why the tail is missing",
  );
});

test("recordMcpErrorIfPresent: routes CHURN_GUARD_COOLDOWN to softFailures, not errors", () => {
  const runSummary = { errors: [], softFailures: [] };
  const policyRuntime = { createVaultFailedThisRun: false };

  const isError = recordMcpErrorIfPresent({
    result: { isError: true },
    content: JSON.stringify({
      success: false,
      error_code: "CHURN_GUARD_COOLDOWN",
      message: "Re-opening (vault=0xabc, assetId=0xdef, isLong=true) is blocked",
      recovery_hint: "Skip this ticker for the rest of the run.",
    }),
    runSummary,
    policyRuntime,
    toolName: "plan_open_position",
    originalName: "plan_open_position",
  });

  assert.equal(isError, true, "still returns true so the caller sees this as a failed tool call");
  assert.equal(runSummary.errors.length, 0, "soft refusals must NOT inflate the hard-error tally");
  assert.equal(runSummary.softFailures.length, 1);
  assert.equal(runSummary.softFailures[0].tool, "plan_open_position");
  assert.equal(runSummary.softFailures[0].errorCode, "CHURN_GUARD_COOLDOWN");
});

test("recordMcpErrorIfPresent: routes REQUIRE_REVERT (true on-chain revert) to errors[]", () => {
  const runSummary = { errors: [], softFailures: [] };
  recordMcpErrorIfPresent({
    result: { isError: true },
    content: JSON.stringify({
      success: false,
      error_code: "REQUIRE_REVERT",
      message: "Contract reverted with require(string): Vault: _size must be more than _collateral",
      reverted_with: "Error(string)",
      raw: "Command failed: cast send ...",
    }),
    runSummary,
    policyRuntime: null,
    toolName: "open_position",
    originalName: "open_position",
  });

  assert.equal(runSummary.errors.length, 1, "reverts (gas burnt) must surface as hard errors");
  assert.equal(runSummary.softFailures.length, 0);
  assert.equal(runSummary.errors[0].errorCode, "REQUIRE_REVERT");
});

test("recordMcpErrorIfPresent: routes generic success:false + recovery_hint payload to softFailures", () => {
  const runSummary = { errors: [], softFailures: [] };
  recordMcpErrorIfPresent({
    result: { isError: true },
    content: JSON.stringify({
      success: false,
      error_code: "FUTURE_UNENUMERATED_CODE",
      message: "policy refused this for a new reason",
      recovery_hint: "do X instead",
    }),
    runSummary,
    policyRuntime: null,
    toolName: "some_future_tool",
    originalName: "some_future_tool",
  });

  assert.equal(
    runSummary.softFailures.length,
    1,
    "fallback heuristic catches future refusals before the enum is updated",
  );
  assert.equal(runSummary.errors.length, 0);
});

test("recordMcpErrorIfPresent: free-text (non-JSON) errors default to hard errors[]", () => {
  const runSummary = { errors: [], softFailures: [] };
  recordMcpErrorIfPresent({
    result: { isError: true },
    content: "MCP error -32603: Internal error",
    runSummary,
    policyRuntime: null,
    toolName: "yfinance_news",
    originalName: "yfinance_news",
  });

  assert.equal(runSummary.errors.length, 1);
  assert.equal(runSummary.softFailures.length, 0);
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

test("recordMcpErrorIfPresent: create_vault soft refusal STILL arms the suppression flag", () => {
  // A failed create_vault must always suppress the get_all_vaults fallback,
  // even when classified as a soft refusal — otherwise a "name already
  // taken" idempotency error would inherit a sibling vault.
  const runSummary = { errors: [], softFailures: [] };
  const policyRuntime = { createVaultFailedThisRun: false };
  recordMcpErrorIfPresent({
    result: { isError: true },
    content: JSON.stringify({
      success: false,
      error_code: "ALREADY_WIRED",
      message: "Vault with this name already exists",
      recovery_hint: "Pick a different name",
    }),
    runSummary,
    policyRuntime,
    toolName: "create_vault",
    originalName: "create_vault",
  });
  assert.equal(runSummary.softFailures.length, 1);
  assert.equal(
    policyRuntime.createVaultFailedThisRun,
    true,
    "create_vault failures (hard OR soft) must always arm the suppression flag",
  );
});

// ---------------------------------------------------------------------------
// classifyMcpErrorPayload — pure classifier tests
// ---------------------------------------------------------------------------

test("classifyMcpErrorPayload: known soft codes return isSoft:true", () => {
  for (const code of SOFT_REFUSAL_ERROR_CODES) {
    const result = classifyMcpErrorPayload(JSON.stringify({ success: false, error_code: code }));
    assert.equal(result.isSoft, true, `${code} should be classified as a soft refusal`);
    assert.equal(result.code, code);
  }
});

test("classifyMcpErrorPayload: payload with transactionHash is never soft (a tx was submitted)", () => {
  const result = classifyMcpErrorPayload(JSON.stringify({
    success: false,
    recovery_hint: "retry",
    transactionHash: "0xabc",
  }));
  assert.equal(result.isSoft, false, "if a tx hit the chain, the failure burnt gas — it is hard");
});

test("classifyMcpErrorPayload: non-JSON or empty content classifies as hard", () => {
  assert.equal(classifyMcpErrorPayload("").isSoft, false);
  assert.equal(classifyMcpErrorPayload(null).isSoft, false);
  assert.equal(classifyMcpErrorPayload("not json").isSoft, false);
  assert.equal(classifyMcpErrorPayload(JSON.stringify([1, 2, 3])).isSoft, false);
});
