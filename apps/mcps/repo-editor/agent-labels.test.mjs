// Unit tests for the label-spec invariants in
// `apps/mcps/repo-editor/agent-labels.js`. These are the load-bearing
// guard rails that prevent a future regression of the 105-char
// `agent-finding` description that originally took down the issue
// opener on 2026-05-23 (GitHub returns HTTP 422 for any description
// over 100 chars, which then cascades into "could not add label:
// 'agent-finding' not found" on every subsequent `gh issue create`).

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  ISSUE_LABELS,
  PR_LABELS,
  GITHUB_LABEL_DESCRIPTION_MAX,
  truncateLabelDescription,
  buildLabelCreateArgs,
} from "./agent-labels.js";

test("GITHUB_LABEL_DESCRIPTION_MAX matches GitHub's documented cap (100)", () => {
  assert.equal(GITHUB_LABEL_DESCRIPTION_MAX, 100);
});

test("every shipped ISSUE_LABELS description fits within GitHub's 100-char cap", () => {
  for (const label of ISSUE_LABELS) {
    assert.ok(
      label.description.length <= GITHUB_LABEL_DESCRIPTION_MAX,
      `ISSUE_LABELS["${label.name}"].description is ${label.description.length} chars; GitHub caps at ${GITHUB_LABEL_DESCRIPTION_MAX}`,
    );
  }
});

test("every shipped PR_LABELS description fits within GitHub's 100-char cap", () => {
  for (const label of PR_LABELS) {
    assert.ok(
      label.description.length <= GITHUB_LABEL_DESCRIPTION_MAX,
      `PR_LABELS["${label.name}"].description is ${label.description.length} chars; GitHub caps at ${GITHUB_LABEL_DESCRIPTION_MAX}`,
    );
  }
});

test("agent-finding description is the May 2026 fixed version (regression guard)", () => {
  // Pin the exact post-fix description so a future "make it more
  // descriptive" edit can't accidentally push it back over 100 chars.
  // If you intentionally rewrite this string, just update both the
  // spec and this test together and re-verify the length invariant
  // above still holds.
  const agentFinding = ISSUE_LABELS.find((l) => l.name === "agent-finding");
  assert.ok(agentFinding, "agent-finding label spec must exist");
  assert.equal(
    agentFinding.description,
    "Issue surfaced by self-improver-issues agent or human via .github/ISSUE_TEMPLATE/agent-finding.yml.",
  );
  assert.equal(agentFinding.description.length, 99);
});

test("truncateLabelDescription is a no-op when the description is already short", () => {
  const r = truncateLabelDescription("short");
  assert.equal(r.description, "short");
  assert.equal(r.truncated, false);
});

test("truncateLabelDescription clips overflow to the 100-char cap and flags truncated", () => {
  const long = "a".repeat(150);
  const r = truncateLabelDescription(long);
  assert.equal(r.description.length, GITHUB_LABEL_DESCRIPTION_MAX);
  assert.equal(r.truncated, true);
});

test("truncateLabelDescription handles nullish defensively (cast to empty string)", () => {
  assert.deepEqual(truncateLabelDescription(undefined), { description: "", truncated: false });
  assert.deepEqual(truncateLabelDescription(null), { description: "", truncated: false });
});

test("buildLabelCreateArgs pins exact argv shape for gh label create --force", () => {
  const args = buildLabelCreateArgs({
    name: "agent-finding",
    color: "fbca04",
    description: "Some short description.",
  });
  assert.deepEqual(args, [
    "label",
    "create",
    "agent-finding",
    "--color",
    "fbca04",
    "--description",
    "Some short description.",
    "--force",
  ]);
});

test("buildLabelCreateArgs truncates a description that overflows the GitHub cap (defensive)", () => {
  // Belt-and-braces: the module-load invariant already throws on
  // overflow in the shipped specs, but a caller that hand-builds a
  // label spec at runtime (e.g. a future per-category dynamic label)
  // should still produce argv GitHub will accept.
  const long = "z".repeat(150);
  const args = buildLabelCreateArgs({ name: "x", color: "ffffff", description: long });
  const descIdx = args.indexOf("--description");
  assert.ok(descIdx !== -1, "expected --description flag in argv");
  assert.equal(args[descIdx + 1].length, GITHUB_LABEL_DESCRIPTION_MAX);
});
