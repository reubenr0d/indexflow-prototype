import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyToolCalls,
  getOriginalToolName,
  parseToolCallArgs,
  shouldBypassWriteConfirmation,
  shouldSkipWritesForNonInteractiveSession,
  isInteractiveTty,
} from "./agent-runner-confirmation.mjs";

test("parseToolCallArgs falls back to empty object for invalid JSON", () => {
  assert.deepEqual(parseToolCallArgs("{"), {});
});

test("getOriginalToolName strips server prefix for collided MCP tools", () => {
  assert.equal(getOriginalToolName("vault-manager-mcp/open_position"), "open_position");
  assert.equal(getOriginalToolName("open_position"), "open_position");
});

test("classifyToolCalls separates write and read calls in one assistant batch", () => {
  const toolCalls = [
    {
      id: "call_1",
      function: { name: "get_vault_state", arguments: '{"vault":"0xabc"}' },
    },
    {
      id: "call_2",
      function: { name: "vault-manager-mcp/open_position", arguments: '{"vault":"0xabc","size":"1"}' },
    },
  ];

  const writeTools = new Set(["open_position"]);
  const classified = classifyToolCalls(toolCalls, writeTools);

  assert.equal(classified.calls.length, 2);
  assert.equal(classified.readCalls.length, 1);
  assert.equal(classified.writeCalls.length, 1);
  assert.equal(classified.hasWriteCalls, true);
  assert.equal(classified.writeCalls[0].originalName, "open_position");
  assert.deepEqual(classified.writeCalls[0].args, { vault: "0xabc", size: "1" });
});

test("shouldBypassWriteConfirmation bypasses only when non-interactive execute is enabled", () => {
  assert.equal(
    shouldBypassWriteConfirmation({
      confirmWritesEnabled: true,
      dryRun: false,
      hasWriteCalls: true,
      interactiveTty: false,
      nonInteractiveWriteExecute: true,
    }),
    true
  );

  assert.equal(
    shouldBypassWriteConfirmation({
      confirmWritesEnabled: true,
      dryRun: true,
      hasWriteCalls: true,
      interactiveTty: false,
      nonInteractiveWriteExecute: true,
    }),
    false
  );

  assert.equal(
    shouldBypassWriteConfirmation({
      confirmWritesEnabled: true,
      dryRun: false,
      hasWriteCalls: true,
      interactiveTty: false,
      nonInteractiveWriteExecute: false,
    }),
    false
  );
});

test("shouldSkipWritesForNonInteractiveSession skips only in non-interactive live mode without execute override", () => {
  assert.equal(
    shouldSkipWritesForNonInteractiveSession({
      confirmWritesEnabled: true,
      dryRun: false,
      hasWriteCalls: true,
      interactiveTty: false,
      nonInteractiveWriteExecute: false,
    }),
    true
  );

  assert.equal(
    shouldSkipWritesForNonInteractiveSession({
      confirmWritesEnabled: true,
      dryRun: false,
      hasWriteCalls: true,
      interactiveTty: false,
      nonInteractiveWriteExecute: true,
    }),
    false
  );

  assert.equal(
    shouldSkipWritesForNonInteractiveSession({
      confirmWritesEnabled: false,
      dryRun: false,
      hasWriteCalls: true,
      interactiveTty: false,
      nonInteractiveWriteExecute: false,
    }),
    false
  );
});

test("isInteractiveTty requires both stdin and stdout tty", () => {
  assert.equal(isInteractiveTty({ isTTY: true }, { isTTY: true }), true);
  assert.equal(isInteractiveTty({ isTTY: true }, { isTTY: false }), false);
});
