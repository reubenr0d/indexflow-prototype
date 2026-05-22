import test from "node:test";
import assert from "node:assert/strict";

import {
  ADDRESS_RE,
  BYTES32_RE,
  validateAddress,
  validateBytes32,
  validateArgs,
} from "./address-validation.mjs";

// ---------------------------------------------------------------------------
// validateAddress
// ---------------------------------------------------------------------------

test("ADDRESS_RE matches a canonical 0x + 40 hex address (lowercase)", () => {
  assert.equal(ADDRESS_RE.test("0xbd7ea7e23ae07f0dd65a112f9ab93f64c9b8f045"), true);
});

test("ADDRESS_RE matches an EIP-55 mixed-case address", () => {
  assert.equal(
    ADDRESS_RE.test("0xBD7Ea7E23ae07F0Dd65a112f9aB93F64C9b8F045"),
    true,
  );
});

test("validateAddress accepts a valid 20-byte hex address", () => {
  const r = validateAddress("0xbd7ea7e23ae07f0dd65a112f9ab93f64c9b8f045");
  assert.equal(r.ok, true);
});

test("validateAddress rejects the 28-byte 'mash' from the 2026-05-22 quality-matrix incident", () => {
  // This is the exact hallucinated value the LLM emitted as `vault`: prefix
  // of the real vault address concatenated with the suffix of the GRSL.V
  // assetId. cast couldn't parse it; we reject it locally with a structured
  // error before broadcast.
  const r = validateAddress(
    "0xbd7ea7e23ae07f0dd65b2bf6ecc95018c610da029ccb697f17b69b2",
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /40 hex/);
});

test("validateAddress rejects a 16-byte address (under)", () => {
  const r = validateAddress("0xbd7ea7e23ae07f0dd65a112f");
  assert.equal(r.ok, false);
});

test("validateAddress rejects an address missing the 0x prefix", () => {
  const r = validateAddress("bd7ea7e23ae07f0dd65a112f9ab93f64c9b8f045");
  assert.equal(r.ok, false);
});

test("validateAddress rejects an address with non-hex characters", () => {
  const r = validateAddress("0xbd7ea7e23ae07f0dd65a112f9ab93f64c9b8f04Z");
  assert.equal(r.ok, false);
});

test("validateAddress rejects empty string and non-strings", () => {
  assert.equal(validateAddress("").ok, false);
  assert.equal(validateAddress(null).ok, false);
  assert.equal(validateAddress(undefined).ok, false);
  assert.equal(validateAddress(0xbd7ea7e2).ok, false);
  assert.equal(validateAddress({}).ok, false);
});

// ---------------------------------------------------------------------------
// validateBytes32
// ---------------------------------------------------------------------------

test("BYTES32_RE matches a canonical 0x + 64 hex bytes32", () => {
  assert.equal(
    BYTES32_RE.test(
      "0x0b8f04590706f001d3a317c46965b2bf6ecc95018c610da029ccb697f17b69b2",
    ),
    true,
  );
});

test("validateBytes32 accepts a valid mixed-case bytes32", () => {
  const r = validateBytes32(
    "0xa6A463452d580DEB8ec322d23A82cfeB4552DA030BD3D4DB8db762F3DED88a8F",
  );
  assert.equal(r.ok, true);
});

test("validateBytes32 rejects 63-char hex (the off-by-one hallucination tail)", () => {
  const r = validateBytes32(
    "0x0b8f04590706f001d3a317c46965b2bf6ecc95018c610da029ccb697f17b69b",
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /64 hex/);
});

test("validateBytes32 rejects empty / non-string inputs", () => {
  assert.equal(validateBytes32("").ok, false);
  assert.equal(validateBytes32(null).ok, false);
  assert.equal(validateBytes32([]).ok, false);
});

// ---------------------------------------------------------------------------
// validateArgs (the helper that runs at every write tool boundary)
// ---------------------------------------------------------------------------

test("validateArgs returns null when every spec passes", () => {
  const r = validateArgs([
    {
      name: "vault",
      value: "0xbd7ea7e23ae07f0dd65a112f9ab93f64c9b8f045",
      kind: "address",
    },
    {
      name: "assetId",
      value:
        "0x0b8f04590706f001d3a317c46965b2bf6ecc95018c610da029ccb697f17b69b2",
      kind: "bytes32",
    },
  ]);
  assert.equal(r, null);
});

test("validateArgs returns the first violation (vault) for the 2026-05-22 incident shape", () => {
  const r = validateArgs([
    {
      name: "vault",
      value:
        "0xbd7ea7e23ae07f0dd65b2bf6ecc95018c610da029ccb697f17b69b2",
      kind: "address",
    },
    {
      name: "assetId",
      value:
        "0x0b8f04590706f001d3a317c46965b2bf6ecc95018c610da029ccb697f17b69b2",
      kind: "bytes32",
    },
  ]);
  assert.notEqual(r, null);
  assert.equal(r.name, "vault");
  assert.equal(r.kind, "address");
  assert.match(r.reason, /40 hex/);
});

test("validateArgs walks past null/undefined specs without throwing", () => {
  const r = validateArgs([
    null,
    undefined,
    {
      name: "vault",
      value: "0xbd7ea7e23ae07f0dd65a112f9ab93f64c9b8f045",
      kind: "address",
    },
  ]);
  assert.equal(r, null);
});

test("validateArgs ignores specs with unknown kinds (forward-compat)", () => {
  const r = validateArgs([
    {
      name: "size",
      value: "100",
      kind: "uint256",
    },
  ]);
  assert.equal(r, null);
});

test("validateArgs rejects assetId with the off-by-one tail", () => {
  const r = validateArgs([
    {
      name: "assetId",
      value:
        "0x0b8f04590706f001d3a317c46965b2bf6ecc95018c610da029ccb697f17b69b",
      kind: "bytes32",
    },
  ]);
  assert.notEqual(r, null);
  assert.equal(r.name, "assetId");
  assert.equal(r.kind, "bytes32");
});
