# X (Twitter) Thread Draft

---

## Metadata

- **Topic:** Agent Company launch thread — public mirror at `indexflow.app/ops`, the eight-agent org chart, the human gates that keep posting / commits / on-chain writes human-only, and the run-log audit trail that backs every claim.
- **Pillar:** P3 Technical Credibility + P4 Operator Stories
- **Calendar week:** Week 1 (Season 1) — Mon May 25 → Sun May 31
- **Source:** [`COMPANY.md`](../COMPANY.md), [`docs/AGENTS_FRAMEWORK.md`](../docs/AGENTS_FRAMEWORK.md), `apps/web/src/app/ops/page.tsx` (the `/ops` mirror), recent `agents/memory/*/run-log.<network>.jsonl` heartbeats.
- **Hook type:** Insider Knowledge
- **Day / slot:** Sat May 30, 21:00 UTC (thread — evening US prime; pairs with the 15:00 operator-hall-of-fame thread earlier in the day as the Week-1 closing one-two punch)
- **Target CTA link:** `https://indexflow.app/ops?utm_source=x&utm_campaign=agent-company-launch`
- **Companion long-form:** blog #3 — the "Agent Company" announcement post (publishing the same day or the day after; quote-tweet swap once it ships).
- **Template shape:** `weekly_runlog_thread` (per [`COMPANY.md`](../COMPANY.md) §Governance `preApprovedTemplates`)

---

## Thread (seed — content-publisher polishes against `growth/templates/tweet-thread.md` voice + the live data on /ops)

**Tweet 1 (hook):**
We've been quietly running an AI agent company alongside IndexFlow. Eight agents, real heartbeats, every decision auditable in git. Today we're making the org chart public.

`indexflow.app/ops` — live now.

**Tweet 2 (the org chart in one frame):**
The roster:
- 2 trading agents on Sepolia + Fuji testnets (mining-manager, quality-matrix-manager)
- 3 growth/CMO agents — partnership-tracker, basket-ideator, content-publisher
- 2 meta-engineering agents (self-improver-issues, issue-implementer)
- 1 reviewer prompt that signs off on every write (risk-officer)

**Tweet 3 (the hard human gates — important):**
What the agents do NOT do, ever:
- post to `@indexflowDAO` (this account) — every X post is human-typed
- commit to main — only the founder commits
- send on-chain txs without a risk-officer pass on the proposal

The gates are encoded in [`COMPANY.md`](../COMPANY.md), not in vibes.

**Tweet 4 (run-log = receipt):**
Each agent writes a `run-log.<network>.jsonl` to git after every tick. Heartbeats, tool calls, model choices, costs — all of it pushed to a public branch on every CI cycle. `/ops` reads directly from those files.

If a card on `/ops` doesn't trace to a commit, it's not real.

**Tweet 5 (the receipt of this post):**
This thread itself was drafted by `content-publisher` and human-polished + posted by the founder. The polish-diff and the calendar status flip are in the next commit on `main`. Same loop as every other agent surface.

**Tweet 6 (close + CTA):**
The long-form drops on the blog tomorrow — the "why" behind the gates, what we've broken trying to remove them too early, and how the run-log architecture maps onto `@TheseusChain`'s onchain attestation model.

Watch the agents at:
`https://indexflow.app/ops?utm_source=x&utm_campaign=agent-company-launch`

---

## Image (recommended)

A screenshot of the `/ops` page itself with the eight agent cards in frame — meta of the meta. Visual tweets average ~150% more engagement, and the visual literally IS the thesis here.

- **Image description:** Screenshot of `https://indexflow.app/ops` showing the agent grid (mining-manager + quality-matrix-manager active with green status badges, three CMO agents with their latest heartbeat timestamps, two engineering meta-agents, one prompt-only risk-officer). Top-of-page DAO framing visible.
- **Alt text:** Screenshot of the IndexFlow `/ops` page. A grid of eight agent cards is visible — each card shows the agent name, role, last heartbeat timestamp, and the latest write action (issue proposed, vault tx, calendar flip, file diff). The header reads "Agent Company" with a brief mission statement.
- **Source file (if a diagram):** none — screenshot, not a diagram. Take fresh on the morning of May 30 so the heartbeat timestamps are recent.

---

## CTA

- **Primary CTA link:** `https://indexflow.app/ops?utm_source=x&utm_campaign=agent-company-launch`
- **CTA verb:** "watch the agents"

The link drives to `/ops` directly (NOT the marketing homepage) so the click lands on the receipt, not the pitch.

---

## Quote-tweet plan

Two quote-tweets, in this order:

1. **2–3 h after posting** — if impressions are climbing, quote-tweet the org-chart tweet with a sharper one-liner pulled from the live data:

   > Right now, partnership-tracker's last sweep flagged N stale partner milestones; basket-ideator's last tick proposed a new vault theme; content-publisher polished the slot you're reading. All three landed in git. None of them touched X.

   (Polish step: read the actual numbers off `/ops` at QT time so the cite is real.)

2. **When blog #3 goes live** (next-day, after the long-form publishes) — quote-tweet the close with the blog URL:

   > Long-form on the agent company architecture, why the human gates are non-negotiable, and what the run-log model has in common with Theseus's onchain attestations.
   > `https://indexflow.app/blog/agent-company-launch?utm_source=x&utm_campaign=agent-company-launch`

- **Quote-tweet trigger condition:** Org-chart QT fires regardless of engagement (it carries the "look at the real heartbeats" payoff). Blog QT fires only when the post moves from `growth/drafts/` to `content/blog/` and the live URL resolves.

---

## Notes (brand-voice reminders, for the content-publisher polish pass)

- **Show, don't claim.** The thread's payoff is the screenshot of `/ops` showing real heartbeats. Do not write a single sentence that the screenshot can't substantiate.
- **Hard gates are the differentiator.** Every AI-agent tweet this cycle claims autonomy; the IndexFlow thread claims *bounded* autonomy with auditable human gates. Lean into the boundary, not the autonomy.
- **No PnL claims.** Testnet-only; do not quote dollar numbers or returns. The trading agents are mentioned for org-chart completeness, not as a trading product pitch.
- **Voice check:** "smart colleague at a conference" — declarative sentences, no exclamation, no emojis, no hashtags. The first-person plural ("we've been quietly running…") is allowed because the framing is founder + the agents, not the brand account.
- **Char count budget:** each tweet ≤ 270 chars (per `growth/templates/tweet-thread.md`). Seed currently runs hot on tweets 2 and 3 — polish step MUST trim before posting.
- **Pre-publish fact-checks (must clear before posting):**
  - Confirm `indexflow.app/ops` resolves and shows ≥ 3 of the 5 non-prompt-only agent cards above the fold (mining-manager, quality-matrix-manager, plus at least one of the CMO agents with a real heartbeat).
  - Confirm the latest `commit-results` push on main is < 24h old — stale heartbeats undermine the receipt claim.
  - Take a fresh screenshot of `/ops` (not a reuse from May 26 launch). Caption it with the timestamp.
  - Confirm blog #3 is at least at the `published_draft` stage in `content/blog/` so the QT can fire same-day.
- **No mainnet talk.** The Theseus tie-in is framed as architectural alignment, NOT a deployment timeline. The follow-up batch (separate from this calendar slot) handles the actual Theseus pilot announcement when receipts land.
- **Status-flip discipline:** content-publisher polishes this draft and flips this calendar row's `status: seeded → polished`. The founder posts, captures the URL, and on the next agent tick the calendar row flips `status: polished → posted` with `posted_url` filled. Same loop as every other slot.
