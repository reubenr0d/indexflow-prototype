// Unit tests for the pure helpers in
// scripts/apply-self-improvement-issues.mjs. We do NOT exercise the
// orchestrator end-to-end (that would need a temp manifest + fake gh).
// Those flows are validated by the CI workflow's manual `--dry-run`
// step.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  readIssueCap,
  buildIssueBody,
  buildIssueTitle,
  shouldSkipProposal,
  applyCapFilter,
  buildGhCreateArgs,
  requiredIssueLabelNames,
  labelBootstrapFailures,
} from "./apply-self-improvement-issues.mjs";

import {
  formatIssueBody,
  ISSUE_ID_MARKER_PREFIX,
  CATEGORY_ENUM,
} from "../apps/mcps/repo-editor/issue-manifest.js";
import {
  ISSUE_LABELS,
  buildLabelCreateArgs,
} from "../apps/mcps/repo-editor/agent-labels.js";

function proposal(overrides = {}) {
  return {
    id: "abcd1234ef99",
    title: "Consider adding an Atlas news MCP",
    body: "Atlas has richer mining-specific feeds than yfinance_news.",
    category: "new_mcp_or_skill",
    justification: "Observed multiple runs where the bearish-headline gate had no usable yfinance hit.",
    convictionWeight: 0.7,
    createdAt: "2026-05-23T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// readIssueCap
// ---------------------------------------------------------------------------

test("readIssueCap defaults to 10 when env var is missing", () => {
  assert.equal(readIssueCap({}), 10);
});

test("readIssueCap respects a valid integer env var", () => {
  assert.equal(readIssueCap({ MAX_OPEN_SELF_IMPROVER_ISSUES: "5" }), 5);
  assert.equal(readIssueCap({ MAX_OPEN_SELF_IMPROVER_ISSUES: "25" }), 25);
});

test("readIssueCap falls back to default on garbage", () => {
  assert.equal(readIssueCap({ MAX_OPEN_SELF_IMPROVER_ISSUES: "abc" }), 10);
  assert.equal(readIssueCap({ MAX_OPEN_SELF_IMPROVER_ISSUES: "-3" }), 10);
});

// ---------------------------------------------------------------------------
// buildIssueBody (round-trips via formatIssueBody)
// ---------------------------------------------------------------------------

test("buildIssueBody embeds the id marker and signal context", () => {
  const body = buildIssueBody({
    issue: proposal(),
    signals: [{ kind: "recurring_losers", agent: "mining-manager", summary: "GSR.V 2x" }],
  });
  assert.match(body, new RegExp(`${ISSUE_ID_MARKER_PREFIX}\\s*abcd1234ef99`));
  assert.match(body, /recurring_losers/);
});

test("buildIssueBody defaults agentName to 'self-improver-issues' so the agent-finding form's Agent name field is populated", () => {
  const body = buildIssueBody({ issue: proposal(), signals: [] });
  // The Agent name line is rendered by formatIssueBody whenever agentName
  // is provided. Defaulting at the buildIssueBody layer means the opener
  // never produces a body with a blank Agent name field.
  assert.match(body, /\*\*Agent name\*\*:\s*`self-improver-issues`/);
});

test("buildIssueBody respects an explicit agentName override on the Agent name field", () => {
  const body = buildIssueBody({
    issue: proposal(),
    signals: [],
    agentName: "human-curator",
  });
  assert.match(body, /\*\*Agent name\*\*:\s*`human-curator`/);
  // The "Agent name" field itself must NOT carry the default identity
  // even though the static footer comment may mention `self-improver-issues`
  // (the footer describes the channel, not the per-issue agent identity).
  assert.ok(
    !body.includes("**Agent name**: `self-improver-issues`"),
    "Agent name field should not fall back to the default when overridden",
  );
});

test("buildIssueBody produces a body identical to formatIssueBody when both are passed agentName", () => {
  const issue = proposal();
  const signals = [{ kind: "loss_streak", agent: "qm", summary: "3 losses in a row" }];
  const a = buildIssueBody({ issue, signals, agentName: "self-improver-issues" });
  const b = formatIssueBody({ issue, signals, agentName: "self-improver-issues" });
  assert.equal(a, b);
});

// ---------------------------------------------------------------------------
// buildIssueTitle — agent-finding template's `agent: ` prefix
// ---------------------------------------------------------------------------

test("buildIssueTitle prepends 'agent: ' to bare manifest titles", () => {
  assert.equal(buildIssueTitle("Consider an Atlas news MCP"), "agent: Consider an Atlas news MCP");
});

test("buildIssueTitle is idempotent (does NOT double-prefix already-prefixed titles)", () => {
  assert.equal(buildIssueTitle("agent: already prefixed"), "agent: already prefixed");
  // Case-insensitive: a human-typed "Agent: Foo" should be treated as
  // already prefixed too, since GitHub renders titles case-as-typed.
  assert.equal(buildIssueTitle("Agent: weird casing"), "Agent: weird casing");
});

test("buildIssueTitle trims surrounding whitespace before prefixing", () => {
  assert.equal(buildIssueTitle("   some idea   "), "agent: some idea");
});

// ---------------------------------------------------------------------------
// shouldSkipProposal — dedup logic
// ---------------------------------------------------------------------------

test("shouldSkipProposal skips when an open issue carries the id marker", () => {
  const open = [
    {
      number: 42,
      title: "Some other title",
      body: `Some content\n<!-- ${ISSUE_ID_MARKER_PREFIX} abcd1234ef99 -->\nfooter`,
    },
  ];
  const r = shouldSkipProposal({ proposal: proposal(), openIssues: open });
  assert.equal(r.skip, true);
  assert.match(r.reason, /id marker/);
  assert.equal(r.dedupeMatch.number, 42);
});

test("shouldSkipProposal skips on exact title match against the raw manifest title", () => {
  // Caught case: a human-filed agent-finding issue whose author omitted
  // the `agent: ` prefix the form auto-applies.
  const open = [
    { number: 7, title: "Consider adding an Atlas news MCP", body: "no marker" },
  ];
  const r = shouldSkipProposal({ proposal: proposal(), openIssues: open });
  assert.equal(r.skip, true);
  assert.match(r.reason, /exact title match/);
});

test("shouldSkipProposal skips on exact title match against the prefixed bot-filed title", () => {
  // Caught case: a previous bot-filed issue whose body no longer carries
  // the marker (e.g. a human edited it out) — the prefixed title still
  // dedups.
  const open = [
    { number: 11, title: "agent: Consider adding an Atlas news MCP", body: "no marker" },
  ];
  const r = shouldSkipProposal({ proposal: proposal(), openIssues: open });
  assert.equal(r.skip, true);
  assert.match(r.reason, /exact title match/);
});

test("shouldSkipProposal does NOT skip when titles differ and no marker matches", () => {
  const open = [
    { number: 1, title: "Unrelated thing", body: "no marker" },
    { number: 2, title: "Different theme", body: "<!-- self-improver-issue-id: zzzzzzzzzzzz -->" },
  ];
  const r = shouldSkipProposal({ proposal: proposal(), openIssues: open });
  assert.equal(r.skip, false);
});

test("shouldSkipProposal handles missing fields defensively", () => {
  const r1 = shouldSkipProposal({ proposal: { title: "x" }, openIssues: [] });
  assert.equal(r1.skip, true);
  const r2 = shouldSkipProposal({ proposal: { id: "x" }, openIssues: [] });
  assert.equal(r2.skip, true);
  const r3 = shouldSkipProposal({ proposal: proposal(), openIssues: null });
  assert.equal(r3.skip, false);
});

// ---------------------------------------------------------------------------
// applyCapFilter — cap-respecting selection
// ---------------------------------------------------------------------------

test("applyCapFilter returns all survivors when headroom suffices", () => {
  const survivors = [proposal({ id: "a", title: "A" }), proposal({ id: "b", title: "B" })];
  const r = applyCapFilter({ survivors, openIssueCount: 3, cap: 10 });
  assert.equal(r.kept.length, 2);
  assert.equal(r.dropped.length, 0);
  assert.equal(r.headroom, 7);
});

test("applyCapFilter drops the lowest-conviction proposals when over headroom", () => {
  const survivors = [
    proposal({ id: "high", title: "Strong", convictionWeight: 0.9 }),
    proposal({ id: "med", title: "Medium", convictionWeight: 0.6 }),
    proposal({ id: "low", title: "Weak", convictionWeight: 0.3 }),
  ];
  const r = applyCapFilter({ survivors, openIssueCount: 8, cap: 10 });
  assert.equal(r.kept.length, 2);
  assert.equal(r.dropped.length, 1);
  assert.equal(r.kept[0].id, "high");
  assert.equal(r.kept[1].id, "med");
  assert.equal(r.dropped[0].id, "low");
});

test("applyCapFilter returns empty kept when cap is full", () => {
  const survivors = [proposal({ id: "a", title: "A" })];
  const r = applyCapFilter({ survivors, openIssueCount: 10, cap: 10 });
  assert.equal(r.kept.length, 0);
  assert.equal(r.dropped.length, 1);
  assert.equal(r.headroom, 0);
});

test("applyCapFilter clamps negative headroom to 0", () => {
  const survivors = [proposal({ id: "a", title: "A" })];
  const r = applyCapFilter({ survivors, openIssueCount: 15, cap: 10 });
  assert.equal(r.kept.length, 0);
  assert.equal(r.headroom, 0);
});

// ---------------------------------------------------------------------------
// buildGhCreateArgs — argv shape pinned to the agent-finding template
// ---------------------------------------------------------------------------

test("buildGhCreateArgs prefixes the title with 'agent: ' (matching agent-finding.yml) and emits all three labels", () => {
  const args = buildGhCreateArgs({ proposal: proposal(), body: "BODY" });
  assert.deepEqual(
    args.slice(0, 4),
    ["issue", "create", "--title", "agent: Consider adding an Atlas news MCP"],
  );
  assert.deepEqual(args.slice(4, 6), ["--body", "BODY"]);
  // Labels match `.github/ISSUE_TEMPLATE/agent-finding.yml` verbatim so
  // bot-filed and human-filed findings share the same triage queue.
  assert.ok(args.includes("agent-finding"));
  assert.ok(args.includes("needs-human-review"));
  assert.ok(args.includes("category:new_mcp_or_skill"));
  // Should NOT include the previous bespoke label pair.
  assert.ok(!args.includes("agent-self-improvement-issue"));
  assert.ok(!args.includes("needs-human-triage"));
});

test("buildGhCreateArgs does not double-prefix titles that already start with 'agent: '", () => {
  const args = buildGhCreateArgs({
    proposal: proposal({ title: "agent: already prefixed" }),
    body: "BODY",
  });
  assert.equal(args[3], "agent: already prefixed");
});

test("buildGhCreateArgs encodes the category from the proposal", () => {
  const args = buildGhCreateArgs({
    proposal: proposal({ category: "investigation" }),
    body: "BODY",
  });
  assert.ok(args.includes("category:investigation"));
});

// ---------------------------------------------------------------------------
// buildLabelCreateArgs + ISSUE_LABELS drift guard
// ---------------------------------------------------------------------------

test("buildLabelCreateArgs pins exact argv shape for gh label create --force", () => {
  const args = buildLabelCreateArgs({
    name: "agent-finding",
    color: "fbca04",
    description: "Issue surfaced by the self-improver-issues agent.",
  });
  assert.deepEqual(args, [
    "label",
    "create",
    "agent-finding",
    "--color",
    "fbca04",
    "--description",
    "Issue surfaced by the self-improver-issues agent.",
    "--force",
  ]);
});

test("ISSUE_LABELS covers every label name buildGhCreateArgs emits (drift guard)", () => {
  // Every label name the issue opener attaches via --label must have
  // a matching spec in ISSUE_LABELS so the bootstrap step can create
  // it before `gh issue create`. If this test fails, you probably
  // added a new CATEGORY_ENUM entry but forgot the matching label
  // spec in apps/mcps/repo-editor/agent-labels.js.
  const labelNames = new Set(ISSUE_LABELS.map((l) => l.name));
  const requiredStatic = ["agent-finding", "needs-human-review"];
  for (const name of requiredStatic) {
    assert.ok(labelNames.has(name), `ISSUE_LABELS missing required static label "${name}"`);
  }
  for (const category of CATEGORY_ENUM) {
    const dynamic = `category:${category}`;
    assert.ok(
      labelNames.has(dynamic),
      `ISSUE_LABELS missing dynamic label "${dynamic}" — add it to apps/mcps/repo-editor/agent-labels.js`,
    );
  }
});

test("ISSUE_LABELS entries declare name + color + description (gh label create requirements)", () => {
  for (const label of ISSUE_LABELS) {
    assert.equal(typeof label.name, "string", "label.name must be a string");
    assert.ok(label.name.length > 0, "label.name must be non-empty");
    assert.match(label.color, /^[0-9a-f]{6}$/i, `label "${label.name}" color must be a 6-char hex string`);
    assert.equal(typeof label.description, "string", `label "${label.name}" description must be a string`);
    assert.ok(label.description.length > 0, `label "${label.name}" description must be non-empty`);
  }
});

// ---------------------------------------------------------------------------
// requiredIssueLabelNames + labelBootstrapFailures — the hard-fail gate
// that converts a `gh label create` HTTP 422 from "could not add label:
// '<x>' not found" cascade noise into an actionable abort. Regression
// guard for the May 2026 105-char-description bug.
// ---------------------------------------------------------------------------

test("requiredIssueLabelNames always includes the two static labels", () => {
  const names = requiredIssueLabelNames([]);
  assert.ok(names.has("agent-finding"));
  assert.ok(names.has("needs-human-review"));
  assert.equal(names.size, 2);
});

test("requiredIssueLabelNames adds the dynamic category:<x> labels referenced by the proposals", () => {
  const names = requiredIssueLabelNames([
    proposal({ category: "new_mcp_or_skill" }),
    proposal({ category: "investigation" }),
    proposal({ category: "new_mcp_or_skill" }), // duplicate — dedupes
  ]);
  assert.ok(names.has("agent-finding"));
  assert.ok(names.has("needs-human-review"));
  assert.ok(names.has("category:new_mcp_or_skill"));
  assert.ok(names.has("category:investigation"));
  assert.equal(names.size, 4);
});

test("labelBootstrapFailures returns empty when every required label succeeded", () => {
  const failures = labelBootstrapFailures({
    ensureResults: [
      { name: "agent-finding", ok: true },
      { name: "needs-human-review", ok: true },
      { name: "category:new_mcp_or_skill", ok: true },
    ],
    requiredNames: requiredIssueLabelNames([proposal()]),
  });
  assert.deepEqual(failures, []);
});

test("labelBootstrapFailures isolates required-label failures from soft-fail (unused-label) failures", () => {
  const requiredNames = requiredIssueLabelNames([proposal({ category: "new_mcp_or_skill" })]);
  const failures = labelBootstrapFailures({
    ensureResults: [
      { name: "agent-finding", ok: false, message: "HTTP 422: description too long" },
      { name: "needs-human-review", ok: true },
      { name: "category:new_mcp_or_skill", ok: true },
      // Unused-this-tick failure — must NOT block the run.
      { name: "category:refactor", ok: false, message: "transient" },
    ],
    requiredNames,
  });
  assert.equal(failures.length, 1);
  assert.equal(failures[0].name, "agent-finding");
  assert.match(failures[0].message, /description too long/);
});

test("labelBootstrapFailures handles missing ensureResults defensively (returns empty)", () => {
  assert.deepEqual(
    labelBootstrapFailures({ ensureResults: null, requiredNames: new Set(["agent-finding"]) }),
    [],
  );
});
