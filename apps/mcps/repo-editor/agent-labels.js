// Shared label specs for the self-improver issue/PR openers.
//
// `gh issue create --label X` and `gh pr create --label X` both require
// label `X` to already exist in the repo — GitHub does not auto-create
// labels from `.github/ISSUE_TEMPLATE/*.yml`. To avoid the
// "could not add label: 'agent-finding' not found" failure mode on
// fresh repos, the openers call `gh label create --force` for every
// entry in the relevant spec before they try to file anything. `--force`
// is idempotent (updates the label if it exists), so this is safe to
// re-run every tick.
//
// Keep this module pure (no shell-outs, no IO) so both the openers and
// the unit tests can import it directly.

// GitHub caps label `description` at 100 characters; the API returns
// `HTTP 422: description is too long (maximum is 100 characters)` on
// overflow, and a failed `gh label create` then cascades into
// `could not add label: '<name>' not found` on the very next
// `gh issue create` / `gh pr create`. The invariant block at the
// bottom of this module enforces the cap at module-load time so a
// future regression trips a unit test, not CI.
export const GITHUB_LABEL_DESCRIPTION_MAX = 100;

// Issue-channel labels. Mirror `.github/ISSUE_TEMPLATE/agent-finding.yml`
// (`labels: ["agent-finding", "needs-human-review"]`) plus a
// `category:<x>` label for every `CATEGORY_ENUM` value in
// `apps/mcps/repo-editor/issue-manifest.js`. If a new category is added
// there, add the matching label here too — the drift guard in
// `scripts/apply-self-improvement-issues.test.mjs` will catch a missing
// entry.
export const ISSUE_LABELS = [
  {
    name: "agent-finding",
    color: "fbca04",
    // Keep <= 100 chars (GitHub label-description cap). Previously 105.
    description:
      "Issue surfaced by self-improver-issues agent or human via .github/ISSUE_TEMPLATE/agent-finding.yml.",
  },
  {
    name: "needs-human-review",
    color: "d93f0b",
    description: "Awaiting human triage before any code change lands.",
  },
  {
    name: "category:new_mcp_or_skill",
    color: "1d76db",
    description: "Agent-finding category: propose a new MCP tool or skill.",
  },
  {
    name: "category:strategy_idea",
    color: "0e8a16",
    description: "Agent-finding category: propose a new trading / sizing strategy.",
  },
  {
    name: "category:data_gap",
    color: "fbca04",
    description: "Agent-finding category: missing data source or detector.",
  },
  {
    name: "category:refactor",
    color: "6f42c1",
    description: "Agent-finding category: refactor opportunity.",
  },
  {
    name: "category:investigation",
    color: "5319e7",
    description: "Agent-finding category: needs investigation.",
  },
  {
    name: "category:partnership-blocker",
    color: "e99695",
    description: "Agent-finding category: partnership / BD-ops blocker.",
  },
  {
    name: "category:vault-concept",
    color: "c2e0c6",
    description: "Agent-finding category: new-vault theme proposal from basket-ideator.",
  },
];

// PR-channel labels. Mirror the constants in
// `scripts/apply-self-improvement-proposals.mjs` (`PR_LABEL_AGENT`,
// `PR_LABEL_REVIEW`). `needs-human-review` is shared with the issue
// channel so triage queries can fan out across both surfaces.
export const PR_LABELS = [
  {
    name: "agent-self-improvement",
    color: "1d76db",
    description:
      "PR opened by the self-improver meta-agent via scripts/apply-self-improvement-proposals.mjs.",
  },
  {
    name: "needs-human-review",
    color: "d93f0b",
    description: "Awaiting human triage before any code change lands.",
  },
];

// Pure: defensively truncate a label description to GitHub's cap
// (currently 100 chars). The static invariant at the bottom of this
// module catches drift in the shipped specs at module-load time, but
// this is the belt-and-braces guard for any caller that hand-rolls a
// label spec at runtime (e.g. a future per-category dynamic label).
// Returns `{ description, truncated }` so callers can warn on
// truncation rather than silently lose context.
export function truncateLabelDescription(description) {
  const raw = String(description ?? "");
  if (raw.length <= GITHUB_LABEL_DESCRIPTION_MAX) {
    return { description: raw, truncated: false };
  }
  return {
    description: raw.slice(0, GITHUB_LABEL_DESCRIPTION_MAX),
    truncated: true,
  };
}

// Pure: build the argv array the openers hand to `gh label create`.
// `--force` makes the call idempotent (updates colour/description if
// the label already exists, no-ops on identical specs). Descriptions
// are truncated to GitHub's 100-char cap and a `console.warn` is
// emitted on truncation so the operator sees drift before it shows
// up as an HTTP 422 in CI.
export function buildLabelCreateArgs(label) {
  const { description, truncated } = truncateLabelDescription(label.description);
  if (truncated) {
    console.warn(
      `[agent-labels] description for "${label.name}" exceeded ${GITHUB_LABEL_DESCRIPTION_MAX} chars; truncated to fit GitHub's cap`,
    );
  }
  return [
    "label",
    "create",
    label.name,
    "--color",
    label.color,
    "--description",
    description,
    "--force",
  ];
}

// Module-load invariant: every shipped label spec must respect
// GitHub's 100-char description cap. If a future edit reintroduces
// the bug that prompted this hardening (the 105-char `agent-finding`
// description on May 23, 2026), this throws on import so the
// `agent-labels.test.mjs` smoke test catches it before CI shells
// out to `gh label create`.
const ALL_LABELS = [...ISSUE_LABELS, ...PR_LABELS];
for (const label of ALL_LABELS) {
  if (typeof label.description !== "string") continue;
  if (label.description.length > GITHUB_LABEL_DESCRIPTION_MAX) {
    throw new Error(
      `[agent-labels] label "${label.name}" description is ${label.description.length} chars; GitHub caps at ${GITHUB_LABEL_DESCRIPTION_MAX}. Shorten it before shipping.`,
    );
  }
}
