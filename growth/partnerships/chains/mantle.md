---
partner: Mantle
canonical_handle: "@Mantle_Official"
status: active
counterpart: TBD (TBD)
indexflow_lead: Reuben
last_touch: 2026-05-23
next_milestone: "Land first Mantle Sepolia spoke deploy via script/DeploySpoke.s.sol for the hackathon demo; confirm @Mantle_Official co-tweet timing for Thu Jun 4; flag potential ecosystem grant track to user"
next_milestone_date: 2026-06-01
co_branded_surfaces:
  x_calendar: 2026-06-04
  galxe_quest: TBD (Season 2 candidate)
  boost_action: TBD (Season 1 follow-up if budget permits)
  ecosystem_grant: candidate (warm intro requested, not yet applied)
guilds_touched: [Cross-Chain Couriers, Curators]
chain:
  vm: EVM
  testnet:
    chain_id: 5003
    name: Mantle Sepolia
    role: spoke
    deployment_status: in progress
    deployed_at: n/a
    addresses_doc: apps/web/src/config/mantle-deployment.json (planned)
  mainnet:
    chain_id: 5000
    name: Mantle
    role: spoke
    deployment_status: in discussion
    deployed_at: n/a
    addresses_doc: n/a until mainnet
hackathon_track: TBD (Mantle hackathon track — user to confirm exact program name and dates)
---

# Mantle

## Why this partnership exists

Mantle is a strong candidate spoke chain for IndexFlow's hub-and-spoke topology. Today the hub stack lives on Sepolia with Fuji as the first deposit-only spoke; a Mantle spoke would pair naturally with the existing `script/DeploySpoke.s.sol` flow — a deposit-only spoke vault on Mantle that mirrors basket state from the Sepolia hub via `StateRelay`, with no curator surface duplicated on the spoke. The reach is also material: `@Mantle_Official` has a deep DeFi audience that overlaps directly with the curator and cross-chain courier personas Season 1 is built for. The hackathon track adds a hard deadline to actually land the testnet spoke instead of leaving it as a "next quarter" item.

## Deployment status

**Testnet**

- Status: in progress
- Chain: Mantle Sepolia (`5003`)
- Role: spoke (deposit-only; no perp stack, no curator-facing config beyond bootstrap basket)
- Deploy script / tooling: `script/DeploySpoke.s.sol` (same EVM path as the live Fuji spoke; one Foundry profile + RPC env away)
- Addresses doc: `apps/web/src/config/mantle-deployment.json` (planned — not yet created)
- What works today: nothing on-chain yet. Hub-side Sepolia stack is live and ready to receive a new spoke entry; multi-chain deposit drawer in `apps/web` already supports name-matched twin baskets and will auto-light up a Mantle entry once `apps/web/src/config/mantle-deployment.json` is written.
- What is pending: add `mantle` to `config/chains.json` with CCIP router + LINK + chain selector, run `CHAIN=mantle forge script DeploySpoke.s.sol --slow`, write the resulting addresses to `apps/web/src/config/mantle-deployment.json`, append the new contracts to `AGENT_DEPLOYMENT_MEMORY.md`, restart the Envio indexer so it picks up the new addresses from `config.local.generated.yaml`.
- Blockers: confirm CCIP lane Sepolia ↔ Mantle Sepolia is live (Chainlink CCIP supports Mantle Sepolia as of 2025 but the chain selector / router / LINK token must be pinned before deploy).

**Mainnet**

- Status: in discussion
- Chain: Mantle (`5000`)
- Role: spoke
- Next concrete step: gate on ecosystem-grant outcome — a deployed mainnet Mantle spoke is the most common prerequisite asked for by Mantle's grant program, so mainnet scope follows the grant track timeline rather than the hackathon timeline.

## Active campaigns

- 2026-06-04 (Thu standalone) — `growth/drafts/2026-06-04-tweet-mantle-spoke-demo.md`. Demos a basket created on the Sepolia hub, a deposit accepted on a Mantle spoke, and the resulting share mint reconciled back to the hub via `StateRelay`. Co-tweet from `@Mantle_Official` quoting our standalone with one line on why Mantle is a natural spoke for IndexFlow's hub-and-spoke topology.

## Open requests on both sides

**From them:**

- TBD — first confirmed touch needs to surface what Mantle wants from IndexFlow (logo placement on the spoke-chain matrix, depth of technical integration, any ecosystem-grant prerequisites such as a deployed mainnet spoke, hackathon submission deliverables).

**From us:**

- Co-tweet on Thu Jun 4 quoting the spoke demo standalone.
- Warm introduction to the Mantle ecosystem grant program (out of X-plan scope; tracked here so the parallel grant track does not drop). Agent surfaces the intro candidate; user decides whether to pursue.
- Confirmation of the Mantle hackathon track name + submission deadline so the Mantle Sepolia spoke deploy can be scheduled against it.

## Future surfaces (Season 2+)

- Mantle ecosystem grant application — formal scope still to be drafted; agent should not initiate without explicit user approval per the deployment safety rules.
- Mainnet Mantle spoke deploy via `script/DeploySpoke.s.sol`, including a Mantle mainnet entry in `config/chains.json` and the corresponding addresses in the spoke deployment matrix that the frontend reads from.
- Co-marketed thread post-Season-1 once a Mantle spoke is live and the first cross-chain deposit through `IntentRouter` from Mantle has been measured.
- Co-funded Boost.xyz Action ("first 50 baskets created with a Mantle-deployed `BasketShareToken` get an extra USDC bonus"), per the Option C platform-stack design.

## Historical thread / contact log

- 2026-05-23 — chain-partnerships subfolder introduced; Mantle partnership file moved into `growth/partnerships/chains/` and `chain:` block added; Mantle Sepolia spoke flagged as the hackathon deploy target.
- 2026-05-23 — partnership tracking system created in repo; Season 1 placement confirmed (Thu Jun 4 standalone anchoring the Cross-Chain Couriers spoke demo).
