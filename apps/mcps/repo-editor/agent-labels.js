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
    description:
      "Issue surfaced by the self-improver-issues agent or a human via .github/ISSUE_TEMPLATE/agent-finding.yml.",
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

// Pure: build the argv array the openers hand to `gh label create`.
// `--force` makes the call idempotent (updates colour/description if
// the label already exists, no-ops on identical specs).
export function buildLabelCreateArgs(label) {
  return [
    "label",
    "create",
    label.name,
    "--color",
    label.color,
    "--description",
    label.description,
    "--force",
  ];
}
