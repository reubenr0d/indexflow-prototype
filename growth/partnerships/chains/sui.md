---
partner: Sui
canonical_handle: "@SuiNetwork"
status: in_discussion
counterpart: TBD (TBD)
indexflow_lead: Reuben
last_touch: 2026-05-26
next_milestone: "Confirm Sui counterpart + scope (real Move spoke implementation vs. co-marketing/grant relationship); nothing has been agreed yet"
next_milestone_date: TBD
co_marketing: not_confirmed
funding_intros: none
co_branded_surfaces:
  x_calendar: N/A
  galxe_quest: TBD (Season 2 candidate)
  boost_action: TBD (Season 1 follow-up if budget permits)
  ecosystem_grant: not yet scoped
guilds_touched: [Cross-Chain Couriers, Engineers]
chain:
  vm: non-EVM (Move)
  testnet:
    chain_id: n/a
    name: Sui testnet
    role: spoke
    deployment_status: not started
    deployed_at: n/a
    addresses_doc: n/a until tooling is decided
  mainnet:
    chain_id: n/a
    name: Sui mainnet
    role: spoke
    deployment_status: not started
    deployed_at: n/a
    addresses_doc: n/a until mainnet
hackathon_track: n/a
---

# Sui

## Why this partnership exists

Sui is a candidate non-EVM spoke for IndexFlow's hub-and-spoke topology. Its parallel execution and object-centric Move model give it a different developer and DeFi audience from the EVM spokes (Mantle, BNB, Avalanche Fuji) — which makes it a strong fit for the Cross-Chain Couriers + Engineers story that hub-and-spoke is a topology, not an EVM-only pattern. Communications with the Sui ecosystem have started, but **Sui has not agreed to anything yet** — no co-marketing confirmation, no deployment scope, no funding intros.

## Deployment status

**Testnet**

- Status: not started
- Chain: Sui testnet
- Role: spoke (intended; subject to scope decision)
- Deploy script / tooling: **not** `script/DeploySpoke.s.sol` — that is Solidity/Foundry and cannot deploy to Sui. A real spoke requires net-new Move contracts for `BasketVault`, `StateRelay`, `RedemptionReceiver`, `MockUSDC`, plus a new keeper handler in `services/keeper/` that knows how to read/write Sui state. The alternative is a wrapped/co-marketing-only relationship without a code deployment.
- Addresses doc: n/a until the tooling decision is made
- What works today: nothing on-chain yet. Communications opened 2026-05-26; no counterpart confirmed; no scope decision yet.
- What is pending: confirm Sui ecosystem/BD counterpart, decide real Move spoke vs. wrapped/co-marketing-only, then scope implementation work if a real spoke is chosen.
- Blockers: **scope decision is the blocker.** CCIP does not support Sui today; any cross-chain messaging needs a different bridge or a relayer-based pattern. Wormhole supports Sui and is flagged as a candidate bridge option — not a commitment.

**Mainnet**

- Status: not started
- Chain: Sui mainnet
- Role: spoke (intended)
- Next concrete step: gate on testnet scope decision and counterpart confirmation.

## Active campaigns

- No date-slotted X campaign yet. A `@SuiNetwork` co-tweet slot becomes a candidate only after counterpart confirmation and a concrete demo or agreed co-marketing surface exists.

## Open requests on both sides

**From them:**

- TBD — counterpart not yet confirmed; first concrete touch needs to surface what (if anything) Sui wants from IndexFlow.

**From us:**

- Confirm canonical Sui ecosystem/BD counterpart and whether the relationship has a concrete deliverable in mind from their side, before committing IndexFlow engineering time to a non-EVM spoke implementation.
- Confirm the canonical X handle — likely `@SuiNetwork`, but `@Mysten_Labs` or a regional handle may be more relevant depending on which team is engaging.

## Future surfaces (Season 2+)

- Sui ecosystem grant application — formal scope still to be drafted; agent must not initiate without explicit user approval per the deployment safety rules.
- Real non-EVM spoke implementation if scope validates demand: Move contracts for vault/relay/redemption surfaces, a new keeper handler in `services/keeper/`, and a new spoke-deployment JSON shape (current JSONs are EVM-address-typed).
- Joint Spaces on "hub-and-spoke as a topology, not an EVM pattern" with Sui as a Move reference spoke.
- Co-marketed thread post-deploy once the first cross-chain deposit from Sui has been measured (mechanics depend on the scope decision).

## Historical thread / contact log

- 2026-05-26 — initial outreach to Sui ecosystem (counterpart TBD); communications started but Sui has not agreed to anything yet. co_marketing=not_confirmed, funding_intros=none.
