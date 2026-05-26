# Partnerships Skill

Rules-of-the-road for `partnership-tracker` (and any future BD agent that lands in the slate). Encodes the frontmatter schema, blocker taxonomy, dedupe heuristics, and the "what counts as a documented milestone" judgement so the agent doesn't fabricate dates.

## Authoritative inputs

- [`growth/partnerships/README.md`](../../growth/partnerships/README.md) — partner index, status legend, 0xLabs intros pipeline.
- [`growth/partnerships/_TEMPLATE.md`](../../growth/partnerships/_TEMPLATE.md) — non-chain partner template.
- [`growth/partnerships/chains/_TEMPLATE.md`](../../growth/partnerships/chains/_TEMPLATE.md) — chain partner template.
- Per-partner files: `growth/partnerships/<partner>.md` and `growth/partnerships/chains/<chain>.md`.

## Frontmatter schema (the only fields you may touch)

You may propose edits to these fields, and only these:

- `status` — one of `signed_mou | active | in_discussion | pending | dormant | declined`.
- `co_marketing` — `agreed | pending_deploy | not_confirmed | active`.
- `funding_intros` — `intros_made | offered | none`.
- `next_milestone_date` — ISO date (YYYY-MM-DD) or `TBD`.

You may NEVER edit `partner`, `type`, `handle`, the body `## Notes`, `## History`, or `## MoU` sections. Those are founder-owned.

## Blocker taxonomy (P0 → P2)

- **P0 — handle-TBD scheduled**: any partner with `handle: <name>_TBD` or `(pending)` AND a `co_marketing: agreed` row tied to a calendar slot in the next 14 days. Surface as an issue immediately; the calendar slot will miss without it.
- **P1 — stale milestone**: `next_milestone_date < today` AND `status` is not `active | declined | dormant`. Cross-check the body: if a new milestone is documented, propose a frontmatter refresh. If not, file a blocker.
- **P2 — pending_deploy with no date**: `co_marketing: pending_deploy` AND `next_milestone_date: TBD`. File a blocker that asks for either a target date or a status downgrade.
- **P2 — aging 0xLabs intro**: `awaiting_response` AND first-seen-date > 30 days ago AND no follow-up note. File a single roll-up issue per sweep (not one per row) listing the oldest 10 partners.

Lower-priority signals (don't file an issue; surface in the run summary):

- `co_marketing: agreed` with no calendar slot in the next 60 days → "soft" reminder in the summary.
- New partner file landed with frontmatter incomplete → noted, not issue-filed.

## "What counts as a documented milestone"

You may bump `next_milestone_date` ONLY if the partner body documents a specific new milestone. Examples:

- Body contains `Next: deploy spoke to <chain> testnet (target: 2026-06-15)` → bump to `2026-06-15`. OK.
- Body contains `Following up after IndexFlow's mainnet audit` and there is a documented mainnet-audit target → use that date. OK.
- Body contains vague language like `expect movement next month` → **do not bump**. File a blocker.
- The founder's verbal commitment in a sibling Slack channel → **invisible to you**. File a blocker.

When in doubt: surface, don't fabricate.

## Dedupe rules

Before filing any issue, `list_open_issues({ label: "partnership-blocker", limit: 30 })`. Skip if either:

- Open issue title contains the same `<partner>` token AND same blocker class (P0/P1/P2).
- Open issue body links to the same partner file URL AND was filed in the last 14 days.

The label namespace is `partnership-blocker` (distinct from `agent-finding`); keep them separate so the founder can triage in different sweeps.

## Approval routing

Every issue you file flows through `risk-officer-self-improvement-issues` (per `COMPANY.md` §Brainstorm `partnership-tracker.governance.writeApprovalAgent`). The reviewer will downsize issues with `convictionWeight < 0.5` and veto anything that names a fabricated date.

## Sweep cadence

Weekly, Mon 09:00 UTC (per `COMPANY.md` §Routines + the proposed `heartbeat: "0 9 * * 1"`). The founder typically reviews issues Tue morning; a Mon sweep gives a 24-hour buffer before the next X-calendar slot lands.
