// Unit tests for issue-manifest helpers. Pure; no IO, no network.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  emptyIssueManifest,
  addIssue,
  findDuplicateIssue,
  dropLowConvictionIssues,
  listIssueCategories,
  listIssueIds,
  formatIssueBody,
  extractIssueIdMarker,
  MAX_TITLE_CHARS,
  MAX_BODY_CHARS,
  CATEGORY_ENUM,
  ISSUE_ID_MARKER_PREFIX,
  ISSUE_MANIFEST_VERSION,
} from "./issue-manifest.js";

function payload(overrides = {}) {
  return {
    title: "Consider adding an Atlas news MCP",
    body: "The quality-matrix-manager already calls yfinance_news, but Atlas has richer mining-specific feeds.",
    category: "new_mcp_or_skill",
    justification: "Observed 4 runs where the bearish-headline gate had no usable yfinance hit.",
    convictionWeight: 0.6,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// emptyIssueManifest
// ---------------------------------------------------------------------------

test("emptyIssueManifest is versioned and has no issues", () => {
  const m = emptyIssueManifest();
  assert.equal(m.version, ISSUE_MANIFEST_VERSION);
  assert.deepEqual(m.issues, []);
  assert.ok(m.createdAt);
  assert.ok(m.updatedAt);
  assert.equal(m.agent, "self-improver-issues");
});

// ---------------------------------------------------------------------------
// addIssue happy path + dedupe
// ---------------------------------------------------------------------------

test("addIssue appends a fully-shaped issue with a deterministic id", () => {
  const m = emptyIssueManifest();
  const r = addIssue(m, payload());
  assert.equal(r.added, true);
  assert.equal(m.issues.length, 1);
  const i = m.issues[0];
  assert.equal(i.title, payload().title);
  assert.equal(i.category, "new_mcp_or_skill");
  assert.equal(i.convictionWeight, 0.6);
  assert.equal(i.id.length, 12);
  assert.match(i.id, /^[a-f0-9]{12}$/);
});

test("addIssue dedupes by exact title match", () => {
  const m = emptyIssueManifest();
  const r1 = addIssue(m, payload());
  const r2 = addIssue(m, payload());
  assert.equal(r1.added, true);
  assert.equal(r2.added, false);
  assert.equal(m.issues.length, 1);
});

test("addIssue clamps convictionWeight into [0,1]", () => {
  const m = emptyIssueManifest();
  addIssue(m, payload({ title: "Issue A", convictionWeight: 9 }));
  addIssue(m, payload({ title: "Issue B", convictionWeight: -3 }));
  addIssue(m, payload({ title: "Issue C", convictionWeight: "garbage" }));
  assert.equal(m.issues[0].convictionWeight, 1);
  assert.equal(m.issues[1].convictionWeight, 0);
  assert.equal(m.issues[2].convictionWeight, 0.5);
});

// ---------------------------------------------------------------------------
// addIssue validation
// ---------------------------------------------------------------------------

test("addIssue rejects empty / missing fields", () => {
  const m = emptyIssueManifest();
  assert.throws(() => addIssue(m, payload({ title: "" })), /title/);
  assert.throws(() => addIssue(m, payload({ body: "" })), /body/);
  assert.throws(() => addIssue(m, payload({ justification: "" })), /justification/);
});

test("addIssue rejects oversized title and body", () => {
  const m = emptyIssueManifest();
  assert.throws(
    () => addIssue(m, payload({ title: "x".repeat(MAX_TITLE_CHARS + 1) })),
    /MAX_TITLE_CHARS/,
  );
  assert.throws(
    () => addIssue(m, payload({ title: "Big body issue", body: "y".repeat(MAX_BODY_CHARS + 1) })),
    /MAX_BODY_CHARS/,
  );
});

test("addIssue rejects categories outside the enum", () => {
  const m = emptyIssueManifest();
  assert.throws(() => addIssue(m, payload({ category: "rebalance_bug" })), /category/);
});

test("addIssue trims justification and caps it at 4000 chars", () => {
  const m = emptyIssueManifest();
  addIssue(m, payload({ justification: "  short justification with leading whitespace  " }));
  assert.equal(m.issues[0].justification, "short justification with leading whitespace");

  const m2 = emptyIssueManifest();
  addIssue(m2, payload({ title: "Long justification", justification: "a".repeat(5000) }));
  assert.equal(m2.issues[0].justification.length, 4000);
});

// ---------------------------------------------------------------------------
// findDuplicateIssue
// ---------------------------------------------------------------------------

test("findDuplicateIssue matches both id-hash collisions and exact-title collisions", () => {
  const m = emptyIssueManifest();
  addIssue(m, payload());
  const sameTitle = findDuplicateIssue(m, payload().title);
  assert.ok(sameTitle);
  const noMatch = findDuplicateIssue(m, "Some other title");
  assert.equal(noMatch, null);
});

// ---------------------------------------------------------------------------
// dropLowConvictionIssues
// ---------------------------------------------------------------------------

test("dropLowConvictionIssues splits by threshold and returns kept + dropped", () => {
  const m = emptyIssueManifest();
  addIssue(m, payload({ title: "Strong A", convictionWeight: 0.9 }));
  addIssue(m, payload({ title: "Borderline B", convictionWeight: 0.5 }));
  addIssue(m, payload({ title: "Weak C", convictionWeight: 0.2 }));
  const { kept, dropped } = dropLowConvictionIssues(m, 0.6);
  assert.equal(kept.issues.length, 1);
  assert.equal(kept.issues[0].title, "Strong A");
  assert.equal(dropped.length, 2);
});

test("dropLowConvictionIssues is a no-op for non-finite threshold", () => {
  const m = emptyIssueManifest();
  addIssue(m, payload());
  const { kept, dropped } = dropLowConvictionIssues(m, "nope");
  assert.equal(kept, m);
  assert.equal(dropped.length, 0);
});

// ---------------------------------------------------------------------------
// listIssueCategories + listIssueIds
// ---------------------------------------------------------------------------

test("listIssueCategories returns sorted unique categories", () => {
  const m = emptyIssueManifest();
  addIssue(m, payload({ title: "A", category: "strategy_idea" }));
  addIssue(m, payload({ title: "B", category: "strategy_idea" }));
  addIssue(m, payload({ title: "C", category: "data_gap" }));
  assert.deepEqual(listIssueCategories(m), ["data_gap", "strategy_idea"]);
});

test("listIssueIds returns each id once in insertion order", () => {
  const m = emptyIssueManifest();
  addIssue(m, payload({ title: "Issue I" }));
  addIssue(m, payload({ title: "Issue II" }));
  assert.equal(listIssueIds(m).length, 2);
  assert.notEqual(listIssueIds(m)[0], listIssueIds(m)[1]);
});

// ---------------------------------------------------------------------------
// formatIssueBody + extractIssueIdMarker round-trip
// ---------------------------------------------------------------------------

test("formatIssueBody embeds the id marker for round-trip dedupe", () => {
  const m = emptyIssueManifest();
  addIssue(m, payload());
  const issue = m.issues[0];
  const body = formatIssueBody({ issue, signals: [{ kind: "recurring_losers", agent: "qm", summary: "GSR.V 2x" }] });
  assert.match(body, new RegExp(`${ISSUE_ID_MARKER_PREFIX}\\s*${issue.id}`));
  assert.match(body, /Category.*new_mcp_or_skill/);
  assert.match(body, /recurring_losers/);
  assert.match(body, /Auto-filed/);
});

test("formatIssueBody fields render in the same order as agent-finding.yml", () => {
  // Order on the form (and therefore in the rendered body) is:
  // 1. Category   2. Summary   3. Agent name   4. Justification
  // 5. Conviction 6. Trigger signals           7. Marker footer
  const m = emptyIssueManifest();
  addIssue(m, payload());
  const issue = m.issues[0];
  const body = formatIssueBody({
    issue,
    signals: [{ kind: "recurring_losers", agent: "qm", summary: "GSR.V 2x" }],
    agentName: "self-improver-issues",
  });
  const idx = (needle) => body.indexOf(needle);
  assert.ok(idx("**Category**") >= 0, "Category present");
  assert.ok(idx("## Summary") > idx("**Category**"), "Summary after Category");
  assert.ok(idx("**Agent name**") > idx("## Summary"), "Agent name after Summary");
  assert.ok(idx("## Justification") > idx("**Agent name**"), "Justification after Agent name");
  assert.ok(idx("**Conviction") > idx("## Justification"), "Conviction after Justification");
  assert.ok(idx("## Trigger signals") > idx("**Conviction"), "Trigger signals after Conviction");
  assert.ok(idx(ISSUE_ID_MARKER_PREFIX) > idx("## Trigger signals"), "Marker is the very last block");
});

test("formatIssueBody omits the Agent name line when none is supplied", () => {
  const m = emptyIssueManifest();
  addIssue(m, payload());
  const body = formatIssueBody({ issue: m.issues[0] });
  assert.ok(!body.includes("**Agent name**"), "Agent name absent when not passed");
  // Footer marker still present.
  assert.match(body, new RegExp(ISSUE_ID_MARKER_PREFIX));
});

test("formatIssueBody omits the Trigger signals section when none fired", () => {
  const m = emptyIssueManifest();
  addIssue(m, payload());
  const body = formatIssueBody({ issue: m.issues[0], signals: [] });
  assert.ok(!body.includes("## Trigger signals"));
});

test("extractIssueIdMarker round-trips an id baked into a body", () => {
  const m = emptyIssueManifest();
  addIssue(m, payload());
  const body = formatIssueBody({ issue: m.issues[0] });
  const id = extractIssueIdMarker(body);
  assert.equal(id, m.issues[0].id);
});

test("extractIssueIdMarker returns null when no marker is present", () => {
  assert.equal(extractIssueIdMarker("plain body with no marker"), null);
  assert.equal(extractIssueIdMarker(""), null);
  assert.equal(extractIssueIdMarker(null), null);
});

// ---------------------------------------------------------------------------
// CATEGORY_ENUM contract
// ---------------------------------------------------------------------------

test("CATEGORY_ENUM contains exactly the seven shipped categories", () => {
  assert.deepEqual(
    [...CATEGORY_ENUM].sort(),
    [
      "data_gap",
      "investigation",
      "new_mcp_or_skill",
      "partnership-blocker",
      "refactor",
      "strategy_idea",
      "vault-concept",
    ],
  );
});
