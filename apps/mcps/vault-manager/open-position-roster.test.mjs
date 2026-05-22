import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The MCP's `open_position` pre-flight at INSUFFICIENT_COLLATERAL embeds an
// `openPositions` roster (per-leg PnL + collateral) so the LLM can pick a
// leg to close in the SAME retry. The exact response shape is part of the
// contract the runner relies on (it never inspects, but the agent prompt
// does), and the shared roster builder is reused by both `list_open_positions`
// and the new `get_perp_capital_snapshot` tool.
//
// These tests guard the structural invariants without spawning the MCP.

let indexSource;
test.before(async () => {
  const url = new URL("./index.js", import.meta.url);
  indexSource = await readFile(url, "utf8");
});

test("vault-manager imports the position-pnl helper", () => {
  assert.match(indexSource, /from "\.\/position-pnl\.mjs"/);
  assert.match(indexSource, /computePositionPnl/);
  assert.match(indexSource, /PNL_BAND_DEFAULTS/);
});

test("vault-manager factors the roster builder out of list_open_positions", () => {
  assert.match(indexSource, /function buildOpenPositionsRoster/);
  // Both call sites must use the shared builder so per-leg PnL stays
  // consistent across list_open_positions and the open_position embed.
  const callMatches = indexSource.match(/buildOpenPositionsRoster\(/g) || [];
  assert.ok(callMatches.length >= 3, `expected >= 3 references to buildOpenPositionsRoster, got ${callMatches.length}`);
});

test("INSUFFICIENT_COLLATERAL response now embeds openPositions and a sharpened recovery_hint", () => {
  // The structural fields the LLM keys off in the recovery path.
  assert.match(indexSource, /error_code: "INSUFFICIENT_COLLATERAL"/);
  assert.match(indexSource, /openPositions/);
  // The recovery hint must explicitly tell the LLM to pick the worst-PnL leg
  // from the embedded roster — that's the load-bearing instruction.
  assert.match(indexSource, /worst `unrealisedPnlPctOfCollateral`/);
  assert.match(indexSource, /above_take_profit/);
  assert.match(indexSource, /below_stop_loss/);
});

test("open_position description nudges the LLM to call get_perp_capital_snapshot first", () => {
  assert.match(indexSource, /get_perp_capital_snapshot/);
});

test("get_perp_capital_snapshot tool is registered with the load-bearing fields", () => {
  assert.match(indexSource, /"get_perp_capital_snapshot"/);
  // Output payload contract: accounting.availableCollateral is what
  // open_position's pre-flight compares against, so the LLM must be able to
  // read it from this single snapshot call.
  assert.match(indexSource, /availableCollateral/);
  assert.match(indexSource, /openPositions/);
  assert.match(indexSource, /pnlBand/);
});

test("list_open_positions advertises the new per-leg PnL fields in its description", () => {
  // Substrings the agent prompt depends on so the LLM understands the new
  // field shape without a separate sample call.
  assert.match(indexSource, /unrealisedPnlUsdc/);
  assert.match(indexSource, /unrealisedPnlPctOfCollateral/);
  assert.match(indexSource, /pnlBandOutcome/);
});
