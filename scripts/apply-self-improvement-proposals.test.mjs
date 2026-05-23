// Unit tests for the pure helpers in apply-self-improvement-proposals.mjs.
// The git/gh path is covered by the CI workflow's smoke run; here we
// pin the deterministic seams (search/replace preview, branch naming,
// PR body builder).

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  previewReplaceEdit,
  computeBranchName,
  buildPrTitle,
  buildPrBody,
} from "./apply-self-improvement-proposals.mjs";

// ---------------------------------------------------------------------------
// previewReplaceEdit
// ---------------------------------------------------------------------------

test("previewReplaceEdit applies sequential search/replace and returns new contents", () => {
  const result = previewReplaceEdit({
    filePath: "agents/foo.md",
    contents: "alpha bravo charlie",
    replacements: [
      { search: "bravo", replace: "DELTA" },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.newContents, "alpha DELTA charlie");
});

test("previewReplaceEdit rejects unfound search strings", () => {
  const result = previewReplaceEdit({
    filePath: "agents/foo.md",
    contents: "alpha bravo charlie",
    replacements: [{ search: "DELTA", replace: "x" }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.error_code, "SEARCH_NOT_FOUND");
});

test("previewReplaceEdit rejects ambiguous (non-unique) search strings", () => {
  const result = previewReplaceEdit({
    filePath: "agents/foo.md",
    contents: "alpha bravo alpha bravo",
    replacements: [{ search: "alpha", replace: "X" }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.error_code, "SEARCH_AMBIGUOUS");
});

test("previewReplaceEdit handles multiple sequential replacements that don't conflict", () => {
  const result = previewReplaceEdit({
    filePath: "agents/foo.md",
    contents: "Close losers at -6%. Take profit at +8%.",
    replacements: [
      { search: "-6%", replace: "-5%" },
      { search: "+8%", replace: "+10%" },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.newContents, "Close losers at -5%. Take profit at +10%.");
});

// ---------------------------------------------------------------------------
// computeBranchName + buildPrTitle
// ---------------------------------------------------------------------------

test("computeBranchName produces deterministic names for the same signal set on same UTC date", () => {
  const day = new Date("2026-05-23T00:00:00Z");
  const signals = [{ id: "abc123", kind: "recurring_losers", agent: "qm" }, { id: "def456", kind: "loss_streak", agent: "qm" }];
  const a = computeBranchName({ signals, now: day });
  const b = computeBranchName({ signals: [...signals].reverse(), now: day });
  assert.equal(a, b, "branch name must be stable regardless of signal order");
  assert.match(a, /^agent-improve\/2026-05-23-[0-9a-f]{8}$/);
});

test("computeBranchName falls back to a nosignal suffix when no signals fired", () => {
  const day = new Date("2026-05-23T00:00:00Z");
  assert.equal(computeBranchName({ signals: [], now: day }), "agent-improve/2026-05-23-nosignal");
});

test("buildPrTitle includes the first agent and unique signal kinds", () => {
  const title = buildPrTitle({
    signals: [
      { kind: "recurring_losers", agent: "qm" },
      { kind: "recurring_losers", agent: "qm" },
      { kind: "new_error_code", agent: "qm" },
    ],
  });
  assert.match(title, /^agent: self-improvement \(qm\) — /);
  assert.ok(title.includes("recurring_losers"));
  assert.ok(title.includes("new_error_code"));
});

// ---------------------------------------------------------------------------
// buildPrBody
// ---------------------------------------------------------------------------

test("buildPrBody renders a complete markdown body with every section", () => {
  const body = buildPrBody({
    manifest: {
      edits: [
        {
          id: "edit-1",
          kind: "replace",
          path: "agents/qm.md",
          convictionWeight: 0.8,
          requiresReviewKind: null,
          justification: "evidence A, evidence B",
        },
      ],
    },
    verdict: { verdict: "approve", reason: "symmetry with short side", kind: "approve" },
    signals: [{ kind: "recurring_losers", agent: "qm", network: "sepolia", summary: "GSR.V 2x" }],
    housekeeping: [
      { applied: true, sourceFile: "agents/memory/qm/run-log.sepolia.jsonl", archiveFile: "agents/memory/qm/archive/run-log.sepolia.rotated-2026-05-23.jsonl", entryCount: 12 },
    ],
    touchedPaths: ["agents/qm.md"],
  });
  assert.match(body, /Trigger signals/);
  assert.match(body, /Proposed edits/);
  assert.match(body, /edit-1/);
  assert.match(body, /Risk officer verdict/);
  assert.match(body, /Housekeeping rotations/);
  assert.match(body, /needs-human-review/);
});

test("buildPrBody handles missing verdict + zero housekeeping gracefully", () => {
  const body = buildPrBody({
    manifest: { edits: [] },
    verdict: null,
    signals: [],
    housekeeping: [],
    touchedPaths: [],
  });
  assert.match(body, /verdict file missing/);
  assert.match(body, /\(no signals/);
  assert.ok(!body.includes("Housekeeping rotations"));
});
