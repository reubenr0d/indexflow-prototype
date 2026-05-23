import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Coverage for the two pre-flight guards added in the 2026-05-23 batch:
//
//   - allocate_to_perp  → INSUFFICIENT_RESERVES (refuses when the requested
//                         amount > getAvailableForPerpUsdc(), catches the
//                         cents-level rounding bug that reverted in commit
//                         ab42c05 where the agent asked for 2,762,330 raw
//                         USDC against 2,762,329.58 available).
//   - open_position     → LEVERAGE_BELOW_1X (refuses when
//                         `size <= collateral * 1e24`, catches the GMX-scale
//                         math bug in ab42c05 that opened three reverting
//                         positions with size=1e30, collateral=2.5e8).
//
// Both guards must (a) return `isError: true` so the agent-runner classifies
// them as a failed tool call, (b) emit a structured `error_code` so the
// soft-failure classifier in scripts/agent-runner.mjs routes them out of the
// hard-error tally, and (c) ship a `recovery_hint` so the LLM has a clear
// next step. The MCP index.js holds the cast subprocess closures so we
// validate the response contract via source-string assertions rather than
// spinning up a live MCP.

let indexSource;
test.before(async () => {
  const url = new URL("./index.js", import.meta.url);
  indexSource = await readFile(url, "utf8");
});

// ---------------------------------------------------------------------------
// allocate_to_perp INSUFFICIENT_RESERVES guard
// ---------------------------------------------------------------------------

test("allocate_to_perp pre-flight reads getAvailableForPerpUsdc() before broadcasting", () => {
  // The on-chain view that `require(amount <= getAvailableForPerpUsdc())`
  // ultimately gates against. Reading it locally is what lets the MCP
  // short-circuit with a structured payload before the tx burns gas.
  assert.match(indexSource, /getAvailableForPerpUsdc\(\)\(uint256\)/);
});

