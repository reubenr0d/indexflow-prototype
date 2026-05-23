# X (Twitter) Thread Draft

---

## Metadata

- **Topic:** Operator of the Week spotlight #2 — a curator whose vault is managed by an agent, with the run-log committed to git
- **Pillar:** P4 Operator Stories
- **Calendar week:** Week 3 (Season 1, confidential-infra trinity)
- **Source:** TBD — curator selected from the `/operators` Hall of Fame leaderboard on Mon Jun 8 evening (see Notes for pre-post fill-in)
- **Hook type:** Personal Story

---

## Thread (6 tweets)

> **Template stub.** Bracketed placeholders (`[CURATOR_HANDLE]`, `[VAULT_NAME]`, `[BASKET_ADDRESS_SHORT]`, `[AGENT_NAME]`, etc.) are filled in pre-post from the leaderboard worker output and a 10-min DM with the curator. See the Notes section for the exact checklist.

### Tweet 1 -- Hook

[CURATOR_HANDLE] doesn't open positions in her vault herself.

An agent does. The run-log is committed to git after every cron tick — public, structured, auditable from `git log`.

Operator of the Week #2: [VAULT_NAME].

### Tweet 2

[CURATOR_HANDLE]'s basket is [VAULT_NAME] (`[BASKET_ADDRESS_SHORT]`) — [ONE_LINE_BASKET_DESCRIPTION, e.g. "a mining-equity long/short book scored by an 8-category quality matrix"].

She forked [AGENT_NAME] from `agents/` on Mon, edited the system prompt, pointed it at a fresh testnet vault. Live by Wed.

### Tweet 3

Why this basket: [WHY_BASKET — one paragraph in the curator's own words from the DM, e.g. "I wanted exposure to the next wave of copper juniors without picking individual names. The matrix does the ranking; I set the risk bands."]

The agent ran [N] times last week. [M] positions opened, [K] closed.

### Tweet 4

Fee + reserve policy:

- Deposit fee: [X] bps
- Redeem fee: [Y] bps
- Reserve floor: [Z]% (above the [W]% protocol minimum)

Why: [CURATOR_RATIONALE — one sentence, e.g. "I wanted the reserve to absorb a 10% drawdown without forcing a perp unwind. Z% gets me there."]

### Tweet 5

What she'd change next: [ONE_LINE_NEXT_ITERATION — e.g. "I want to tighten the take-profit band from +8% to +6% — the matrix is calling the entries early and I'm leaving exits on the table."]

The agent file is in the repo. Edit the markdown, redeploy. Same vault, new policy.

### Tweet 6 -- CTA

Want to clone the setup?

Fork [AGENT_NAME].md, edit the frontmatter, point it at a new testnet basket. The runner handles deployment, memory, and the run-log commit. Diamond tier is currently [DIAMOND_CUT_NUMBER] — [CURATOR_HANDLE] is at [HER_RANK].

[link with utm_source=x&utm_campaign=ootw-w3-curator-2]

---

## Standalone Tweets (extract 3-5 from thread)

> Fill in once Tweets 1–6 are completed. Suggested extraction recipes once the data is in:
>
> 1. The hook (Tweet 1) is already standalone-safe — quote-tweet it Wed evening with a one-line addition like "Two operators in, two completely different vault philosophies. Spotlight thread →".
> 2. The fee + reserve breakdown (Tweet 4) plus one sentence of curator rationale travels as a single standalone — pulls in the operator-economics crowd.
> 3. "What she'd change next" (Tweet 5) plus "Edit the markdown, redeploy" is the strongest tinkerer-bait beat.

---

## Notes

- **Pre-post fill-in (required, ~30 min total, split across Mon evening + Tue morning):**
  1. **Mon Jun 8 evening — pick the curator.** Pull the `/operators` leaderboard from the staging URL. Filter to operators (a) with at least one basket whose `useAgentMetadata` payload returns `isAiManaged: true` (the AI Operator badge), (b) currently in Silver tier or above, and (c) who haven't been spotlighted before. Pick the one with the most interesting strategy *and* an active enough run-log that Tweet 3's "[N] runs / [M] opens / [K] closes" numbers tell a story. (If no qualifying agent-managed operator exists by Mon evening, fall back to the strongest non-agent operator and rewrite the hook to lead with their basket choice instead of the agent angle — leave a comment in the diff so the trinity-week framing isn't lost.)
  2. **Mon Jun 8 evening — DM the curator.** Confirm she's happy to be spotlighted with handle visible. Ask four short questions:
     - One paragraph: why this basket?
     - One sentence: how did you pick the fee + reserve policy?
     - One sentence: what's the one thing you'd change in the agent file next?
     - Confirm the handle / vault name spelling.
  3. **Tue Jun 9 morning — fill the bracketed fields.** Replace every `[…]` placeholder. Run wc -m on each tweet draft and keep each tweet ≤280 chars. The `[BASKET_ADDRESS_SHORT]` convention is the first-4-and-last-4 hex pattern (`0x1234…abcd`).
  4. **Tue Jun 9 morning — pull the run-log numbers** for Tweet 3 from `agents/memory/<agent>/run-log.sepolia.jsonl`. Count entries from the last 7 days; sum `recentActions[]` matching `tool: "open_position"` and `tool: "close_position"`. Skip dry-run entries.
  5. **Tue Jun 9 morning — confirm tier cut numbers** for Tweet 6's "Diamond tier is currently [DIAMOND_CUT_NUMBER]" from the leaderboard worker output. The cut number is the score at the 3rd-percentile cohort cut (see the tier mapping in `growth/X_GROWTH_PLAN.md` § Recognition Layer).
- **Posting cadence:** Wed Jun 10 at 15:00 UTC, same slot as the Week 2 spotlight. Quote-tweet the hook with the auto-broadcast bot's tweet for [CURATOR_HANDLE]'s most recent basket creation a couple of hours later for the second-wave bump.
- **Voice gut-check:** zero hashtags, zero emoji, no "thread on…", no "let me tell you about…". Same voice as the Week 2 spotlight thread (`2026-06-03-thread-operator-of-the-week-curator-1.md`).
- **Trinity week framing:** if the chosen curator is using an agent (the preferred case), the hook is *exactly* the Week 3 message — agents are real, they're managing real vaults, their reasoning is auditable from `git log`. That naturally sets up the reader for the iExec / Secret / Nox posts on Fri / Sat / Sun without needing an explicit foreshadow. Optional: add a one-line P.S. quote-tweet on Thu morning ("This week's trinity — iExec, Secret, Nox — is the answer to 'but is the agent really verifiable?'") to chain the spotlight into the trinity arc.
- **DM follow-up after posting:** send [CURATOR_HANDLE] the live thread link and an unlock for the milestone-merch shipment (first-agent-managed-basket sticker pack). Triggers the Operator Hall of Fame loop.
