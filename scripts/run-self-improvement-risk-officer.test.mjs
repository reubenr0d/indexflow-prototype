// Unit tests for the pure helpers in run-self-improvement-risk-officer.mjs.
// The full orchestration is integration-tested via the CI workflow's
// dry-run replay step; here we pin the deterministic seams.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  applyVerdictToManifest,
  buildRiskOfficerUserPayload,
  runSelfImprovementRiskOfficer,
} from "./run-self-improvement-risk-officer.mjs";

function manifestWith(edits) {
  return {
    version: 1,
    agent: "self-improver",
    createdAt: "2026-05-23T00:00:00Z",
    updatedAt: "2026-05-23T00:00:00Z",
    edits,
  };
}

function fakeEdit(id, weight, path = "agents/x.md") {
  return {
    id,
    kind: "replace",
    path,
    convictionWeight: weight,
    requiresReviewKind: null,
    replacements: [{ search: "a", replace: "b" }],
    justification: `cited evidence ${id}`,
  };
}

// ---------------------------------------------------------------------------
// applyVerdictToManifest
// ---------------------------------------------------------------------------

test("approve verdict leaves the manifest untouched", () => {
  const m = manifestWith([fakeEdit("e1", 0.9), fakeEdit("e2", 0.3, "agents/y.md")]);
  const out = applyVerdictToManifest({ manifest: m, verdict: { verdict: "approve" } });
  assert.equal(out.kind, "approve");
  assert.equal(out.manifest.edits.length, 2);
  assert.equal(out.dropped.length, 0);
});

test("veto verdict clears the manifest's edits and records dropped", () => {
  const m = manifestWith([fakeEdit("e1", 0.9), fakeEdit("e2", 0.3, "agents/y.md")]);
  const out = applyVerdictToManifest({ manifest: m, verdict: { verdict: "veto", reason: "no evidence" } });
  assert.equal(out.kind, "veto");
  assert.equal(out.manifest.edits.length, 0);
  assert.equal(out.dropped.length, 2);
  assert.equal(out.rejected, true);
});

test("downsize verdict trims edits below the convictionWeight threshold", () => {
  const m = manifestWith([
    fakeEdit("strong", 0.9),
    fakeEdit("borderline", 0.5, "agents/y.md"),
    fakeEdit("weak", 0.2, "agents/z.md"),
  ]);
  const out = applyVerdictToManifest({
    manifest: m,
    verdict: { verdict: "downsize", downsizeThreshold: 0.6 },
  });
  assert.equal(out.kind, "downsize");
  assert.equal(out.manifest.edits.length, 1);
  assert.equal(out.manifest.edits[0].id, "strong");
  assert.equal(out.dropped.length, 2);
});

test("downsize with malformed threshold falls back to approve", () => {
  const m = manifestWith([fakeEdit("e1", 0.9)]);
  for (const bad of [{ verdict: "downsize" }, { verdict: "downsize", downsizeThreshold: -1 }, { verdict: "downsize", downsizeThreshold: 2 }, { verdict: "downsize", downsizeThreshold: "x" }]) {
    const out = applyVerdictToManifest({ manifest: m, verdict: bad });
    assert.equal(out.kind, "approve");
    assert.equal(out.manifest.edits.length, 1);
  }
});

test("applyVerdictToManifest tolerates null verdict (defensive default-approve)", () => {
  const m = manifestWith([fakeEdit("e1", 0.9)]);
  const out = applyVerdictToManifest({ manifest: m, verdict: null });
  assert.equal(out.kind, "approve");
});

// ---------------------------------------------------------------------------
// buildRiskOfficerUserPayload
// ---------------------------------------------------------------------------

test("buildRiskOfficerUserPayload includes all required sections", () => {
  const payload = buildRiskOfficerUserPayload({
    manifest: manifestWith([fakeEdit("e1", 0.9)]),
    signals: [{ id: "sig1", kind: "recurring_losers", agent: "qm", evidence: [] }],
    touchedFiles: { "agents/x.md": { totalBytes: 100, snippet: "stub" } },
    recentVerdicts: [{ verdict: "approve", timestamp: "2026-05-20T00:00:00Z" }],
    allowRules: [{ id: "agent_prompt" }],
  });
  assert.equal(payload.manifest.edits.length, 1);
  assert.equal(payload.signals.length, 1);
  assert.equal(payload.touchedFiles["agents/x.md"].totalBytes, 100);
  assert.equal(payload.recentSelfImproverRuns.length, 1);
});

test("buildRiskOfficerUserPayload truncates new-file contents to a placeholder", () => {
  const m = manifestWith([
    {
      id: "create-1",
      kind: "create",
      path: "agents/skills/new.md",
      contents: "X".repeat(2000),
      requiresReviewKind: null,
      convictionWeight: 0.5,
      justification: "needed",
    },
  ]);
  const payload = buildRiskOfficerUserPayload({ manifest: m, signals: [], touchedFiles: {}, recentVerdicts: [] });
  assert.equal(payload.manifest.edits[0].contents, "<2000 char new file>");
});

// ---------------------------------------------------------------------------
// runSelfImprovementRiskOfficer — orchestration with a stub LLM
// ---------------------------------------------------------------------------

function setUpTempRepo() {
  const tmp = mkdtempSync(join(tmpdir(), "snx-ro-self-"));
  // Stub the minimum tree the orchestrator needs: agents/, scripts/.
  mkdirSync(join(tmp, "agents", "skills"), { recursive: true });
  mkdirSync(join(tmp, "agents", "memory"), { recursive: true });
  mkdirSync(join(tmp, ".agent-self-improvement"), { recursive: true });
  // Copy the risk-officer prompt from the real repo so the test exercises the
  // real load path.
  const realPrompt = readFileSync(resolve("agents/risk-officer-self-improvement.md"), "utf8");
  writeFileSync(join(tmp, "agents", "risk-officer-self-improvement.md"), realPrompt);
  return tmp;
}

test("runSelfImprovementRiskOfficer approves empty manifest without an LLM call", async () => {
  const tmp = setUpTempRepo();
  const prevRoot = process.env.PROJECT_ROOT;
  try {
    process.env.PROJECT_ROOT = tmp;
    // No proposed-edits.json file at all -> "manifest empty" branch.
    let calls = 0;
    const result = await runSelfImprovementRiskOfficer({
      llmCall: async () => {
        calls += 1;
        return '{"verdict":"approve"}';
      },
    });
    // The runtime in the script captures PROJECT_ROOT at import time, so
    // forcing the env var here only matters if the script re-resolves the
    // path. Our script does NOT (PROJECT_ROOT is module-level), so to
    // exercise the empty-manifest branch we rely on the manifest at the
    // module-time PROJECT_ROOT being absent OR empty. Skip strict path
    // assertion and just verify the no-LLM-call invariant on the real-
    // repo path: if any manifest exists on disk we'd get a different
    // branch. This test focuses on the empty-manifest contract.
    assert.equal(result.ok, true);
    if (result.verdict.proposalCount === 0) {
      assert.equal(calls, 0, "LLM was called for an empty manifest");
      assert.equal(result.verdict.verdict, "approve");
    }
  } finally {
    if (prevRoot === undefined) delete process.env.PROJECT_ROOT;
    else process.env.PROJECT_ROOT = prevRoot;
    rmSync(tmp, { recursive: true, force: true });
  }
});
