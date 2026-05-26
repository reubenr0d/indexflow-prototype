# Growth Content Skill

Voice, structure, and approval guardrails for every IndexFlow public-channel output. Consumed by `content-publisher`, `broadcast-bot`, and `basket-ideator`.

## Authoritative inputs

- [`growth/README.md`](../../growth/README.md) — 4-layer funnel, content pillars (P1–P6), ICP definition.
- [`growth/X_GROWTH_PLAN.md`](../../growth/X_GROWTH_PLAN.md) — Season 1 narrative, voice guide, the single optimised metric.
- [`growth/templates/`](../../growth/templates/) — per-format template files (`tweet-thread.md`, `tweet-standalone.md`, blog, Substack, LinkedIn, podcast pitch).
- [`growth/X_CONTENT_CALENDAR.md`](../../growth/X_CONTENT_CALENDAR.md) — date-slotted Season 1 schedule, hook types, status workflow.
- [`COMPANY.md`](../../COMPANY.md) §Governance — `mayPostPublicChannel`, `writeApprovalKind`, pre-approved template shapes.

## Voice (mechanical rules, not vibes)

The full voice guide is in `growth/X_GROWTH_PLAN.md`. The mechanical rules every agent must enforce:

1. **No emojis except in `basket_launch_tweet`** (and even there: at most one, only a check ✅ or graph 📊 if the launch is large).
2. **No hashtags** ever. Hashtags signal "I'm advertising"; we're shipping.
3. **No prices, no APYs, no return claims**. We talk about *architecture* (NAV vs redeemability), *operations* (heartbeats, deployments, governance), and *receipts* (txHashes, posted_urls). Returns are out of scope until/unless mainnet + audit + product positioning is finalised.
4. **Every external CTA carries `utm_source=x&utm_campaign=season-1`** so Envio attribution survives. Drop the parameter and the post fails review.
5. **Hooks must match one of the six hook types** in `growth/templates/tweet-thread.md`: Data, Contrarian, Insider Knowledge, Curiosity Gap, Stakes, Personal Story. The X calendar's `hook_type` column is the contract.
6. **Threads are 4–9 posts**. Standalones are one post. Anything else needs founder approval — propose as a free-form ticket, not a calendar slot.

## Pre-approved template shapes

Only these shapes may land in the calendar without per-shape founder approval (shape, not content):

| shape | who can use | target account | gating |
|---|---|---|---|
| `weekly_runlog_thread` | content-publisher | @indexflowDAO | human-per-post |
| `basket_launch_tweet` | broadcast-bot | @IndexFlowBots | human-per-post (v1); cap+rate (v2) |
| `post_mortem_thread` | content-publisher | @indexflowDAO | human-per-post |
| `partner_co_tweet` | content-publisher | @indexflowDAO | human-per-post + partner confirmation |

Anything outside these four shapes goes to the founder as a free-form ticket. Do NOT slot it into the calendar.

## What this skill is NOT

- It is **not** a copywriter. The drafts in `growth/drafts/` are pre-seeded by the founder; the agent polishes, doesn't write from scratch.
- It is **not** a posting tool. No file in `agents/` ever authenticates as `@indexflowDAO`. Public posts are human-gated per `COMPANY.md` §Governance `public_channel_human_gate`.
- It is **not** a marketing budget. Spend caps belong to `COMPANY.md` §Budgets, not to this skill.

## Approval-gate cheatsheet

When you propose any output that touches a public channel, declare:

- `template_shape`: one of the four above (or `freeform_ticket`).
- `target_account`: `@indexflowDAO` or `@IndexFlowBots`.
- `requires_partner_confirmation`: true if any partner handle is mentioned.
- `utm_present`: must be `true` for any external link.

If any check fails, surface a `propose_ticket` to the founder instead of trying to "fix it" autonomously.
