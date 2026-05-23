---
partner: BNB Chain
canonical_handle: "@BNBCHAIN"
status: in_discussion
counterpart: TBD (TBD)
indexflow_lead: Reuben
last_touch: 2026-05-23
next_milestone: "Verify CCIP testnet lane Sepolia <-> BNB Smart Chain Testnet, then run script/DeploySpoke.s.sol for the hackathon submission"
next_milestone_date: TBD
co_branded_surfaces:
  x_calendar: N/A
  galxe_quest: TBD (Season 2 candidate)
  boost_action: TBD (Season 1 follow-up if budget permits)
  ecosystem_grant: not yet scoped
guilds_touched: [Cross-Chain Couriers]
chain:
  vm: EVM
  testnet:
    chain_id: 97
    name: BNB Smart Chain Testnet
    role: spoke
    deployment_status: in progress
    deployed_at: n/a
    addresses_doc: apps/web/src/config/bnb-testnet-deployment.json (planned)
  mainnet:
    chain_id: 56
    name: BNB Smart Chain
    role: spoke
    deployment_status: not started
    deployed_at: n/a
    addresses_doc: n/a until mainnet
hackathon_track: TBD (BNB Chain hackathon track — user to confirm exact program name and dates)
---

# BNB Chain

## Why this partnership exists

BNB Smart Chain is a candidate spoke for IndexFlow's hub-and-spoke topology. As an EVM chain it can reuse the existing `script/DeploySpoke.s.sol` flow with no code changes — only a new `config/chains.json` entry (CCIP router + LINK + chain selector) and a per-chain deployment JSON. The audience is large and DeFi-native, which makes BNB a strong Cross-Chain Couriers spoke in parallel with Mantle. The hackathon track is the immediate forcing function: a submission deliverable is what gets the spoke deployed against a hard deadline rather than slipping into a "next quarter" item.

## Deployment status

**Testnet**

- Status: in progress
- Chain: BNB Smart Chain Testnet (`97`)
- Role: spoke (deposit-only; no perp stack, bootstrap basket only)
- Deploy script / tooling: `script/DeploySpoke.s.sol` (same path used for Fuji and being prepared for Mantle Sepolia)
- Addresses doc: `apps/web/src/config/bnb-testnet-deployment.json` (planned — not yet created)
- What works today: nothing on-chain yet. Hub-side Sepolia stack is live and ready to accept a new spoke.
- What is pending: confirm CCIP wiring (router, LINK token, chain selector), add `bnb-testnet` to `config/chains.json`, run `CHAIN=bnb-testnet forge script DeploySpoke.s.sol --slow`, write addresses to `apps/web/src/config/bnb-testnet-deployment.json`, append the new contracts to `AGENT_DEPLOYMENT_MEMORY.md`.
- Blockers: **CCIP lane verification is the blocker.** Chainlink CCIP needs an active testnet lane Sepolia ↔ BNB Smart Chain Testnet for the `StateRelay` + `RedemptionReceiver` pattern to work end-to-end. If the lane is not live, the spoke can still deploy as a "deposit-only with locally-posted state" variant for the hackathon demo, but the multi-chain redemption path is degraded until CCIP catches up. User to confirm before deploy.

**Mainnet**

- Status: not started
- Chain: BNB Smart Chain (`56`)
- Role: spoke
- Next concrete step: scope gated on hackathon outcome — if the testnet spoke ships and gets traction, mainnet follows the BNB ecosystem grant track rather than the hackathon timeline.

## Active campaigns

- No date-slotted X campaign yet. A `@BNBCHAIN` co-tweet slot becomes a candidate once the testnet spoke is live and the first cross-chain deposit through `IntentRouter` from BNB Smart Chain Testnet has been measured.

## Open requests on both sides

**From them:**

- TBD — first confirmed touch needs to surface what BNB Chain wants from IndexFlow (logo placement on the spoke-chain matrix, hackathon submission deliverables and judging criteria, ecosystem-grant prerequisites such as a deployed mainnet spoke, depth of technical integration).

**From us:**

- Confirm canonical X handle for the counterpart (likely `@BNBCHAIN`, but `@BNBChain_Dev` or a regional handle may be more relevant depending on which team is running the hackathon).
- Confirmation of the BNB hackathon track name, submission deadline, and judging criteria so the BNB testnet spoke deploy can be scheduled against it.
- Confirmation of the CCIP lane status Sepolia ↔ BNB Smart Chain Testnet.

## Future surfaces (Season 2+)

- BNB ecosystem grant application — formal scope still to be drafted; agent must not initiate without explicit user approval per the deployment safety rules.
- Mainnet BNB spoke deploy via `script/DeploySpoke.s.sol`, including a BNB mainnet entry in `config/chains.json` and the corresponding addresses in the spoke deployment matrix.
- Co-marketed thread post-deploy once the first cross-chain deposit through `IntentRouter` from BNB Smart Chain has been measured.
- Co-funded Boost.xyz Action ("first N baskets created with a BNB-deployed `BasketShareToken` get an extra USDC bonus").

## Historical thread / contact log

- 2026-05-23 — chain-partnerships subfolder introduced; BNB Chain file created with hackathon track flagged as the immediate forcing function for testnet spoke deploy.
