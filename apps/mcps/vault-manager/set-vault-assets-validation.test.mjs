import test from "node:test";
import assert from "node:assert/strict";

import {
  BYTES32_RE,
  validateAssetIdFormat,
  classifyAssetIds,
} from "./set-vault-assets-validation.mjs";

// ---------------------------------------------------------------------------
// validateAssetIdFormat
// ---------------------------------------------------------------------------

test("BYTES32_RE matches a canonical 0x + 64 hex assetId", () => {
  const real = "0x0b8f04590706f001d3a317c46965b2bf6ecc95018c610da029ccb697f17b69b2";
  assert.equal(BYTES32_RE.test(real), true);
});

test("validateAssetIdFormat accepts a valid lowercase bytes32", () => {
  const r = validateAssetIdFormat(
    "0x0b8f04590706f001d3a317c46965b2bf6ecc95018c610da029ccb697f17b69b2",
  );
  assert.equal(r.ok, true);
});

test("validateAssetIdFormat accepts a valid uppercase bytes32", () => {
  const r = validateAssetIdFormat(
    "0x0B8F04590706F001D3A317C46965B2BF6ECC95018C610DA029CCB697F17B69B2",
  );
  assert.equal(r.ok, true);
});

test("validateAssetIdFormat accepts a valid mixed-case bytes32", () => {
  const r = validateAssetIdFormat(
    "0xa6A463452d580DEB8ec322d23A82cfeB4552DA030BD3D4DB8db762F3DED88a8F",
  );
  assert.equal(r.ok, true);
});

test("validateAssetIdFormat rejects missing 0x prefix", () => {
  const r = validateAssetIdFormat(
    "0b8f04590706f001d3a317c46965b2bf6ecc95018c610da029ccb697f17b69b2",
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /0x/);
});

test("validateAssetIdFormat rejects 63-char hex (the actual hallucinated tail from the 2026-05-22 incident)", () => {
  // Note: only 63 hex chars after `0x` — this was the exact failing pattern
  // the quality-matrix-manager kept proposing.
  const halluc = "0x4b0f0e9a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8";
  assert.equal(halluc.length - 2, 63);
  const r = validateAssetIdFormat(halluc);
  assert.equal(r.ok, false);
  assert.match(r.reason, /64 hex/);
});

test("validateAssetIdFormat rejects 65-char hex (one over)", () => {
  const tooLong = "0x" + "a".repeat(65);
  const r = validateAssetIdFormat(tooLong);
  assert.equal(r.ok, false);
});

test("validateAssetIdFormat rejects non-hex characters", () => {
  const r = validateAssetIdFormat(
    "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ",
  );
  assert.equal(r.ok, false);
});

test("validateAssetIdFormat rejects empty string", () => {
  const r = validateAssetIdFormat("");
  assert.equal(r.ok, false);
  assert.match(r.reason, /empty/);
});

test("validateAssetIdFormat rejects non-string inputs", () => {
  assert.equal(validateAssetIdFormat(null).ok, false);
  assert.equal(validateAssetIdFormat(undefined).ok, false);
  assert.equal(validateAssetIdFormat(123).ok, false);
  assert.equal(validateAssetIdFormat({}).ok, false);
  assert.equal(validateAssetIdFormat([]).ok, false);
});

// ---------------------------------------------------------------------------
// classifyAssetIds
// ---------------------------------------------------------------------------

const KNOWN_ACTIVE = [
  "0x0b8f04590706f001d3a317c46965b2bf6ecc95018c610da029ccb697f17b69b2",
  "0x3b094510f54bf7ffb005a5f926a0cff4d9891fa32e85933375c5b89da0e84573",
  "0x06c71f5ac4b84759e4a2b857fa1337e2d191fe0a349365b9e552f924bfce5146",
  "0xa9963554239f4527dddbef2f3df190a5cebd7baca6571c95418cebd73bfd8a82",
  "0xb106087a65c2c4d0cd71533959f50809c407cd57f9ab3fd2b7751f5410f42bb9",
];

test("classifyAssetIds returns all valid when every id is in the known set", () => {
  const r = classifyAssetIds(KNOWN_ACTIVE, KNOWN_ACTIVE);
  assert.deepEqual(r.valid, KNOWN_ACTIVE);
  assert.deepEqual(r.unknown, []);
  assert.deepEqual(r.malformed, []);
});

test("classifyAssetIds separates well-formed but unknown ids into `unknown`", () => {
  const wellFormedUnknown =
    "0x1111111111111111111111111111111111111111111111111111111111111111";
  const r = classifyAssetIds([KNOWN_ACTIVE[0], wellFormedUnknown], KNOWN_ACTIVE);
  assert.deepEqual(r.valid, [KNOWN_ACTIVE[0]]);
  assert.deepEqual(r.unknown, [wellFormedUnknown]);
  assert.deepEqual(r.malformed, []);
});

