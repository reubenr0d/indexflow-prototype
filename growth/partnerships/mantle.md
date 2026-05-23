---
partner: Mantle
canonical_handle: "@Mantle_Official"
status: active
counterpart: TBD (TBD)
indexflow_lead: Reuben
last_touch: 2026-05-23
next_milestone: "Confirm @Mantle_Official co-tweet timing for Thu Jun 4; flag potential ecosystem grant track to user"
next_milestone_date: 2026-06-01
co_branded_surfaces:
  x_calendar: 2026-06-04
  galxe_quest: TBD (Season 2 candidate)
  boost_action: TBD (Season 1 follow-up if budget permits)
  ecosystem_grant: candidate (warm intro requested, not yet applied)
guilds_touched: [Cross-Chain Couriers, Curators]
---

# Mantle

## Why this partnership exists

Mantle is a strong candidate spoke chain for IndexFlow's hub-and-spoke topology. Today the hub stack lives on Sepolia with Fuji as the first deposit-only spoke; a Mantle spoke would pair naturally with the existing `script/DeploySpoke.s.sol` flow — a deposit-only spoke vault on Mantle that mirrors basket state from the Sepolia hub via `StateRelay`, with no curator surface duplicated on the spoke. The reach is also material: `@Mantle_Official` has a deep DeFi audience that overlaps directly with the curator and cross-chain courier personas Season 1 is built for.

## Active campaigns

- 2026-06-04 (Thu standalone) — `growth/drafts/2026-06-04-tweet-mantle-spoke-demo.md`. Demos a basket created on the Sepolia hub, a deposit accepted on a Mantle spoke, and the resulting share mint reconciled back to the hub via `StateRelay`. Co-tweet from `@Mantle_Official` quoting our standalone with one line on why Mantle is a natural spoke for IndexFlow's hub-and-spoke topology.

## Open requests on both sides

**From them:**

- TBD — first confirmed touch needs to surface what Mantle wants from IndexFlow (logo placement on the spoke-chain matrix, depth of technical integration, any ecosystem-grant prerequisites such as a deployed mainnet spoke).

**From us:**

- Co-tweet on Thu Jun 4 quoting the spoke demo standalone.
- Warm introduction to the Mantle ecosystem grant program (out of X-plan scope; tracked here so the parallel grant track does not drop). Agent surfaces the intro candidate; user decides whether to pursue.

## Future surfaces (Season 2+)

- Mantle ecosystem grant application — formal scope still to be drafted; agent should not initiate without explicit user approval per the deployment safety rules.
- Technical integration to deploy a real Mantle spoke via `script/DeploySpoke.s.sol`, including a Mantle entry in `apps/web/src/config/local-deployment.json` and the corresponding addresses in the spoke deployment matrix that the frontend reads from.
- Co-marketed thread post-Season-1 once a Mantle spoke is live and the first cross-chain deposit through `IntentRouter` from Mantle has been measured.
- Co-funded Boost.xyz Action ("first 50 baskets created with a Mantle-deployed `BasketShareToken` get an extra USDC bonus"), per the Option C platform-stack design.

## Historical thread / contact log

- 2026-05-23 — partnership tracking system created in repo; Season 1 placement confirmed (Thu Jun 4 standalone anchoring the Cross-Chain Couriers spoke demo).
