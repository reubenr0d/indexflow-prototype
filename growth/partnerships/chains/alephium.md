---
partner: Alephium
canonical_handle: "@alephium"
status: in_discussion
co_marketing: not_confirmed
funding_intros: none
counterpart: TBD (TBD)
indexflow_lead: Reuben
last_touch: 2026-05-23
next_milestone: "Decide whether the hackathon scope is a real Ralph spoke implementation or a co-marketing/grant relationship without a code deployment"
next_milestone_date: TBD
co_branded_surfaces:
  x_calendar: N/A
  galxe_quest: TBD (Season 2 candidate)
  boost_action: TBD (Season 1 follow-up if budget permits)
  ecosystem_grant: not yet scoped
guilds_touched: [Cross-Chain Couriers, Engineers]
chain:
  vm: non-EVM (UTXO + Ralph)
  testnet:
    chain_id: n/a
    name: Alephium testnet
    role: spoke
    deployment_status: in progress
    deployed_at: n/a
    addresses_doc: n/a until tooling is decided
  mainnet:
    chain_id: n/a
    name: Alephium mainnet
    role: spoke
    deployment_status: not started
    deployed_at: n/a
    addresses_doc: n/a until mainnet
hackathon_track: TBD (Alephium hackathon track — user to confirm exact program name and dates)
---

# Alephium

## Why this partnership exists

Alephium is the first non-EVM chain in the IndexFlow chain-partnership pipeline. Its sharded UTXO model + Ralph contracts give it a different reach and developer audience from the EVM spokes (Mantle, BNB) — which makes it a strong fit for the Cross-Chain Couriers + Engineers guild story about hub-and-spoke being a topology rather than an EVM-only pattern. The hackathon track is the immediate forcing function: a submission deliverable forces a concrete decision on whether IndexFlow ships a real non-EVM spoke (new Ralph code, new keeper handler, new CCIP-or-equivalent bridge) or a lighter-weight co-marketing / grant deliverable that demonstrates intent without committing to a full second-implementation surface.

## Deployment status

**Testnet**

- Status: in progress
- Chain: Alephium testnet
- Role: spoke (intended; subject to the scope decision below)
- Deploy script / tooling: **not** `script/DeploySpoke.s.sol` — that is Solidity/Foundry and cannot deploy to Alephium. A real spoke requires either (a) Ralph-equivalent contracts for `BasketVault`, `StateRelay`, `RedemptionReceiver`, `MockUSDC`, plus a new keeper handler in `services/keeper/` that knows how to read/write Alephium state, or (b) a wrapped/bridged integration where IndexFlow deposits on Alephium are routed through a bridge contract on an existing EVM spoke.
- Addresses doc: n/a until the tooling decision is made.
- What works today: nothing on-chain yet.
- What is pending: the scope decision (real Ralph spoke vs. wrapped/co-marketing-only), then the corresponding implementation work.
- Blockers: **non-EVM scope decision is the blocker.** Until the scope is pinned, none of the standard EVM-spoke steps (`config/chains.json` entry, `script/DeploySpoke.s.sol` run, `apps/web/src/config/<chain>-deployment.json`, multi-chain deposit drawer wiring) apply directly. CCIP also does not support Alephium today; any cross-chain messaging needs a different bridge or a relayer-based pattern.

**Mainnet**

- Status: not started
- Chain: Alephium mainnet
- Role: spoke (intended)
- Next concrete step: gate on the testnet scope decision and hackathon outcome.

## Active campaigns

- No date-slotted X campaign yet. A `@alephium` co-tweet slot becomes a candidate once the scope decision is made and there is a concrete demo to anchor it on (whether that is a real Ralph spoke or a co-marketing piece on hub-and-spoke topology beyond EVM).

## Open requests on both sides

**From them:**

- TBD — first confirmed touch needs to surface what Alephium wants from IndexFlow (technical integration depth, hackathon submission deliverables and judging criteria, ecosystem-grant prerequisites, logo placement, joint Spaces on non-EVM DeFi).

**From us:**

- Nothing has been confirmed from the Alephium side yet — the first ask is counterpart confirmation and whether there is any concrete engagement in mind before scoping engineering work.
- Confirmation of the Alephium hackathon track name, submission deadline, and judging criteria so the scope decision (real Ralph spoke vs. wrapped/co-marketing-only) can be made against a deadline.
- Pointer to any reference Ralph implementations of vault/escrow patterns we can crib from for a `BasketVault`-equivalent.
- Cross-chain messaging guidance: which bridge or relayer pattern Alephium's ecosystem recommends today, given CCIP is not available.

## Future surfaces (Season 2+)

- Alephium ecosystem grant application — formal scope still to be drafted; agent must not initiate without explicit user approval per the deployment safety rules.
- Real non-EVM spoke implementation if the hackathon validates the demand: Ralph contracts for `BasketVault`/`StateRelay`/`RedemptionReceiver`, a new keeper handler in `services/keeper/`, a new spoke-deployment JSON shape (current JSONs are EVM-address-typed).
- Joint Spaces on "hub-and-spoke as a topology, not an EVM pattern" with Alephium as the first non-EVM spoke reference.
- Co-marketed thread post-deploy once the first cross-chain deposit from Alephium has been measured (mechanics depend on the scope decision).

## Historical thread / contact log

- 2026-05-26 — no confirmation from Alephium counterpart yet; co_marketing=not_confirmed, funding_intros=none.
- 2026-05-23 — chain-partnerships subfolder introduced; Alephium file created with non-EVM scope and hackathon track flagged. Scope decision (real Ralph spoke vs. wrapped/co-marketing-only) recorded as the next milestone.
