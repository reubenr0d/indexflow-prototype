# X (Twitter) Thread Draft

---

## Metadata

- **Topic:** Season 1 by the numbers — 4 weeks of paying for actual onchain actions, what shipped, what we learned, what's next
- **Pillar:** P4 Operator Stories + project-update bucket
- **Calendar week:** Week 4 (Season 1) — Thu Jun 18, season-recap thread
- **Source:** `/operators` leaderboard worker snapshot, Boost.xyz claim/accrual state, Envio HyperIndex queries, `growth/X_GROWTH_PLAN.md` Option C section, `growth/partnerships/` (Mantle, iExec, Secret Network, Nox)
- **Hook type:** Data

---

## Thread (9 tweets)

### Tweet 1 -- Hook

We didn't run an airdrop.

We paid for actual onchain actions for 4 weeks — basket creation, asset registration, reserve setting, perp allocation, hold-to-earn — and watched what happened.

Season 1 by the numbers, 18 days in:

### Tweet 2

`<N>` baskets created on testnet by `<M>` unique operators across Curators, Allocators, Engineers, Educators, and Cross-Chain Couriers.

The leaderboard is one click; tier and Guild are surfaced inline so the read is the whole season, not a snapshot.

[IMAGE: screenshot of /operators — tier distribution + leaderboard top 25, with the Diamond / Gold / Silver / Bronze split and the Guild filter visible. Capture Thu Jun 18 ~14:00 UTC to keep the numbers in the screenshot consistent with Tweet 3.]

### Tweet 3

Tier distribution at the moment of writing:

- Diamond: `<D>` operators (top 3%)
- Gold: `<G>` (top 10%)
- Silver: `<S>` (top 25%)
- Bronze: `<B>` (top 50%)

Re-evaluated daily by the leaderboard worker. Tier = mainnet whitelist priority, displayed non-bindingly.

### Tweet 4

`<X>` Boost.xyz claims paid out so far — USDC for One-Time Actions on `BasketCreated`, `AssetRegistered`, `AllocateToPerp`, and `RedemptionFilled`, plus pro-rata Time-Based Incentive accrual on `BasketShareToken` holds and basket TVL retention.

Per-action attribution. No farming-to-zero post-claim.

### Tweet 5

Top movers this week:

- `<@curator-mover-1>` — `<one-line achievement>`
- `<@curator-mover-2>` — `<one-line achievement>`
- `<@engineer-mover-1>` — `<one-line achievement>`

Three of the climbs above were inside the last 48 hours. The leaderboard is still moving.

### Tweet 6

Partner co-tweet impressions across the season:

- Mantle (Cross-Chain Courier spoke demo): `<imp-mantle>`
- iExec (confidential agent compute): `<imp-iexec>`
- Secret Network (private Curator state): `<imp-secret>`
- Nox (MPC signing): `<imp-nox>`

Confidential trinity in Week 3 was the highest-impression arc by ~`<X>`×.

### Tweet 7

What we learned, in three lines.

What worked: paying per onchain action attracted operators who maintain baskets, not farm them.
What surprised us: the bring-your-own-license thread on Mon traveled into TradFi Slacks before it traveled inside crypto.
What didn't: Educator quizzes plateaued earlier than expected. We'll cut quiz count and raise unit point value in Season 2.

### Tweet 8

Season 2 in 6-8 weeks. New OATs, refreshed leaderboard, scoped expansions to the Boost.xyz action set — most of the operator feedback in the spotlights' "what would you change next?" answers is already on the Season 2 backlog.

Boost claim window for Season 1 stays open per Boost's per-Action config (default 7 days).

### Tweet 9 -- CTA

The live leaderboard, current Boost claim states, and the Season 1 recap blog post — including the methodology behind every number above and the Season 2 design changes — are linked below.

[link to /operators?utm_source=x&utm_campaign=season-1-recap and /blog/season-1-recap?utm_source=x&utm_campaign=season-1-recap]

---

## Standalone Tweets (extract 3-5 from thread)

1. We didn't run an airdrop. We paid for actual onchain actions for 4 weeks — basket creation, asset registration, reserve setting, perp allocation, hold-to-earn — and watched what happened.

