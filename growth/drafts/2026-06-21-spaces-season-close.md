# X Spaces Run Sheet

---

## Metadata

- **Topic:** Season 1 Operator Trials — Closing Spaces
- **Pillar:** P4 Operator + project-update
- **Calendar week:** Week 5 (Season 1 close-out)
- **Date:** Sun Jun 21, 2026
- **Time:** 21:00 UTC (60 minutes)
- **Format:** X Spaces (audio)
- **Source:** [growth/X_GROWTH_PLAN.md](../X_GROWTH_PLAN.md), [growth/GALXE_CAMPAIGN_PLAN.md](../GALXE_CAMPAIGN_PLAN.md)
- **Hook type:** Stakes (raffle draw + Season 2 preview)

---

## Pre-Spaces setup checklist (Sat Jun 20 EOD)

- [ ] Spaces scheduled via X composer for Sun Jun 21 21:00 UTC; embed card pinned to `@indexflowDAO` profile
- [ ] Co-hosts confirmed (target: 2 Diamond-tier operators DM'd by Wed Jun 17; fallback: 1 Diamond + 1 Gold)
- [ ] Raffle draw method published in advance to a verifiable channel — use the next mainnet block hash after 21:00 UTC mod number of eligible entries per guild (single deterministic line in a pinned tweet at 20:55 UTC so nobody can claim post-hoc selection)
- [ ] Recap blog post drafted in `growth/drafts/2026-06-22-blog-season-1-recap.md` and pre-staged so the Mon Jun 22 publish is a single push
- [ ] Season 2 preview deck pre-staged at `growth/season-2/preview.md` (5 bullets max)
- [ ] Partner shout-out copy pre-cleared with Mantle / iExec / Secret Network / Nox (one line each)
- [ ] Recording confirmed enabled in Spaces settings

---

## Run sheet (60 minutes, 21:00–22:00 UTC)

### 21:00 — Open (5 min, host)

- Welcome. One-line frame: "Season 1 Operator Trials closes today. We're going to read the numbers, hand out the prizes, and tell you what comes next."
- Drop the canonical phrase verbatim: "Portfolio value and exit liquidity are not the same thing. Reserve depth is a product-quality parameter, not a treasury setting. That's the season."
- Quick housekeeping — recording is on, transcript will be published Mon Jun 22.

### 21:05 — Season 1 by the numbers (10 min, host)

Walk the recap numbers (read live from the Mon Jun 22 recap thread / blog draft):

- Baskets created (target ~30–50; report actual)
- Unique operators across all five Guilds
- Boost.xyz claims paid + Time-Based Incentive accrual
- Tier distribution (Diamond / Gold / Silver / Bronze counts)
- Partner co-tweet impressions (Mantle Thu Jun 4, iExec Fri Jun 12, Secret Sat Jun 13, Nox Sun Jun 14)
- Auto-broadcast bot post count

Honesty rule: if a number underperformed the canonical plan target, name it directly. Track A institutional listeners will reject inflation immediately.

### 21:15 — Operators of the Week recap (10 min, host + 2 co-hosts)

Walk the three Operator-of-the-Week curator spotlights from Weeks 2–4 in order. For each, 2-minute live interview with the curator if available (or read a pre-cleared quote if not). Surface one thing they'd change next time — that's the substance.

### 21:25 — Confidential-infra trinity recap (5 min, host)

Recap the Week 3 narrative arc in one minute per leg:

- iExec compute — verifiable AI agent reasoning inside a TEE; attestation hash committed alongside the tx hash in the run log
- Secret Network state — encrypted weighting, verifiable NAV (Private Curators sub-track for Season 2)
- Nox MPC signing — agent writes through a threshold signer, not a single keeper EOA

Close with: "The whole stack is verifiable. None of it is custodial. That's what Season 1 was actually about."

### 21:30 — Raffle draw (10 min, host + announcer)

Five raffles, one per Guild. For each:

1. Announce eligible entry count (everyone who hit Silver-tier or above in that Guild during Season 1).
2. Read the next mainnet block hash after 21:00 UTC and the modulo.
3. Pull the winner from the pre-published entry list (Diamond tier = 3 entries; Gold = 2; Silver = 1).
4. Winner gets the $500 USDC pool sponsored from Boost.xyz remaining budget + a Diamond hoodie.

Five winners total — one per Guild. Names + handles read on-air; payouts processed Mon Jun 22.

### 21:40 — Season 2 preview (10 min, host)

Five bullets max:

1. Two new Guilds joining the season (TBD — likely Private Curators if Secret Network PoC ships, and one cross-chain-routing-specialist Guild if Mantle spoke deploy lands)
2. Refreshed leaderboard quality multipliers (use Season 1 data to recalibrate)
3. Expanded Boost.xyz action set (more onchain actions, more TBI surfaces)
4. Mainnet whitelist priority tier becomes binding (open question for legal — flagged as not-yet-confirmed in the live audio)
5. Date target — first Monday in August 2026

### 21:50 — Q&A (8 min, host + co-hosts)

Open the floor. Cap at 8 minutes hard. Steer questions toward Season 2 design rather than Season 1 grievances ("what would you change if you ran this again?" is a better question than "why didn't I get a Diamond?" — answer the latter with the published quality-multiplier formula, then redirect).

### 21:58 — Close (2 min, host)

- Thank the four partners by handle (Mantle / iExec / Secret Network / Nox).
- Thank every operator who participated.
- "Mainnet readiness is the next stop. Whitelist priority is real. We'll see you in Season 2."
- End recording.

---

## Post-Spaces checklist (Sun Jun 21 22:00 UTC – Mon Jun 22)

- [ ] Confirm recording uploaded (X processes async; check at 22:30 UTC and 23:30 UTC)
- [ ] Pin recording to `@indexflowDAO` profile
- [ ] Post Mon Jun 22 quote-tweet of the recording with the recap blog post link
- [ ] Trigger Boost.xyz raffle USDC payouts (5 × $500) and Diamond hoodie orders
- [ ] Publish `growth/drafts/2026-06-22-blog-season-1-recap.md` → `/blog/season-1-recap`
- [ ] Update `growth/X_CONTENT_CALENDAR.md` Sun Jun 21 row to `posted` with the Spaces recording URL
- [ ] Move all 27 Season 1 drafts under `growth/drafts/` to `DONE-` prefix
- [ ] Open `growth/season-2/` folder with the season-2 preview, OAT roster, and partner targets

---

## Notes

- Spaces tweet itself (Sat Jun 20 announcement) is in `2026-06-20-tweet-spaces-season-close.md`. This file is the run sheet, not a post draft.
- Brand voice: "smart colleague at a conference" applies to live audio too. No "okay so..." or "alright everyone..." openers. Open with the canonical phrase, close with the next-stop line.
- If a co-host drops out: the host carries every segment solo except the Operator-of-the-Week interviews; if all three curators are unavailable, read their pre-cleared one-line quotes instead and keep the segment to 6 minutes total.
- Tech failsafe: have a backup host on a desktop with stable bandwidth in case the mobile X app crashes mid-Spaces (it has happened). Co-host can take over if the host drops.
- Raffle method must be published BEFORE 21:00 UTC to be verifiable. The pinned tweet at 20:55 UTC is non-negotiable.
