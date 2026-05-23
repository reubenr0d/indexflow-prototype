// Unit tests for the pure helpers exported by
// scripts/run-self-improvement-issue-risk-officer.mjs. We do NOT exercise
// the orchestrator end-to-end here (that would need a fake LLM + fake gh
// + a temp manifest) — those are covered by manual `--dry-run`
// invocations and by the integration smoke in CI.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildIssueRiskOfficerUserPayload,
  applyVerdictToIssueManifest,
  checkCapPreflight,
} from "./run-self-improvement-issue-risk-officer.mjs";

function manifestWith(issues) {
  return {
    version: 1,
    agent: "self-improver-issues",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    issues: issues.map((i) => ({
      id: i.id,
      title: i.title,
      body: i.body || "body markdown",
      category: i.category || "strategy_idea",
      justification: i.justification || "justification",
      convictionWeight: i.convictionWeight ?? 0.6,
      createdAt: "2026-05-23T00:00:00.000Z",
    })),
  };
}

// ---------------------------------------------------------------------------
// buildIssueRiskOfficerUserPayload
// ---------------------------------------------------------------------------

test("buildIssueRiskOfficerUserPayload includes manifest, signals, openIssues and cap", () => {
  const manifest = manifestWith([{ id: "aaaa1111bbbb", title: "Pitch A" }]);
  const payload = buildIssueRiskOfficerUserPayload({
    manifest,
    signals: [{ kind: "recurring_losers", agent: "mining-manager" }],
    openIssues: [{ number: 123, title: "Existing issue" }],
    cap: 10,
    recentVerdicts: [{ verdict: "approve", reason: "ok" }],
  });
  assert.equal(payload.manifest.issues.length, 1);
  assert.equal(payload.manifest.issues[0].id, "aaaa1111bbbb");
  assert.equal(payload.signals.length, 1);
  assert.equal(payload.openIssues.length, 1);
  assert.equal(payload.currentOpenIssueCount, 1);
  assert.equal(payload.cap, 10);
  assert.equal(payload.recentSelfImproverIssueRuns.length, 1);
});

test("buildIssueRiskOfficerUserPayload trims recentSelfImproverIssueRuns to last 10", () => {
  const manifest = manifestWith([{ id: "x", title: "P" }]);
  const recent = Array.from({ length: 25 }, (_, i) => ({ verdict: "approve", idx: i }));
  const payload = buildIssueRiskOfficerUserPayload({
    manifest,
    signals: [],
    openIssues: [],
    cap: 10,
    recentVerdicts: recent,
  });
  assert.equal(payload.recentSelfImproverIssueRuns.length, 10);
  assert.equal(payload.recentSelfImproverIssueRuns[0].idx, 15);
});

// ---------------------------------------------------------------------------
// applyVerdictToIssueManifest
// ---------------------------------------------------------------------------

test("applyVerdictToIssueManifest leaves manifest untouched on approve", () => {
  const manifest = manifestWith([
    { id: "aaa", title: "A" },
    { id: "bbb", title: "B", convictionWeight: 0.3 },
  ]);
  const r = applyVerdictToIssueManifest({ manifest, verdict: { verdict: "approve", reason: "ok" } });
  assert.equal(r.kind, "approve");
  assert.equal(r.manifest.issues.length, 2);
  assert.equal(r.dropped.length, 0);
});

test("applyVerdictToIssueManifest clears all issues on veto", () => {
  const manifest = manifestWith([
    { id: "aaa", title: "A" },
    { id: "bbb", title: "B" },
  ]);
  const r = applyVerdictToIssueManifest({ manifest, verdict: { verdict: "veto", reason: "spam" } });
  assert.equal(r.kind, "veto");
  assert.equal(r.manifest.issues.length, 0);
  assert.equal(r.dropped.length, 2);
  assert.equal(r.rejected, true);
});

test("applyVerdictToIssueManifest drops below threshold on downsize", () => {
  const manifest = manifestWith([
    { id: "strong", title: "Strong", convictionWeight: 0.9 },
    { id: "weak", title: "Weak", convictionWeight: 0.3 },
    { id: "border", title: "Border", convictionWeight: 0.55 },
  ]);
  const r = applyVerdictToIssueManifest({
    manifest,
    verdict: { verdict: "downsize", downsizeThreshold: 0.6 },
  });
  assert.equal(r.kind, "downsize");
  assert.equal(r.manifest.issues.length, 1);
  assert.equal(r.manifest.issues[0].id, "strong");
  assert.equal(r.dropped.length, 2);
  assert.equal(r.threshold, 0.6);
});

test("applyVerdictToIssueManifest falls back to approve on malformed downsize threshold", () => {
  const manifest = manifestWith([{ id: "aaa", title: "A", convictionWeight: 0.5 }]);
  const r1 = applyVerdictToIssueManifest({
    manifest,
    verdict: { verdict: "downsize", downsizeThreshold: "nonsense" },
  });
  assert.equal(r1.kind, "approve");
  assert.equal(r1.manifest.issues.length, 1);

  const r2 = applyVerdictToIssueManifest({
    manifest,
    verdict: { verdict: "downsize", downsizeThreshold: 1.5 },
  });
  assert.equal(r2.kind, "approve");

  const r3 = applyVerdictToIssueManifest({
    manifest,
    verdict: { verdict: "downsize", downsizeThreshold: -0.2 },
  });
  assert.equal(r3.kind, "approve");
});

test("applyVerdictToIssueManifest treats unknown verdict shape as approve", () => {
  const manifest = manifestWith([{ id: "aaa", title: "A" }]);
  const r = applyVerdictToIssueManifest({ manifest, verdict: null });
  assert.equal(r.kind, "approve");
  assert.equal(r.manifest.issues.length, 1);
});

// ---------------------------------------------------------------------------
// checkCapPreflight
// ---------------------------------------------------------------------------

test("checkCapPreflight vetoes when openIssueCount >= cap", () => {
  const r = checkCapPreflight({ openIssueCount: 10, cap: 10, proposalCount: 2 });
  assert.equal(r.veto, true);
  assert.match(r.reason, /cap full/);
});

test("checkCapPreflight does not veto when there is headroom", () => {
  const r = checkCapPreflight({ openIssueCount: 3, cap: 10, proposalCount: 2 });
  assert.equal(r.veto, false);
  assert.equal(r.reason, "");
});

test("checkCapPreflight flags downsize when headroom < proposalCount but does not veto", () => {
  const r = checkCapPreflight({ openIssueCount: 9, cap: 10, proposalCount: 3 });
  assert.equal(r.veto, false);
  assert.match(r.reason, /headroom is 1/);
});

test("checkCapPreflight tolerates non-finite inputs without crashing", () => {
  const r1 = checkCapPreflight({ openIssueCount: NaN, cap: 10, proposalCount: 1 });
  assert.equal(r1.veto, false);
  const r2 = checkCapPreflight({ openIssueCount: 5, cap: NaN, proposalCount: 1 });
  assert.equal(r2.veto, false);
});
