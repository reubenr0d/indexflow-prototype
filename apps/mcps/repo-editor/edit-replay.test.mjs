// Unit tests for the shared edit-replay helpers in
// `apps/mcps/repo-editor/edit-replay.js`. Pure — no IO, no spawn.
// These pin the cross-edit invariants used by both the MCP propose
// handler (`propose_file_edit`) and the post-risk-officer applier
// (`scripts/apply-self-improvement-proposals.mjs::applyEditsToWorkingTree`).

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  previewReplaceEdit,
  replayPriorEdits,
} from "./edit-replay.js";

// ---------------------------------------------------------------------------
// previewReplaceEdit — within a single edit's replacements[]
// ---------------------------------------------------------------------------

test("previewReplaceEdit applies a single matching replacement", () => {
  const r = previewReplaceEdit({
    filePath: "x.md",
    contents: "alpha beta gamma",
    replacements: [{ search: "beta", replace: "BETA" }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.newContents, "alpha BETA gamma");
});

test("previewReplaceEdit applies multiple replacements sequentially", () => {
  const r = previewReplaceEdit({
    filePath: "x.md",
    contents: "one two three",
    replacements: [
      { search: "one", replace: "1" },
      { search: "three", replace: "3" },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.newContents, "1 two 3");
});

test("previewReplaceEdit rejects a missing `search` with SEARCH_NOT_FOUND + replacementIndex", () => {
  const r = previewReplaceEdit({
    filePath: "x.md",
    contents: "hello world",
    replacements: [{ search: "missing", replace: "X" }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.error_code, "SEARCH_NOT_FOUND");
  assert.equal(r.replacementIndex, 0);
  assert.match(r.message, /Replacement #1/);
});

test("previewReplaceEdit rejects an ambiguous `search` (appears more than once)", () => {
  const r = previewReplaceEdit({
    filePath: "x.md",
    contents: "foo foo bar",
    replacements: [{ search: "foo", replace: "F" }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.error_code, "SEARCH_AMBIGUOUS");
  assert.equal(r.replacementIndex, 0);
});

test("previewReplaceEdit catches the second replacement when the first removed its anchor", () => {
  const r = previewReplaceEdit({
    filePath: "x.md",
    contents: "abc def ghi",
    replacements: [
      { search: "abc def ", replace: "" },
      { search: "abc", replace: "AAA" },
    ],
  });
  assert.equal(r.ok, false);
  assert.equal(r.error_code, "SEARCH_NOT_FOUND");
  assert.equal(r.replacementIndex, 1);
});

// ---------------------------------------------------------------------------
// replayPriorEdits — cross-edit invariant: validating a NEW edit against
// the post-replay scratch buffer (the same state the applier will see)
// ---------------------------------------------------------------------------

function manifest(edits) {
  return { version: 1, edits };
}

test("replayPriorEdits with no prior edits returns the base contents unchanged", () => {
  const r = replayPriorEdits({
    manifest: manifest([]),
    targetPath: "agents/foo.md",
    baseContents: "hello",
  });
  assert.equal(r.ok, true);
  assert.equal(r.scratch, "hello");
});

test("replayPriorEdits applies prior replace edits targeting the same path", () => {
  const r = replayPriorEdits({
    manifest: manifest([
      {
        id: "first",
        kind: "replace",
        path: "agents/foo.md",
        replacements: [{ search: "alpha", replace: "ALPHA" }],
      },
    ]),
    targetPath: "agents/foo.md",
    baseContents: "alpha beta",
  });
  assert.equal(r.ok, true);
  assert.equal(r.scratch, "ALPHA beta");
});

test("replayPriorEdits ignores edits targeting a different path", () => {
  const r = replayPriorEdits({
    manifest: manifest([
      {
        id: "unrelated",
        kind: "replace",
        path: "agents/bar.md",
        replacements: [{ search: "alpha", replace: "X" }],
      },
    ]),
    targetPath: "agents/foo.md",
    baseContents: "alpha beta",
  });
  assert.equal(r.ok, true);
  assert.equal(r.scratch, "alpha beta");
});

test("replayPriorEdits ignores non-replace edits (create / rename)", () => {
  const r = replayPriorEdits({
    manifest: manifest([
      { id: "create", kind: "create", path: "agents/foo.md", contents: "noise" },
      { id: "rename", kind: "rename", path: "agents/foo.md", newPath: "agents/baz.md" },
    ]),
    targetPath: "agents/foo.md",
    baseContents: "alpha beta",
  });
  assert.equal(r.ok, true);
  assert.equal(r.scratch, "alpha beta");
});

test("replayPriorEdits returns PRIOR_EDIT_REPLAY_FAILED when a prior edit's search no longer matches", () => {
  // Simulates an out-of-band edit (or a buggy prior proposal) that the
  // manifest still claims is applicable. The MCP's propose_file_edit
  // refuses to stack another edit on a corrupt manifest.
  const r = replayPriorEdits({
    manifest: manifest([
      {
        id: "stale",
        kind: "replace",
        path: "agents/foo.md",
        replacements: [{ search: "missing-anchor", replace: "X" }],
      },
    ]),
    targetPath: "agents/foo.md",
    baseContents: "alpha beta",
  });
  assert.equal(r.ok, false);
  assert.equal(r.error_code, "PRIOR_EDIT_REPLAY_FAILED");
  assert.equal(r.offendingEditId, "stale");
  assert.match(r.message, /no longer applies/);
});

// ---------------------------------------------------------------------------
// Cross-edit interference: the failure mode the May 2026 SEARCH_NOT_FOUND
// regression was hiding. Two edits, same file, edit A removes the
// anchor edit B's `search` depends on. Without replay, B passes at
// propose-time and fails at apply-time. With replay, B is caught
// at propose-time.
// ---------------------------------------------------------------------------

test("cross-edit interference: validating a new edit against the post-replay scratch catches anchor removal", () => {
  const baseContents = "## Workflow\n\n- step one\n- step two\n";
  const m = manifest([
    {
      id: "editA",
      kind: "replace",
      path: "agents/foo.md",
      replacements: [{ search: "- step one\n- step two\n", replace: "- step ONE\n- step TWO\n" }],
    },
  ]);
  // Edit B tries to tweak "step two" — but edit A already rewrote it.
  // Without replay this would pass; with replay it correctly fails.
  const replay = replayPriorEdits({
    manifest: m,
    targetPath: "agents/foo.md",
    baseContents,
  });
  assert.equal(replay.ok, true);
  const previewB = previewReplaceEdit({
    filePath: "agents/foo.md",
    contents: replay.scratch,
    replacements: [{ search: "- step two", replace: "- step TWO (revised)" }],
  });
  assert.equal(previewB.ok, false);
  assert.equal(previewB.error_code, "SEARCH_NOT_FOUND");
});
