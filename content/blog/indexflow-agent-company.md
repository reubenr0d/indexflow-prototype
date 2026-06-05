---
title: "The IndexFlow Agent Company"
description: "The IndexFlow operating company is auditable in git: manifest, budgets, governance, and agent heartbeats — all public at indexflow.org/ops."
date: "2026-05-26"
author: "Reuben Rodrigues"
tags: ["AI-agents", "DAO", "governance", "transparency", "agent-company"]
published: false
image: "/blog/indexflow-agent-company.png"
---

Most "AI in crypto" pitches reduce to a screenshot of a dashboard. A pretty chart, a confident agent name, a thesis you can't audit because the system prompt isn't public, the budget isn't public, the approvals aren't public, and the run-log lives in someone's CI logs that get rotated out in seven days.

We're doing the opposite.

The contracts that mint and redeem IndexFlow basket shares are permissionless: anyone can deploy a basket, anyone can deposit, anyone can read the on-chain state. That part has always been on-chain. What's new is that the **operating company that runs around those contracts is also auditable** — manifest, employees, budgets, governance constraints, per-run heartbeats, deployment ledger, partnership pipeline, content calendar. All of it in git, all of it surfaced on a single public page.

That page is [indexflow.org/ops](https://indexflow.org/ops). The data source is `git pull`.

## The Manifest

The canonical company file is [`COMPANY.md`](https://github.com/reubenr0d/indexflow-prototype/blob/main/COMPANY.md). It declares itself as `schema: agentcompanies/v1` — the schema the [`paperclip-agent-companies-plugin`](https://github.com/alvarosanchez/paperclip-agent-companies-plugin) imports — so the same file that lets a local [Paperclip](https://paperclip.ing) dashboard surface tickets and budgets also serves as the public manifest.

The shape, in plain English:

- **Board** — one founder seat today, with named approval rights (`approve_hires`, `approve_strategy`, `override_budget`, `pause_agent`, `terminate_agent`, `approve_deployments`, `approve_post_to_public_channel`). The founder is also CTO of the Minestarters product line; that overlap is visible in the manifest, not buried.
- **Active employees** — three meta-engineers that work on the codebase itself: `self-improver-issues`, `issue-implementer`, and two prompt-only risk-officers (`risk-officer-self-improvement`, `risk-officer-self-improvement-issues`). None of them touch contracts. None of them post publicly.
- **Trading agents (out of scope for Paperclip, repo-managed)** — `mining-manager`, `quality-matrix-manager`, `vault-manager`, plus a `risk-officer` second-pass reviewer. These run on an hourly CI cron via [`.github/workflows/vault-agent.yml`](https://github.com/reubenr0d/indexflow-prototype/blob/main/.github/workflows/vault-agent.yml), commit their heartbeats back to the repo, and never enter the Paperclip orbit until promoted.
- **Brainstorm slate** — four growth/ops agents that *will* exist, each with a proposed prompt file, scope, budget, and unblock list: `content-publisher`, `broadcast-bot`, `basket-ideator`, `partnership-tracker`. This is what a distributed CMO function looks like when it's broken into agent-shaped pieces.
- **Budgets** — monthly USD caps per active employee, with `proposedOnPromotion` caps for the brainstorm slate. The `cost_events` ledger inside Paperclip enforces them; 80% triggers a soft warning, 100% auto-pauses the employee.
- **Governance hard constraints** — four of them, applied on every heartbeat:
  - `never_auto_commit` — commits are user-only, full stop. Agents propose diffs; humans land them.
  - `deployment_memory_allowlist` — if a cloud or on-chain resource isn't listed in [`AGENT_DEPLOYMENT_MEMORY.md`](https://github.com/reubenr0d/indexflow-prototype/blob/main/AGENT_DEPLOYMENT_MEMORY.md), it's read-only.
  - `public_channel_human_gate` — every post to `@indexflowDAO`, the blog, or Telegram is human-approved. Per-post, not per-week.
  - `scope_boundary` — Paperclip schedules meta-engineering and growth/ops agents only. Trading agents stay repo-managed until explicitly promoted.

All four are enforced in code (the runner refuses to commit without a `--user-commit` flag; the deployment-memory file is consulted before any cloud SDK call; the twitter MCP fails closed on the wrong handle), but they're also stated up front so the public can hold us to them.

## The CMO Role, Distributed

There is no CMO seat. Marketing is split across four agents in the brainstorm slate, each with a job description and a budget:

- **`content-publisher`** — editorial / channel manager. Reads the next slot in [`growth/X_CONTENT_CALENDAR.md`](https://github.com/reubenr0d/indexflow-prototype/blob/main/growth/X_CONTENT_CALENDAR.md), polishes the pre-seeded draft from [`growth/drafts/`](https://github.com/reubenr0d/indexflow-prototype/tree/main/growth/drafts), surfaces a ticket to the founder. Never posts.
- **`broadcast-bot`** — event marketing. Watches Envio HyperIndex for `BasketCreated` events, drafts a tweet per launch using the pre-approved `basket_launch_tweet` template, posts from `@IndexFlowBots` (not `@indexflowDAO`) under a v1 human-per-post gate that converts to a v2 cap+rate envelope after 20 founder-approved posts.
- **`basket-ideator`** — product marketing / pipeline. Once a week, proposes one new basket theme into [`growth/basket-concepts/queue/`](https://github.com/reubenr0d/indexflow-prototype/tree/main/growth/basket-concepts/queue) with oracle coverage check, curator-persona tagging, and a Season-narrative slot tie-in. Suggest-only — never deploys a vault.
- **`partnership-tracker`** — BD ops. Weekly sweep across [`growth/partnerships/`](https://github.com/reubenr0d/indexflow-prototype/tree/main/growth/partnerships) for stale `next_milestone_date` rows, missing-handle blockers, and aging `awaiting_response` 0xLabs intros. Files GitHub issues; refreshes frontmatter only where the body documents a new milestone — never invents a date.

```
ideator → trading-agent (repo) → broadcast-bot → @IndexFlowBots
                              ↘ content-publisher → @indexflowDAO
partnership-tracker → blocker issues → founder triage
```

The flywheel only spins if every box is occupied. Today three of the four are declarative — their prompt files live at `agents/<id>.md` and their skill files at `agents/skills/<skill>.md`, but the heartbeats stay paused until each agent's blockers (skill files, MCPs, credentials) clear. The `/ops` page renders that openly: active agents get heartbeat cards; brainstorm agents get scope cards with their blocker list.

## The Two-Account Architecture

There are two X accounts, by design.

| Account | Voice | Who posts |
|---|---|---|
| [`@indexflowDAO`](https://x.com/indexflowDAO) | CMO voice — thesis, narrative, weekly run-log threads, ops updates | Human, every post |
| `@IndexFlowBots` (handle TBD) | Mechanical — `BasketCreated` events from on-chain | Bot, gated |

`broadcast-bot` is the only employee with `mayPostPublicChannel: true`, and the `twitter-mcp` server is configured to fail closed if it sees the `@indexflowDAO` handle on the auth path. There's no third "Paperclip" or "ops" bot — it would duplicate Track C on the main account and dilute the voice.

The template shapes both bots can use are pre-approved at the shape level (not content) in `COMPANY.md` §Governance `preApprovedTemplates`: `weekly_runlog_thread`, `basket_launch_tweet`, `post_mortem_thread`, `partner_co_tweet`. Anything else routes to the founder as a free-form ticket. Templates lower the per-post friction without removing the human gate.

## The Public Mirror

[`indexflow.org/ops`](https://indexflow.org/ops) is a Next.js route at [`apps/web/src/app/ops/page.tsx`](https://github.com/reubenr0d/indexflow-prototype/blob/main/apps/web/src/app/ops/page.tsx). It runs as a server component with ISR every 60 seconds. It does no extra work to keep itself fresh — the `commit-results` job in `.github/workflows/vault-agent.yml` already pushes updated heartbeats, state files, and run-logs back to `main` on every trading-agent cron tick. The page reads those files at revalidate time and renders:

1. **Hero + stats** — employee count, live vaults, last-heartbeat freshness, source-file link.
2. **Governance strip** — the four hard constraints, rendered as badges. Approvals required, listed as tokens.
3. **Trading agents** — one card per repo-managed agent. Status, last run, thesis, recent write actions with deep-linked tx hashes, risk-officer verdicts.
4. **Engineering meta-agents** — same card shape, applied to the self-improvement loop.
5. **Growth / CMO function** — the brainstorm slate, each with its scope and blocker list.
6. **Prompt-only reviewers** — `risk-officer-self-improvement{,-issues}`. No heartbeat, but the rubric is in the file.
7. **Budgets** — every employee, every cap, every soft-warn percentage.
8. **CMO surface** — next 7 X-calendar slots, partnerships pipeline, basket-concepts queue, posted X threads, recent blog posts.
9. **Deployment ledger** — the non-superseded cloud and planned-resource rows from `AGENT_DEPLOYMENT_MEMORY.md`.
10. **Source list** — every file the page is generated from, with a GitHub link.

No new database, no extra auth surface, no hosted control plane. The website's data source is the same git history every contributor can `clone`.

## What Stays Off

Transparency with bounds. We don't publish:

- Per-VC firm scores or personalisation notes from [`growth/VC_OUTREACH_PLAYBOOK.md`](https://github.com/reubenr0d/indexflow-prototype/blob/main/growth/VC_OUTREACH_PLAYBOOK.md).
- LP target firm names below a "we are talking to market makers" level.
- Anything under `.agent-self-improvement/` (drafts that haven't been risk-officer-approved yet).
- Raw API keys, private keys, or any `*_API_KEY=*` token in run logs. The page loader runs a regex-based redaction pass before rendering anything from `agents/memory/`.

The local [Paperclip](https://paperclip.ing) dashboard ([`docs/PAPERCLIP_RUNBOOK.md`](https://github.com/reubenr0d/indexflow-prototype/blob/main/docs/PAPERCLIP_RUNBOOK.md)) stays useful as a founder-only UI for tickets, budget enforcement, manual re-runs, and approval queues — but it's explicitly **not** the public surface. Cloud-hosting Paperclip is out of scope per the runbook's Phase 7.

## The DAO Angle

Two prior posts in this series introduced the agent layer:

- [Autonomous AI Agents Managing Vaults](/blog/autonomous-ai-agents-managing-vaults) — why agents are markdown files and what "always-on" looks like.
- [Two AI Agents Are Live on Our Testnet](/blog/two-ai-agents-live-on-testnet) — the live `mining-manager` and `quality-matrix-manager` vaults.

This post adds the company around them. When `$FLOW` launches per [`docs/UTILITY_TOKEN_TOKENOMICS.md`](https://github.com/reubenr0d/indexflow-prototype/blob/main/docs/UTILITY_TOKEN_TOKENOMICS.md), tokenholders won't be asked to trust outcomes — they'll be asked to audit *process*. The manifest is the process artefact. The heartbeats are the receipt artefact. The deployment ledger is the resource artefact. All three are git-tracked and surfaced on one page.

"Permissionless protocol on-chain. Transparent operating company in git" is the line. A future post will add the third layer: signed, onchain receipts from an agent running on a sovereign runtime (the [Theseus](https://theseuschain.com/) partnership is MoU-signed, deploy-gated; we'll write that up when the first vault ships there). At that point the story compresses to one sentence:

> Permissionless protocol on-chain. Transparent operating company in git. Verifiable agents on Theseus. Three independent layers of trust, all auditable, all public.

## How to Engage

Three calls to action, none of them buy:

- **Fork an agent** — pick any file under [`agents/`](https://github.com/reubenr0d/indexflow-prototype/tree/main/agents), copy it, change the system prompt, run it against your own vault. The whole framework is documented in [`docs/AGENTS_FRAMEWORK.md`](https://github.com/reubenr0d/indexflow-prototype/blob/main/docs/AGENTS_FRAMEWORK.md).
- **Open a basket** — go to [`/baskets`](/baskets), pick a theme, mint shares. The vault's AI Activity panel is fed by the same data the `/ops` page renders.
- **Pitch a basket theme** — open an issue tagged `vault-concept` with a proposed asset list and a curator persona. If it clears the four-question gate, `basket-ideator` will queue it once that agent is live.

The repo is at [`reubenr0d/indexflow-prototype`](https://github.com/reubenr0d/indexflow-prototype). The manifest is at [`COMPANY.md`](https://github.com/reubenr0d/indexflow-prototype/blob/main/COMPANY.md). The public ops mirror is at [`indexflow.org/ops`](https://indexflow.org/ops). Pull requests welcome.

## Further reading

- [Autonomous AI Agents Managing Vaults](/blog/autonomous-ai-agents-managing-vaults) -- the framework underneath the company: agents as markdown files, with skills, MCP tools, and run-logs.
- [Two AI Agents Are Live on Our Testnet](/blog/two-ai-agents-live-on-testnet) -- the trading agents this company runs, watched live on testnet.
- [Five Waves of On-Chain Exposure](/blog/five-waves-on-chain-exposure) -- the thesis the operating company is built to advance.
