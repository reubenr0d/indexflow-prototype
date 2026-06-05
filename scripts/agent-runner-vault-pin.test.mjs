import test from "node:test";
import assert from "node:assert/strict";
import { __agentRunnerInternals } from "./agent-runner.mjs";

const { applyVaultArgPin, VAULT_ARG_PINNED_TOOLS, VAULT_ARG_WRITE_TOOLS } =
  __agentRunnerInternals;

const CANONICAL = "0xbd7ea7e23ae07f0dd65a112f9ab93f64c9b8f045";

// ---------------------------------------------------------------------------
// VAULT_ARG_PINNED_TOOLS / VAULT_ARG_WRITE_TOOLS
// ---------------------------------------------------------------------------

test("VAULT_ARG_WRITE_TOOLS covers exactly the five vault-bound write tools", () => {
  assert.deepEqual(
    [...VAULT_ARG_WRITE_TOOLS].sort(),
    [
      "allocate_to_perp",
      "close_position",
      "open_position",
      "set_vault_assets",
      "withdraw_from_perp",
    ],
  );
});

test("VAULT_ARG_PINNED_TOOLS covers vault-bound reads, planning, and writes", () => {
  assert.deepEqual(
    [...VAULT_ARG_PINNED_TOOLS].sort(),
    [
      "allocate_to_perp",
      "close_position",
      "get_perp_capital_snapshot",
      "get_position_tracking",
      "get_vault_pnl",
      "get_vault_state",
      "list_open_positions",
      "open_position",
      "plan_open_position",
      "set_vault_assets",
      "withdraw_from_perp",
    ],
  );
});

// ---------------------------------------------------------------------------
// applyVaultArgPin — happy path
// ---------------------------------------------------------------------------

test("applyVaultArgPin overrides a hallucinated 28-byte vault on open_position", () => {
  // The 2026-05-22 quality-matrix-manager incident shape: prefix of the real
  // vault concatenated with the suffix of GRSL.V's assetId.
  const hallucinated =
    "0xbd7ea7e23ae07f0dd65b2bf6ecc95018c610da029ccb697f17b69b2";
  const args = {
    vault: hallucinated,
    assetId: "0x" + "0".repeat(64),
    isLong: true,
    size: "1000000000000000000000000000000",
    collateral: "1000000",
    justification: "Open BFG.CN long",
  };
  const result = applyVaultArgPin({
    toolName: "open_position",
    args,
    canonicalVault: CANONICAL,
  });
  assert.equal(result.overridden, true);
  assert.equal(result.suppliedVault, hallucinated);
  assert.equal(result.canonicalVault, CANONICAL);
  assert.equal(args.vault, CANONICAL);
  assert.match(args.justification, /Open BFG\.CN long/);
  assert.match(args.justification, /Runner pinned vault to canonical/);
});

test("applyVaultArgPin appends a fresh justification when the LLM provided none", () => {
  const args = {
    vault: "0xbadbadbadbadbadbadbadbadbadbadbadbadbad0", // wrong vault
    assetId: "0x" + "0".repeat(64),
  };
  const result = applyVaultArgPin({
    toolName: "set_vault_assets",
    args,
    canonicalVault: CANONICAL,
  });
  assert.equal(result.overridden, true);
  assert.equal(args.vault, CANONICAL);
  assert.match(args.justification, /Runner pinned vault to canonical/);
});

test("applyVaultArgPin does NOT override when the LLM already passed the canonical vault (case-insensitive)", () => {
  const args = {
    vault: CANONICAL.toUpperCase().replace("0X", "0x"),
    justification: "open AAPL long",
  };
  const result = applyVaultArgPin({
    toolName: "open_position",
    args,
    canonicalVault: CANONICAL,
  });
  assert.equal(result.overridden, false);
  assert.equal(result.reason, "ALREADY_CANONICAL");
  assert.equal(args.justification, "open AAPL long");
});

test("applyVaultArgPin overrides when vault is missing entirely", () => {
  const args = { assetId: "0x" + "0".repeat(64) };
  const result = applyVaultArgPin({
    toolName: "open_position",
    args,
    canonicalVault: CANONICAL,
  });
  assert.equal(result.overridden, true);
  assert.equal(result.suppliedVault, null);
  assert.equal(args.vault, CANONICAL);
});

test("applyVaultArgPin overrides a hallucinated plan_open_position vault without adding justification", () => {
  // Reproduction of the mining-manager 2026-06-05 shape: valid vault prefix
  // concatenated with a bytes32 assetId tail. plan_open_position is read-only,
  // but a malformed vault still burns an LLM turn before sizing can happen.
  const hallucinated =
    "0x4dcd435461e27f8bfb580d216b8c695fcf49eb9c083f8310654475abba0d8592505a7932";
  const canonical = "0x4dcd435461e27f8bfb580d216b8d69490023a0ba";
  const args = {
    vault: hallucinated,
    assetId: "0x" + "1".repeat(64),
    isLong: true,
    targetLeverage: 10,
    numNewSlots: 3,
  };

  const result = applyVaultArgPin({
    toolName: "plan_open_position",
    args,
    canonicalVault: canonical,
  });

  assert.equal(result.overridden, true);
  assert.equal(result.suppliedVault, hallucinated);
  assert.equal(result.canonicalVault, canonical);
  assert.equal(args.vault, canonical);
  assert.equal("justification" in args, false);
});

// ---------------------------------------------------------------------------
// applyVaultArgPin — guards
// ---------------------------------------------------------------------------

test("applyVaultArgPin overrides vault-bound read tools (e.g. get_vault_state)", () => {
  const args = { vault: "0xbad" };
  const result = applyVaultArgPin({
    toolName: "get_vault_state",
    args,
    canonicalVault: CANONICAL,
  });
  assert.equal(result.overridden, true);
  assert.equal(args.vault, CANONICAL);
  assert.equal("justification" in args, false);
});

test("applyVaultArgPin no-ops on tools that don't take a vault arg (e.g. wire_asset)", () => {
  const args = { symbol: "BHP.AX", seedPriceUsd: 45.2 };
  const result = applyVaultArgPin({
    toolName: "wire_asset",
    args,
    canonicalVault: CANONICAL,
  });
  assert.equal(result.overridden, false);
  assert.equal(result.reason, "TOOL_NOT_VAULT_BOUND");
});

test("applyVaultArgPin no-ops when the agent has no canonical vault yet", () => {
  // First-run case: the agent is about to call create_vault and hasn't
  // captured an address yet. We must NOT pin to anything here.
  const args = { vault: "0xfoo" };
  const result = applyVaultArgPin({
    toolName: "open_position",
    args,
    canonicalVault: null,
  });
  assert.equal(result.overridden, false);
  assert.equal(result.reason, "NO_CANONICAL_VAULT");
});

test("applyVaultArgPin tolerates non-object args without throwing", () => {
  for (const args of [null, undefined, "string", 42, []]) {
    const result = applyVaultArgPin({
      toolName: "open_position",
      args,
      canonicalVault: CANONICAL,
    });
    // arrays are technically objects in JS so the check needs to allow either
    // ARGS_NOT_OBJECT (for null/undefined/strings/numbers) or proceed without
    // crashing for arrays (which have no .vault property and so we'd treat
    // them like missing-vault).
    if (Array.isArray(args)) {
      // For an array, supplied is "" (no .vault property) so we'd override to
      // canonical. Either behavior is acceptable; ensure no throw.
      assert.equal(typeof result.overridden, "boolean");
    } else {
      assert.equal(result.overridden, false);
    }
  }
});