2. `<N>` baskets, `<M>` unique operators, `<X>` Boost.xyz claims paid. Per-action attribution, no farming-to-zero post-claim. The leaderboard is the whole season, not a snapshot.

3. Tier mapping at season close: Diamond `<D>`, Gold `<G>`, Silver `<S>`, Bronze `<B>`. Tier translates to mainnet whitelist priority, displayed non-bindingly on `/operators`. Re-evaluated daily.

4. What worked in Season 1: paying per onchain action attracted operators who *maintain* baskets, not farm them. What surprised us: the regulatory thread traveled into TradFi Slacks before it traveled inside crypto. What didn't: Educator quizzes plateaued earlier than expected.

5. Most of the Season 2 backlog is already written — it's the "what would you change next?" answers from every Operator-of-the-Week spotlight. Read them before you tell us what to ship next.

---

## Notes

- This is the **Season 1 recap thread**. It runs Thu Jun 18 at 14:00 UTC, exactly 72 hours before the season closes on Sunday's Spaces. The recap *intentionally precedes* the Friday 72-hour push so the audience has fresh numbers when the urgency tweet lands.
- **Placeholder discipline:** every `<...>` placeholder is a number or handle that gets pulled from the leaderboard worker snapshot, the Boost.xyz dashboard, or partner DM threads on Thu morning. Do not post with placeholders unfilled. The first pass below uses placeholders so the structure is reviewable now; final voice pass on Thu morning fills them.
- **Numbers source of truth:** the leaderboard worker snapshot (Cloud Run, mirrors `apps/push-worker`) is canonical for `<N>`, `<M>`, `<D>`, `<G>`, `<S>`, `<B>`. Boost dashboard exports give `<X>`. Partner co-tweet impressions come from X analytics on the original Mantle / iExec / Secret Network / Nox co-tweets (Thu Jun 4, Fri Jun 12, Sat Jun 13, Sun Jun 14 per `growth/X_GROWTH_PLAN.md`). If any number isn't ready by Thu 12:00 UTC, push the thread to Fri 09:00 UTC and move the 72-hour standalone to Fri 14:00 UTC — Friday's slot can absorb the shift.
- **If the campaign underperforms** vs the targets in the canonical plan (~30-50 baskets, broad Guild coverage), do *not* dress up the numbers. Lead Tweet 7 with the honest "what didn't work" line and shift the Season 2 framing to "what we'd cut" — the credibility of the recap depends on it. Track A institutional readers will recognize and reject inflation immediately.
- [IMAGE: tweet 2 — screenshot of `/operators` page showing tier distribution + leaderboard. Capture the page at 14:00 UTC on the post day so the screenshot matches the recap timestamps. Visual tweets get ~150% more engagement.]
- Tweet 3 tier thresholds match the canonical mapping in `growth/X_GROWTH_PLAN.md` ("Option C — Final Design" section).
- Tweet 6 partner attribution — pull the actual impression counts the day-of from X analytics; if any partner co-tweet got fewer than ~5,000 impressions, group them into a single "partner arc co-tweet" line rather than calling out underperforming ones individually. Diplomatically protects the partnerships.
- Tweet 8 "Season 2 in 6-8 weeks" follows the cadence rhythm from `growth/X_GROWTH_PLAN.md`. If the leadership team decides on a different gap, swap the window without changing the rest of the thread.
- Tweet 9 CTA — `/blog/season-1-recap` is a placeholder URL. If the recap blog post is not yet published by Thu morning, drop the `/blog/season-1-recap` link from Tweet 9 and lean on `/operators` only. The recap blog post is the natural Monday Jun 22 follow-up.
- Posting window: 14:00 UTC Thu Jun 18 (US lunch + EU close). Quote-tweet Tweet 1 at ~17:00 UTC with the one-line summary "Season 1 was not an airdrop. It was paying for actions and watching what happened" for the second reach pulse.
- Brand voice: no emojis, zero hashtags, no "thread on…", no "okay…". This thread is data-forward and intentionally non-celebratory. Sit at the same register as a quarterly investor update, not a hype recap.