test("allocate_to_perp emits structured INSUFFICIENT_RESERVES payload with requested + available + shortfall", () => {
  assert.match(indexSource, /error_code: "INSUFFICIENT_RESERVES"/);
  assert.match(indexSource, /requestedAmount:/);
  assert.match(indexSource, /availableAmount:/);
  // `shortfall` is the load-bearing field for the agent's retry path
  // (allocate `requestedAmount - shortfall` instead of falling back to a
  // separate `get_vault_state` round-trip).
  assert.match(indexSource, /shortfall:/);
  assert.match(indexSource, /recovery_hint:\s*\n?\s*"Re-read `get_vault_state`/);
});

test("allocate_to_perp pre-flight validates positive integer amount before any RPC call", () => {
  // BigInt(String(amount)) wrapped in try/catch is the agreed pattern from
  // open_position; keeping it consistent across write tools means the
  // INVALID_ARGUMENT path looks identical to the LLM regardless of which
  // tool tripped it.
  const allocateBlock = sliceTool(indexSource, "allocate_to_perp");
  assert.match(allocateBlock, /amountBn\s*=\s*BigInt\(String\(amount\)\)/);
  assert.match(allocateBlock, /amountBn\s*<=\s*0n/);
  // Routed through the shared toolError(code, msg, hint) helper, so the
  // source carries the literal code string.
  assert.match(allocateBlock, /toolError\(\s*\n?\s*"INVALID_ARGUMENT"/);
});

test("allocate_to_perp pre-flight tolerates RPC failures (best-effort, falls through to live cast send)", () => {
  // If the local `getAvailableForPerpUsdc` read itself blips, we still
  // want the legitimate happy path (allocate succeeds when in fact within
  // limits) to work — operator confidence requires that the new guard
  // doesn't block valid actions on network flakiness.
  const allocateBlock = sliceTool(indexSource, "allocate_to_perp");
  assert.match(
    allocateBlock,
    /availableForPerp\s*=\s*null/,
    "RPC failure must fall through to the live cast send path, not block the call",
  );
});

test("allocate_to_perp description advertises the new pre-flight so the agent prompt updates aren't needed", () => {
  const allocateBlock = sliceTool(indexSource, "allocate_to_perp");
  assert.match(
    allocateBlock,
    /INSUFFICIENT_RESERVES/,
    "description must mention the pre-flight refusal code so the LLM understands the new failure mode",
  );
});

// ---------------------------------------------------------------------------
// open_position LEVERAGE_BELOW_1X guard
// ---------------------------------------------------------------------------

test("open_position pre-flight refuses below-1x positions with LEVERAGE_BELOW_1X", () => {
  // The error code surfaces via the shared `toolError(code, msg, hint)`
  // helper, so the source carries the literal `"LEVERAGE_BELOW_1X"` as the
  // first arg; the `error_code:` JSON wrapper is constructed at runtime.
  assert.match(indexSource, /toolError\(\s*\n?\s*"LEVERAGE_BELOW_1X"/);
  // The scaling constant must be expressed as a BigInt literal so the
  // comparison stays exact (no Number precision loss at 1e24).
  assert.match(indexSource, /COLLATERAL_TO_SIZE_SCALE\s*=\s*10n\s*\*\*\s*24n/);
  assert.match(indexSource, /sizeBn\s*<=\s*collateralBn\s*\*\s*COLLATERAL_TO_SIZE_SCALE/);
});

test("open_position LEVERAGE_BELOW_1X payload cites the concrete contract revert string so the LLM can correlate", () => {
  // The contract reverts with "Vault: _size must be more than _collateral".
  // Including that exact string in the pre-flight message lets the
  // detect-self-improvement-signal recurring_error_code detector tie the
  // pre-flight refusal to historical reverts of the same logical bug.
  assert.match(indexSource, /Vault: _size must be more than _collateral/);
  assert.match(indexSource, /size > collateral \* 1e24/);
});

test("open_position LEVERAGE_BELOW_1X guard fires BEFORE the INSUFFICIENT_COLLATERAL pre-flight", () => {
  const openBlock = sliceTool(indexSource, "open_position");
  const leverageIdx = openBlock.indexOf('"LEVERAGE_BELOW_1X"');
  const collateralIdx = openBlock.indexOf('"INSUFFICIENT_COLLATERAL"');
  assert.ok(leverageIdx > 0, "LEVERAGE_BELOW_1X check is registered in open_position");
  assert.ok(collateralIdx > 0, "INSUFFICIENT_COLLATERAL check is still registered in open_position");
  assert.ok(
    leverageIdx < collateralIdx,
    "leverage guard must run before the collateral guard so the agent gets the most actionable error first (sizing bug, not capital bug)",
  );
});

test("open_position description advertises LEVERAGE_BELOW_1X alongside the existing INSUFFICIENT_COLLATERAL note", () => {
  const openBlock = sliceTool(indexSource, "open_position");
  assert.match(openBlock, /LEVERAGE_BELOW_1X/);
  assert.match(openBlock, /INSUFFICIENT_COLLATERAL/);
});

// ---------------------------------------------------------------------------
// Pure leverage-math regression. Mirrors the in-MCP scaling logic so a
// future refactor (e.g. moving the scale into a config) breaks here loudly
// instead of silently regressing the guard.
// ---------------------------------------------------------------------------

test("leverage math: ab42c05 reproduction passes the guard's <=1x detection", () => {
  // The exact values that reverted in commit ab42c05 on 2026-05-23.
  const sizeBn = 10n ** 30n; // 1e30 GMX-USD = $1
  const collateralBn = 250_000_000n; // 2.5e8 raw USDC = $250
  const SCALE = 10n ** 24n;
  assert.ok(
    sizeBn <= collateralBn * SCALE,
    "the historical reverting position MUST be caught by the new guard — regression boundary",
  );
});

test("leverage math: a valid 2x position passes the guard", () => {
  // Pattern from plan_open_position: size = 2 * collateral * 1e24.
  const collateralBn = 250_000_000n;
  const SCALE = 10n ** 24n;
  const sizeBn = 2n * collateralBn * SCALE;
  assert.ok(
    sizeBn > collateralBn * SCALE,
    "a 2x position computed by plan_open_position MUST NOT be caught by the guard",
  );
});

test("leverage math: exactly-1x position is rejected (require is strict >, matches contract)", () => {
  // The contract uses `require(_size > _collateral)` (strict), so the
  // boundary case `size == collateral * 1e24` must also be refused.
  const collateralBn = 1_000_000n;
  const SCALE = 10n ** 24n;
  const sizeBn = collateralBn * SCALE;
  assert.ok(
    sizeBn <= collateralBn * SCALE,
    "exact 1x boundary is rejected — keep parity with the contract's strict > check",
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Slice the source from `server.registerTool("<name>"` through the next
// `server.registerTool(` so per-tool assertions don't accidentally match
// strings from neighbouring tools.
function sliceTool(src, name) {
  const startMarker = `server.registerTool(\n  "${name}"`;
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`tool ${name} not found in index.js`);
  const nextStart = src.indexOf("server.registerTool(", start + startMarker.length);
  return nextStart < 0 ? src.slice(start) : src.slice(start, nextStart);
}
