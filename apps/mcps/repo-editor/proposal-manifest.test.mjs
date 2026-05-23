// Unit tests for the proposal-manifest helpers. These are pure and have
// no I/O; the MCP server uses them to mutate `.agent-self-improvement/
// proposed-edits.json` and the PR-opener uses the same helpers to filter
// edits after a risk-officer downsize verdict.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  emptyManifest,
  addReplaceEdit,
  addCreateEdit,
  addRenameEdit,
  listTouchedPaths,
  listTouchedAgents,
  dropLowConviction,
  MANIFEST_VERSION,
} from "./proposal-manifest.js";

test("emptyManifest is versioned and has no edits", () => {
  const m = emptyManifest();
  assert.equal(m.version, MANIFEST_VERSION);
  assert.deepEqual(m.edits, []);
  assert.ok(m.createdAt);
  assert.ok(m.updatedAt);
});

test("addReplaceEdit appends an edit with a stable id", () => {
  const m = emptyManifest();
  const r = addReplaceEdit(m, {
    path: "agents/foo.md",
    replacements: [{ search: "Close losers at -6%", replace: "Close losers at -5%" }],
    justification: "tighter stop",
    convictionWeight: 0.8,
  });
  assert.equal(r.added, true);
  assert.equal(m.edits.length, 1);
  assert.equal(m.edits[0].kind, "replace");
  assert.equal(m.edits[0].convictionWeight, 0.8);
  assert.equal(m.edits[0].id.length, 12);
});

test("addReplaceEdit dedupes identical proposals", () => {
  const m = emptyManifest();
  const payload = {
    path: "agents/foo.md",
    replacements: [{ search: "A", replace: "B" }],
    justification: "first",
  };
  const r1 = addReplaceEdit(m, payload);
  const r2 = addReplaceEdit(m, payload);
  assert.equal(r1.added, true);
  assert.equal(r2.added, false);
  assert.equal(m.edits.length, 1);
});

test("addReplaceEdit rejects empty replacements", () => {
  const m = emptyManifest();
  assert.throws(() => addReplaceEdit(m, { path: "agents/foo.md", replacements: [] }), /non-empty array/);
});

test("addReplaceEdit rejects no-op edits (search === replace)", () => {
  const m = emptyManifest();
  assert.throws(
    () => addReplaceEdit(m, {
      path: "agents/foo.md",
      replacements: [{ search: "X", replace: "X" }],
    }),
    /must differ/,
  );
});

test("addReplaceEdit clamps convictionWeight into [0,1]", () => {
  const m = emptyManifest();
  addReplaceEdit(m, {
    path: "agents/a.md",
    replacements: [{ search: "x", replace: "y" }],
    convictionWeight: 9,
  });
  addReplaceEdit(m, {
    path: "agents/b.md",
    replacements: [{ search: "x", replace: "y" }],
    convictionWeight: -5,
  });
  addReplaceEdit(m, {
    path: "agents/c.md",
    replacements: [{ search: "x", replace: "y" }],
    convictionWeight: "garbage",
  });
  assert.equal(m.edits[0].convictionWeight, 1);
  assert.equal(m.edits[1].convictionWeight, 0);
  assert.equal(m.edits[2].convictionWeight, 0.5);
});

test("addCreateEdit appends and dedupes new-file proposals", () => {
  const m = emptyManifest();
  const r1 = addCreateEdit(m, {
    path: "agents/skills/new-skill.md",
    contents: "# New skill\n",
    justification: "extract repeated workflow",
  });
  const r2 = addCreateEdit(m, {
    path: "agents/skills/new-skill.md",
    contents: "# New skill\n",
  });
  assert.equal(r1.added, true);
  assert.equal(r2.added, false);
  assert.equal(m.edits.length, 1);
});

test("addCreateEdit rejects empty contents", () => {
  const m = emptyManifest();
  assert.throws(() => addCreateEdit(m, { path: "agents/skills/x.md", contents: "" }), /non-empty/);
});

test("addRenameEdit captures both paths and dedupes", () => {
  const m = emptyManifest();
  addRenameEdit(m, {
    path: "agents/skills/old.md",
    newPath: "agents/skills/new.md",
    justification: "rename for clarity",
  });
  assert.equal(m.edits.length, 1);
  assert.equal(m.edits[0].kind, "rename");
  assert.equal(m.edits[0].newPath, "agents/skills/new.md");
});

test("addRenameEdit rejects same path", () => {
  const m = emptyManifest();
  assert.throws(
    () => addRenameEdit(m, { path: "a", newPath: "a", justification: "x" }),
    /must differ/,
  );
});

test("listTouchedPaths returns sorted unique paths including rename targets", () => {
  const m = emptyManifest();
  addReplaceEdit(m, {
    path: "agents/quality-matrix-manager.md",
    replacements: [{ search: "a", replace: "b" }],
  });
  addCreateEdit(m, { path: "agents/skills/new.md", contents: "x" });
  addRenameEdit(m, { path: "agents/skills/old.md", newPath: "agents/skills/renamed.md" });
  assert.deepEqual(listTouchedPaths(m), [
    "agents/quality-matrix-manager.md",
    "agents/skills/new.md",
    "agents/skills/old.md",
    "agents/skills/renamed.md",
  ]);
});

test("listTouchedAgents extracts agent names only from agents/<name>.md", () => {
  const m = emptyManifest();
  addReplaceEdit(m, {
    path: "agents/quality-matrix-manager.md",
    replacements: [{ search: "a", replace: "b" }],
  });
  addReplaceEdit(m, {
    path: "agents/mining-manager.md",
    replacements: [{ search: "a", replace: "b" }],
  });
  addReplaceEdit(m, {
    path: "agents/skills/atlas-quality.md",
    replacements: [{ search: "a", replace: "b" }],
  });
  addReplaceEdit(m, {
    path: "scripts/agent-runner.mjs",
    replacements: [{ search: "a", replace: "b" }],
  });
  assert.deepEqual(listTouchedAgents(m), ["mining-manager", "quality-matrix-manager"]);
});

test("dropLowConviction filters and returns kept + dropped sets", () => {
  const m = emptyManifest();
  addReplaceEdit(m, {
    path: "agents/a.md",
    replacements: [{ search: "x", replace: "y" }],
    convictionWeight: 0.9,
  });
  addReplaceEdit(m, {
    path: "agents/b.md",
    replacements: [{ search: "x", replace: "y" }],
    convictionWeight: 0.3,
  });
  const { kept, dropped } = dropLowConviction(m, 0.5);
  assert.equal(kept.edits.length, 1);
  assert.equal(kept.edits[0].path, "agents/a.md");
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].path, "agents/b.md");
});
