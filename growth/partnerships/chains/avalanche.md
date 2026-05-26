---
partner: Avalanche
canonical_handle: "@avax"
status: active
co_marketing: agreed
funding_intros: intros_made
counterpart: Ava Labs (Ecosystem)
indexflow_lead: Reuben
last_touch: 2026-05-26
next_milestone: "Hand back a target-fund profile to Ava Labs so the next round of investor intros can be routed; scope co-marketing surface around the live Fuji spoke and the multi-chain deposit demo"
next_milestone_date: 2026-06-01
co_branded_surfaces:
  x_calendar: N/A
  galxe_quest: TBD (Season 2 candidate)
  boost_action: TBD (Season 1 follow-up if budget permits)
  ecosystem_grant: not yet scoped
guilds_touched: [Cross-Chain Couriers]
chain:
  vm: EVM
  testnet:
    chain_id: 43113
    name: Avalanche Fuji
    role: spoke
    deployment_status: live
    deployed_at: 2026-05-21
    addresses_doc: apps/web/src/config/fuji-deployment.json
  mainnet:
    chain_id: 43114
    name: Avalanche C-Chain
    role: spoke
    deployment_status: in discussion
    deployed_at: n/a
    addresses_doc: n/a until mainnet
hackathon_track: n/a
---

# Avalanche

## Why this partnership exists

Avalanche is IndexFlow's first live spoke chain. The Fuji testnet stack was deployed on 2026-05-21 via `script/DeploySpoke.s.sol` and is the reference implementation every other EVM spoke (Mantle, BNB) is being modeled on. The multi-chain deposit drawer in `apps/web` is exercised end-to-end against Fuji today: a user can deposit on Fuji and the keeper-posted `StateRelay.updateState()` reconciles routing weights and per-spoke PnL back to the Sepolia hub. That makes Avalanche the natural co-marketing partner for any "first cross-chain deposit", "first multi-chain basket", or "hub-and-spoke topology in production" content — and it makes a mainnet C-Chain spoke a credible Season 2 conversation rather than a cold ask.

## Deployment status

**Testnet**

- Status: live
- Chain: Avalanche Fuji (`43113`)
- Role: spoke (deposit-only; no perp stack, bootstrap basket only)
- Deploy script / tooling: `script/DeploySpoke.s.sol`
- Addresses doc: [`apps/web/src/config/fuji-deployment.json`](../../../apps/web/src/config/fuji-deployment.json) (block `55607589`)
- What works today: full Fuji spoke stack from the 2026-05-21 clean redeploy — `BasketFactory 0xb797210b3A6315726bC829599B8b2435FEa53C29`, `StateRelay 0xF6fa7d879eF8aEed74B62121c7F8558eECe3a515`, `RedemptionReceiver 0x38041d12DAA38ca05F5b9F87f17BfE3c3123b5C4`, bootstrap basket `0x40a97cB94cb08a91D3C4539651E4F6EfA14eeFd1`, `MockUSDC 0x09e34E0FCA591BbFe7759eD9927e17cd3cd135D8`. Two twin baskets created on 2026-05-22 for multi-chain deposit routing: `Minestarters ML Picks` Fuji twin `0x6180f8d6cdd3f5d42d00130b52ab635a2d618f53` and `Minestarters Quality Matrix` Fuji twin `0x435847fa2f0c91c6d39067ab85c0cd9234d2b979`. StateRelay keeper is the deployer wallet `0x36716C8C5D1ae680C78bD0ECc230896556399713` (KeeperHub removed per CHANGELOG 2026-05-20). All addresses are recorded in [`AGENT_DEPLOYMENT_MEMORY.md`](../../../AGENT_DEPLOYMENT_MEMORY.md).
- What is pending: `RedemptionReceiver.setTrustedSender(...)` is **not** wired yet — deferred until a Sepolia-side redemption sender contract exists.
- Blockers: none for the current spoke scope.

**Mainnet**

- Status: in discussion
- Chain: Avalanche C-Chain (`43114`)
- Role: spoke
- Next concrete step: confirm Avalanche counterpart, then scope whether mainnet C-Chain follows the hackathon track of other chains or sits on its own grant / co-marketing track (the existing Fuji deployment removes "can you even deploy" as a question, which usually accelerates these conversations).

## Active campaigns

- No date-slotted X campaign yet. Avalanche is currently the implicit hero of any multi-chain deposit / spoke-topology content (the Fuji spoke is what makes those demos real); a dedicated `@avax` co-tweet slot is a candidate once a counterpart is confirmed.

## Funding intros

- TBD (Reuben to fill in fund names + intro dates). Ava Labs is currently the only partner who has made any funding intros.

## Open requests on both sides

**From them — Funding intros:**

- Ava Labs has already connected IndexFlow to one or more funds (specific fund names TBD — Reuben to fill in). Continued routing depends on us passing back a tightened target-fund profile.

**From them — Co-marketing:**

- Confirm co-marketing surface (logo placement on the spoke-chain matrix, joint Spaces, Fuji-spoke-as-reference-implementation deep-dive) and the specific Ava Labs counterpart name.

**From us — Funding:**

- Hand back a 1-pager + target-fund profile (stage, check size, thesis fit, geographic preference) so Ava Labs can keep routing introductions.

**From us — Co-marketing:**

- Scope ecosystem-grant fit for a mainnet C-Chain spoke once the counterpart is confirmed.

## Future surfaces (Season 2+)

- Avalanche ecosystem grant application — formal scope still to be drafted; agent must not initiate without explicit user approval per the deployment safety rules.
- Mainnet C-Chain spoke deploy via `script/DeploySpoke.s.sol`, including a `c-chain` entry in `config/chains.json` and a new `apps/web/src/config/c-chain-deployment.json` mirroring the Fuji structure.
- Co-marketed thread once the first redemption fill is processed through the Fuji `RedemptionReceiver` (currently blocked on a Sepolia-side redemption sender contract).
- Joint Spaces on hub-and-spoke topology, with Fuji as the live reference implementation.
- Co-funded Boost.xyz Action ("first N baskets created with an Avalanche-deployed `BasketShareToken` get an extra USDC bonus").

## Historical thread / contact log

- 2026-05-26 — Ava Labs counterpart confirmed (Ecosystem; specific name TBD). Co-marketing agreed in principle. Ava Labs has connected IndexFlow to one or more funds (names TBD) — the only partner with funding intros today.
- 2026-05-23 — chain-partnerships subfolder introduced; Avalanche file created referencing the existing Fuji spoke + twin baskets recorded in `AGENT_DEPLOYMENT_MEMORY.md`.
- 2026-05-22 — `Minestarters ML Picks` and `Minestarters Quality Matrix` Fuji twin baskets created and pre-seeded with 1,000 mUSDC each so the multi-chain deposit drawer can route name-matched splits.
- 2026-05-21 — Fuji spoke stack clean-redeploy via `CHAIN=fuji forge script DeploySpoke.s.sol --slow` (12 receipts); StateRelay keeper rotated to deployer wallet.
- 2026-04-17 — initial Fuji spoke addresses recorded in `AGENT_DEPLOYMENT_MEMORY.md` (since superseded by the 2026-05-21 clean redeploy).
