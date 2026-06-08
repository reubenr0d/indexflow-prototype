# IndexFlow Galxe Campaign — Season 1: Curators Guild

Season 1 soft-launch focuses on a single surface: **Curators Guild** — rewarding operators who ship and maintain profitable baskets on testnet.

Budget: **$200/month** ($50/week, top 5 curators by NAV growth).

Companion docs:

- [`growth/X_GROWTH_PLAN.md`](./X_GROWTH_PLAN.md) — X channel framework that drives wallets to the app.
- [`growth/X_CONTENT_CALENDAR.md`](./X_CONTENT_CALENDAR.md) — date-slotted Season 1 schedule.

---

## Why Curators Only (Soft Launch)

1. **Focus.** One well-executed quest beats five half-baked ones. Curators are the core persona — build track records first.
2. **NAV-ranked rewards.** Testnet uses real oracle prices. Farming testnet tokens doesn't help; skill does.
3. **Low spend floor.** $50/week is small enough to self-fund. No Boost.xyz dependency for soft launch.
4. **Rapid iteration.** One credential type, one snapshot worker, one payout rail. Ship fast, learn, expand.

Other guilds (Educators, Allocators, Engineers, Cross-Chain Couriers) are deferred to Season 2 or a later soft-launch wave.

---

## Curators Guild Tasks

All tasks use **REST credentials** backed by our `apps/web/src/app/api/galxe/credential/route.ts` endpoint, which queries Envio HyperIndex.

### Entry Quest: Curator Genesis (one-time)

| # | Task | Credential | Description |
| - | ---- | ---------- | ----------- |
| 1 | Complete Curator Genesis | `curator-genesis` | Address created a basket with ≥3 active assets, `minReserveBps > 0`, basket age ≥7 days, and wallet has Envio activity (deposit, redeem, or operator action). |

Reward: **IndexFlow Operator Trials: Genesis Curator** OAT + eligibility for the weekly NAV leaderboard.

### Weekly Quest: Best Performer (recurring)

| # | Task | Credential | Description |
| - | ---- | ---------- | ----------- |
| 2 | Place Top 5 this week | `curator-weekly-winner-{weekKey}` | Address ranks in the top 5 curators by **7-day NAV change %** on their best-performing basket. Snapshot: Sunday 23:59 UTC. |

**Qualification gates** (all required):

- Basket age ≥7 days
- ≥3 active assets
- ≥1 operator action this ISO week (`allocateToPerp`, `withdrawFromPerp`, `assetsUpdated`, `reservePolicyUpdated`, `reserveTopUp`, `positionOpened`, `positionClosed`)
- Genesis Curator credential passed (same address)

**Payout via Galxe USDC claim** (from the $50 weekly pool):

| Rank | USDC |
| ---- | ---- |
| 1st | $20 |
| 2nd | $12 |
| 3rd | $8 |
| 4th | $6 |
| 5th | $4 |

If fewer than 5 curators qualify, pay only the ranks that qualify. Tie-breaker: older basket wins.

### Streak Quests (badge-only at soft launch)

| # | Task | Credential | Description |
| - | ---- | ---------- | ----------- |
| 3 | Achieve 2-week Top 5 streak | `curator-streak-2` | Top 5 in two consecutive ISO weeks. Hard reset on any gap week. |
| 4 | Achieve 3-week Top 5 streak | `curator-streak-3` | Top 5 in three or more consecutive ISO weeks. |

Streak multipliers (1.2× / 1.5×) are documented for Season 2; Season 1 soft launch mints streak **badges only** — the weekly pool stays fixed at $50.

### Track-Record Badge Quests (non-monetary OATs)

| # | Task | Credential | Description |
| - | ---- | ---------- | ----------- |
| 5 | Win Weekly Champion | `curator-badge-champion` | Placed 1st in any weekly snapshot. |
| 6 | Earn Consistent Curator | `curator-badge-consistent` | Top 5 in ≥3 distinct ISO weeks (cumulative, not necessarily consecutive). |
| 7 | Maintain basket 30+ days | `curator-badge-veteran` | Creator of a basket with ≥3 assets alive ≥30 days. |

---

## Galxe-native OAT Design (4 OATs)

Four Galxe-native OATs mint to Gravity. Each is non-transferable; metadata pinned to IPFS; artwork uses the IndexFlow brand header style.

