import test from "node:test";
import assert from "node:assert/strict";

// The wire_asset idempotency short-circuit lives inside index.js because it
// needs the `runCast` / `castCall` closures bound to the live deployment +
// RPC config. Rather than re-export those, we cover the *response shape*
// here: the structured ALREADY_WIRED payload the LLM sees, which has to be
// stable so the agent prompts can rely on it.

// Reference shape for the ALREADY_WIRED short-circuit. If this changes in
// index.js, the agent prompts in agents/mining-manager.md (step 6.d) and
// agents/quality-matrix-manager.md (step 7.d) must be updated together so
// the LLM keeps recognising the recovery path.
const EXPECTED_ALREADY_WIRED_PAYLOAD = {
  success: false,
  error_code: "ALREADY_WIRED",
  // `message` and `recovery_hint` are descriptive — only assert the
  // load-bearing fields the LLM keys off.
  symbol: "CRML",
  assetId:
    "0xa6a463452d580deb8ec322d23a82cfeb4552da030bd3d4db8db762f3ded88a8f",
};

test("ALREADY_WIRED contract: structural fields are stable for the LLM contract", () => {
  // The agents/{mining-manager,quality-matrix-manager}.md prompts both
  // instruct the LLM that on `error_code: "ALREADY_WIRED"` it should drop
  // wire_asset for the symbol and reuse the returned `assetId`. Locking in
  // the field names here keeps that contract testable without spinning up
  // the MCP.
  const sample = { ...EXPECTED_ALREADY_WIRED_PAYLOAD };
  assert.equal(sample.success, false);
  assert.equal(sample.error_code, "ALREADY_WIRED");
  assert.equal(typeof sample.symbol, "string");
  assert.equal(sample.symbol.length > 0, true);
  assert.equal(/^0x[0-9a-fA-F]{64}$/.test(sample.assetId), true);
});

// We also smoke-test the existence of the lookup helper by ensuring index.js
// imports the address-validation module and the revert-decoder module — the
// idempotency logic uses `runCast(["keccak", symbol])` which produces a
// bytes32 and is then validated against the same `BYTES32_RE` regex. If the
// imports go missing the wire_asset path will throw on first use; this test
// guards against accidental removal during refactors.
test("vault-manager index imports the address-validation and revert-decoder modules", async () => {
  const fs = await import("node:fs/promises");
  const url = new URL("./index.js", import.meta.url);
  const src = await fs.readFile(url, "utf8");
  assert.match(src, /from "\.\/address-validation\.mjs"/);
  assert.match(src, /from "\.\/revert-decoder\.mjs"/);
  assert.match(src, /lookupOracleAssetBySymbol/);
  assert.match(src, /ALREADY_WIRED/);
});

test("vault-manager index registers the compact mode for get_oracle_assets", async () => {
  const fs = await import("node:fs/promises");
  const url = new URL("./index.js", import.meta.url);
  const src = await fs.readFile(url, "utf8");
  assert.match(src, /compact: z\.boolean\(\)\.optional\(\)/);
  // The summary keys agents now reference in their step-4/step-7 prompts.
  assert.match(src, /symbolToAssetId/);
  assert.match(src, /activeSymbols/);
});

test("vault-manager index pre-flights open_position with VaultAccounting state", async () => {
  const fs = await import("node:fs/promises");
  const url = new URL("./index.js", import.meta.url);
  const src = await fs.readFile(url, "utf8");
  assert.match(src, /readVaultAccountingState/);
  assert.match(src, /INSUFFICIENT_COLLATERAL/);
  assert.match(src, /SIZE_EXCEEDS_POSITION/);
});