test("classifyAssetIds separates malformed ids into `malformed` (never into `unknown`)", () => {
  const malformed = "0x4b0f0e9a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8";
  const wellFormedUnknown =
    "0x2222222222222222222222222222222222222222222222222222222222222222";
  const r = classifyAssetIds(
    [KNOWN_ACTIVE[0], malformed, wellFormedUnknown],
    KNOWN_ACTIVE,
  );
  assert.deepEqual(r.valid, [KNOWN_ACTIVE[0]]);
  assert.deepEqual(r.unknown, [wellFormedUnknown]);
  assert.deepEqual(r.malformed, [malformed]);
});

test("classifyAssetIds matches case-insensitively against the known set", () => {
  const mixedCase =
    "0x0B8F04590706F001D3A317C46965B2BF6ECC95018C610DA029CCB697F17B69B2";
  const r = classifyAssetIds([mixedCase], KNOWN_ACTIVE);
  assert.deepEqual(r.valid, [mixedCase]);
  assert.deepEqual(r.unknown, []);
  assert.deepEqual(r.malformed, []);
});

test("classifyAssetIds preserves duplicates (de-duplication is the contract's job)", () => {
  const r = classifyAssetIds(
    [KNOWN_ACTIVE[0], KNOWN_ACTIVE[0], KNOWN_ACTIVE[1]],
    KNOWN_ACTIVE,
  );
  assert.deepEqual(r.valid, [KNOWN_ACTIVE[0], KNOWN_ACTIVE[0], KNOWN_ACTIVE[1]]);
});

test("classifyAssetIds returns empty buckets on empty input", () => {
  const r = classifyAssetIds([], KNOWN_ACTIVE);
  assert.deepEqual(r.valid, []);
  assert.deepEqual(r.unknown, []);
  assert.deepEqual(r.malformed, []);
});

test("classifyAssetIds tolerates non-array `assetIds` (returns empty buckets, no throw)", () => {
  assert.doesNotThrow(() => classifyAssetIds(null, KNOWN_ACTIVE));
  assert.doesNotThrow(() => classifyAssetIds(undefined, KNOWN_ACTIVE));
  assert.doesNotThrow(() => classifyAssetIds("not an array", KNOWN_ACTIVE));
  const r = classifyAssetIds(null, KNOWN_ACTIVE);
  assert.deepEqual(r, { valid: [], unknown: [], malformed: [] });
});

test("classifyAssetIds tolerates non-array `knownActiveIds` (treats as empty set)", () => {
  const r = classifyAssetIds([KNOWN_ACTIVE[0]], null);
  assert.deepEqual(r.valid, []);
  assert.deepEqual(r.unknown, [KNOWN_ACTIVE[0]]);
  assert.deepEqual(r.malformed, []);
});

// ---------------------------------------------------------------------------
// Regression: the exact failing payload from the production log
// (`agents/memory/quality-matrix-manager/run-log.sepolia.jsonl`, timestamp
// 2026-05-22T21:45:16.591Z). Reproducing it as a test pins the failure
// mode the new validator is designed to short-circuit.
// ---------------------------------------------------------------------------

test("classifyAssetIds reproduces the 2026-05-22 quality-matrix-manager failing batch", () => {
  // First 5 are real oracle assetIds the agent legitimately had in memory;
  // last 7 are the obviously-hallucinated patterns it pattern-filled because
  // the get_oracle_assets response was truncated by AGENT_MAX_TOOL_RESPONSE.
  const productionPayload = [
    "0x0b8f04590706f001d3a317c46965b2bf6ecc95018c610da029ccb697f17b69b2",
    "0x3b094510f54bf7ffb005a5f926a0cff4d9891fa32e85933375c5b89da0e84573",
    "0x06c71f5ac4b84759e4a2b857fa1337e2d191fe0a349365b9e552f924bfce5146",
    "0xa9963554239f4527dddbef2f3df190a5cebd7baca6571c95418cebd73bfd8a82",
    "0xb106087a65c2c4d0cd71533959f50809c407cd57f9ab3fd2b7751f5410f42bb9",
    "0x4b0f0e9a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8",
    "0x5c0f0e9a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8",
    "0x6d0f0e9a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8",
    "0x7e0f0e9a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8",
    "0x8f0f0e9a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8",
    "0x9f0f0e9a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8",
    "0xaf0f0e9a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8a8f8",
  ];
  const r = classifyAssetIds(productionPayload, KNOWN_ACTIVE);
  // All 5 leading real IDs were in the agent's known oracle set.
  assert.equal(r.valid.length, 5);
  // All 7 hallucinated IDs are 63 hex chars after `0x` -> malformed, never unknown.
  assert.equal(r.malformed.length, 7);
  assert.equal(r.unknown.length, 0);
  // The validator's caller will use these counts to refuse to broadcast.
  assert.ok(r.malformed.length > 0 || r.unknown.length > 0);
});