| # | Name | Trigger | Tag Colour |
| - | ---- | ------- | ---------- |
| 1 | **IndexFlow Operator Trials: Genesis Curator** | Pass Curator Genesis | Emerald |
| 2 | **IndexFlow Operator Trials: Weekly Champion** | Place 1st any week | Gold |
| 3 | **IndexFlow Operator Trials: Consistent Curator** | Top 5 in ≥3 weeks | Silver |
| 4 | **IndexFlow Operator Trials: Veteran Curator** | Basket alive ≥30 days | Bronze |

Naming convention: every OAT starts with **"IndexFlow Operator Trials: …"** so they read as a single Season 1 family in any wallet/explorer.

Custom artwork commission is **optional ($0–500)**; default is Galxe-native templated cards with the IndexFlow wordmark.

---

## Leaderboard

The `/operators` page on indexflow.app is the canonical surface. It shows:

- Weekly NAV rankings (top 5 highlighted)
- Current streak per curator
- OAT badges earned
- Historical weekly results

The leaderboard worker runs via **GitHub Actions** (Sunday 23:59 UTC), not Cloud Run. See [`.github/workflows/curator-leaderboard.yml`](../.github/workflows/curator-leaderboard.yml).

```mermaid
flowchart LR
  envio[Envio HyperIndex] --> gha[GitHub Actions weekly job]
  gha --> snapshot[apps/web/public/curator-leaderboard.snapshot.json]
  snapshot --> vercel[Vercel deploy on push]
  vercel --> credential[/api/galxe/credential]
  credential --> galxe[Galxe REST check]
  galxe --> payout[USDC claim]
```

---

## Anti-Sybil

- **Privy gating** — Privy login gates testnet writes by email. Wallet activity check confirms real engagement.
- **Operator activity gate** — Must have ≥1 operator action per week to qualify for weekly rankings.
- **NAV-ranked** — Farming testnet tokens doesn't help; only share price performance matters.
- **OATs are non-transferable** — Multi-account farming costs gas without compounding value.

---

## Budget

| Line item | Weekly | Monthly | Notes |
| --------- | ------ | ------- | ----- |
| Galxe campaign listing | $0 | $0 | Free |
| **Curator weekly USDC pool** | **$50** | **$200** | Top 5 by NAV growth |
| Custom OAT artwork (optional) | — | $0–500 | Default templated cards are fine |
| **Total** | **$50** | **$200–700** | |

---

## Engineering Surface

- **`apps/web/src/app/api/galxe/credential/route.ts`** — REST endpoint returning `1` or `0` for each credential check.

  Supports:
  - `curator-genesis` — live Envio check
  - `curator-weekly-winner-{weekKey}` — snapshot lookup
  - `curator-streak-2`, `curator-streak-3` — snapshot lookup
  - `curator-badge-champion`, `curator-badge-consistent`, `curator-badge-veteran` — snapshot or live Envio

- **`services/leaderboard-worker/`** — Snapshot generator invoked by [`.github/workflows/curator-leaderboard.yml`](../.github/workflows/curator-leaderboard.yml) every Sunday 23:59 UTC. Commits `apps/web/public/curator-leaderboard.snapshot.json`; push redeploys Vercel.

- **`apps/web/src/lib/galxe/`** — Shared logic for qualification checks, NAV math, and snapshot parsing.

---

## What's Pending Before Launch

- [ ] **Galxe space created** — `IndexFlow` workspace with 8 Curator tasks configured.
- [ ] **OAT artwork uploaded** — 4 Curator OATs. Galxe-native templated cards acceptable.
- [ ] **REST credential endpoint deployed** — `apps/web/src/app/api/galxe/credential/route.ts` live on Vercel.
- [ ] **Curator weekly USDC pool funded** — $200/month ($50/week) loaded into Galxe reward claims.
- [ ] **Leaderboard snapshot workflow enabled** — [`.github/workflows/curator-leaderboard.yml`](../.github/workflows/curator-leaderboard.yml) runs on schedule; `ENVIO_URL` secret set; `NEXT_PUBLIC_SITE_URL` on Vercel for snapshot fallback

Soft launch: **Curator Genesis quest live immediately**. First weekly payout after the first Sunday snapshot.

---

## Future Expansion (Season 2)

When Curators Guild is running smoothly, consider adding:

- **Onboarding sub-campaign** — Twitter follow, Discord join, quiz, etc.
- **Educators Guild** — Quizzes, UGC tweets, doc PRs (requires primer content)
- **Allocators / Engineers / Cross-Chain Couriers** — via Boost.xyz for onchain incentives
- **Multi-dimensional leaderboard** — combining all guilds with weighted scoring
