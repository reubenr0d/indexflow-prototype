import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import {
  KNOWN_ERRORS,
  extractRevertData,
  decodeRevertData,
  decodeCastRevert,
} from "./revert-decoder.mjs";

// ---------------------------------------------------------------------------
// Helpers — generate canonical revert payloads with cast (matches the wire
// format foundry produces) so we don't drift from on-chain reality. We skip
// these tests cleanly when `cast` is not on PATH (e.g. in a CI image without
// foundry installed) since this is a smoke layer over the static selector
// table.
// ---------------------------------------------------------------------------

function castAvailable() {
  try {
    execFileSync("cast", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function castSig(sig) {
  try {
    return execFileSync("cast", ["sig", sig], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function castSigError(sig) {
  // foundry's `cast sig` matches selectors for both `function foo(...)` and
  // `error Foo(...)`; the latter is what we want.
  return castSig(sig);
}

function padHex(n, hex) {
  const clean = hex.replace(/^0x/, "");
  return clean.padStart(n, "0");
}

function encodeBytes32(hex) {
  return padHex(64, hex);
}

function encodeUint256(value) {
  const big = typeof value === "bigint" ? value : BigInt(value);
  return padHex(64, big.toString(16));
}

function encodeAddress(addr) {
  return padHex(64, addr.replace(/^0x/, ""));
}

// ---------------------------------------------------------------------------
// extractRevertData
// ---------------------------------------------------------------------------

test("extractRevertData pulls the data blob from a typical foundry stderr line", () => {
  const msg =
    'Error: Failed to estimate gas: server returned an error response: error code 3: execution reverted, data: "0x8a30b6461a3a155cd9070000000000000000000000000000000000000000000000000000"';
  const data = extractRevertData(msg);
  assert.equal(typeof data, "string");
  assert.equal(data.startsWith("0x8a30b646"), true);
});

test("extractRevertData returns null when there is no data blob", () => {
  const msg = "Error: connection refused";
  assert.equal(extractRevertData(msg), null);
});

test("extractRevertData rejects non-hex blobs", () => {
  // Defensive: foundry shouldn't emit garbage here, but make sure we don't
  // hand untrusted strings to BigInt() downstream.
  const msg = 'Error: data: "0xZZZZ"';
  assert.equal(extractRevertData(msg), null);
});

// ---------------------------------------------------------------------------
// Sanity-check our static selector table against `cast sig` so it can't drift.
// ---------------------------------------------------------------------------

test("KNOWN_ERRORS selectors match `cast sig` output for every entry", { skip: !castAvailable() }, () => {
  const expected = [
    ["MappingAlreadyExists(bytes32)", "0x8a30b646"],
    ["MappingNotFound(bytes32)", "0x932e05cb"],
    ["ZeroAddress()", "0xd92e233d"],
    ["VaultNotRegistered(address)", "0x299f3425"],
    ["VaultAlreadyRegistered(address)", "0x38bfcc16"],
    ["InsufficientCapital(address,uint256,uint256)", "0x001356fc"],
    ["AssetTokenNotMapped(bytes32)", "0x5bb87345"],
    ["PositionNotFound(bytes32)", "0x426cfff0"],
    ["AssetNotFound(bytes32)", "0x0a2de0f3"],
    ["AssetNotActive(bytes32)", "0xf558e2db"],
    ["InvalidPrice()", "0x00bfc921"],
    ["Unauthorized()", "0x82b42900"],
    ["StalePrice(bytes32,uint256,uint256)", "0xaffad796"],
    ["DeviationTooLarge(bytes32,uint256,uint256,uint256)", "0xbdecbfb7"],
  ];
  for (const [sig, selector] of expected) {
    const computed = castSigError(sig);
    assert.equal(computed, selector, `cast sig drift for ${sig}: ${computed} vs ${selector}`);
    assert.ok(KNOWN_ERRORS[selector], `KNOWN_ERRORS missing entry for ${sig} (${selector})`);
  }
});

// ---------------------------------------------------------------------------
// decodeRevertData — selector-driven dispatch
// ---------------------------------------------------------------------------

test("decodeRevertData decodes MappingAlreadyExists(bytes32) — the CRML retry incident", () => {
  // CRML assetId = keccak256("CRML"). We don't recompute it here (would need
  // a hash dep) — any well-formed bytes32 exercises the same parse path.
  const assetId =
    "0x1a3a155cd9070000000000000000000000000000000000000000000000000000";
  const data = "0x8a30b646" + encodeBytes32(assetId);
  const decoded = decodeRevertData(data);
  assert.equal(decoded.matched, true);
  assert.equal(decoded.error_code, "MAPPING_ALREADY_EXISTS");
  assert.equal(decoded.name, "MappingAlreadyExists");
  assert.equal(decoded.args.assetId, assetId);
  assert.match(decoded.recovery_hint, /already wired/i);
});

test("decodeRevertData decodes InsufficientCapital(address,uint256,uint256)", () => {
  // Mining-manager incident: vault $2715.36 deposited, $2700 locked, agent
  // tried $1700 collateral.
  const vault = "0xbd7ea7e23ae07f0dd65a112f9ab93f64c9b8f045";
  const requested = 1700_000000n; // 1700 USDC, 6 decimals
  const available = 15_360000n;   // ~$15.36 free
  const data =
    "0x001356fc" +
    encodeAddress(vault) +
    encodeUint256(requested) +
    encodeUint256(available);
  const decoded = decodeRevertData(data);
  assert.equal(decoded.matched, true);
  assert.equal(decoded.error_code, "INSUFFICIENT_CAPITAL");
  assert.equal(decoded.args.vault, vault.toLowerCase());
  assert.equal(decoded.args.requested, requested.toString());
  assert.equal(decoded.args.available, available.toString());
  assert.match(decoded.recovery_hint, /close.*position/i);
});

test("decodeRevertData decodes Error(string) (legacy require())", () => {
  // Manually encode `Error(string)` for "Insufficient capital for collateral"
  // — the exact require message in VaultAccounting.sol#L291.
  const reason = "Insufficient capital for collateral";
  const reasonHex = Buffer.from(reason, "utf8").toString("hex");
  const reasonLen = reason.length;
  const data =
    "0x08c379a0" +
    padHex(64, "20") + // offset = 32
    padHex(64, reasonLen.toString(16)) +
    reasonHex.padEnd(Math.ceil(reasonHex.length / 64) * 64, "0");
  const decoded = decodeRevertData(data);
  assert.equal(decoded.matched, true);
  assert.equal(decoded.error_code, "REQUIRE_REVERT");
  assert.equal(decoded.reason, reason);
});

test("decodeRevertData decodes Panic(uint256)", () => {
  const data = "0x4e487b71" + encodeUint256(0x11); // arithmetic over/underflow
  const decoded = decodeRevertData(data);
  assert.equal(decoded.matched, true);
  assert.equal(decoded.error_code, "PANIC");
  assert.equal(decoded.panicCode, "17");
});

test("decodeRevertData returns matched=false for an unknown selector", () => {
  const data = "0xdeadbeef" + encodeBytes32("00");
  const decoded = decodeRevertData(data);
  assert.equal(decoded.matched, false);
  assert.equal(decoded.selector, "0xdeadbeef");
});

test("decodeRevertData returns null for too-short payloads", () => {
  assert.equal(decodeRevertData("0x12"), null);
  assert.equal(decodeRevertData(null), null);
  assert.equal(decodeRevertData("not hex"), null);
});

// ---------------------------------------------------------------------------
// decodeCastRevert — top-level helper used by writeError()
// ---------------------------------------------------------------------------

test("decodeCastRevert end-to-end on a canonical foundry stderr message", () => {
  const assetId =
    "0xa6a463452d580deb8ec322d23a82cfeb4552da030bd3d4db8db762f3ded88a8f";
  const data = "0x8a30b646" + encodeBytes32(assetId);
  const stderr =
    `Error: Failed to estimate gas: server returned an error response: error code 3: execution reverted, data: "${data}"`;
  const decoded = decodeCastRevert(stderr);
  assert.equal(decoded.matched, true);
  assert.equal(decoded.error_code, "MAPPING_ALREADY_EXISTS");
  assert.equal(decoded.args.assetId, assetId);
});

test("decodeCastRevert returns null when the stderr has no data blob", () => {
  assert.equal(decodeCastRevert("Error: connection refused"), null);
});
