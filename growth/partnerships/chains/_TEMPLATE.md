<!--
Copy this file to `growth/partnerships/chains/<chain-slug>.md`, then:
  1. Delete this comment block so the YAML frontmatter starts at line 1
     (any tooling that regenerates the chain-partners table expects `---` on line 1).
  2. Replace every `<placeholder>` value in the frontmatter and the
     markdown sections below.
  3. Append a row to the "Chain partners" table in `growth/partnerships/chains/README.md`.
  4. If the chain has on-chain contract deployments (live or planned), add or
     update the matching row(s) in `AGENT_DEPLOYMENT_MEMORY.md` so the
     deployment ledger and the partnership tracker stay in lockstep.
  5. Update the `## Growth` → `### Partnerships` checklist in the root
     `README.md` per `.cursor/rules/growth-checklist.mdc`.
Keep the frontmatter shape (key order, indentation, scalar quoting) exactly
as below so the chain-partners table can be regenerated from the files.
-->

---
partner: <Chain Name>
canonical_handle: "@<x_handle>"
status: <active | signed_mou | in_discussion | dormant>
# co_marketing: active = running; agreed = confirmed, execution pending;
#   pending_deploy = gated on deploy; not_confirmed = no counterpart confirmation yet
# funding_intros: none | offered (discussed, no intro yet) | intros_made
co_marketing: <active | agreed | pending_deploy | not_confirmed>
funding_intros: <none | offered | intros_made>
counterpart: <Name or "TBD"> (<Role or "TBD">)
indexflow_lead: Reuben
last_touch: <YYYY-MM-DD>
next_milestone: "<one-line milestone>"
next_milestone_date: <YYYY-MM-DD>
co_branded_surfaces:
  x_calendar: <slot date, e.g. 2026-06-04, or "N/A">
  galxe_quest: <quest slug, "TBD (Season 2 candidate)", or "N/A">
  boost_action: <action id, "TBD (Season 1 follow-up if budget permits)", or "N/A">
  ecosystem_grant: <not yet scoped | scoped | applied | in review | granted | declined>
guilds_touched: [<Curators | Allocators | Engineers | Educators | Cross-Chain Couriers>]
chain:
  vm: <EVM | non-EVM (UTXO + Ralph) | non-EVM (CosmWasm) | ...>
  testnet:
    chain_id: <numeric or "n/a">
    name: <e.g. "BNB Smart Chain Testnet">
    role: <hub | spoke | hub_or_spoke>
    deployment_status: <not started | in progress | live | superseded>
    deployed_at: <YYYY-MM-DD or "n/a">
    addresses_doc: <path to apps/web/src/config/<chain>-deployment.json, or "n/a">
  mainnet:
    chain_id: <numeric or "n/a">
    name: <e.g. "BNB Smart Chain">
    role: <hub | spoke>
    deployment_status: <not started | in discussion | scoped | applied | live>
    deployed_at: <YYYY-MM-DD or "n/a">
    addresses_doc: <n/a until mainnet>
hackathon_track: <e.g. "BNB DeFi hackathon Q3 2026" or "n/a">
---

# <Chain Name>

## Why this partnership exists

<2-4 sentences on the strategic fit. Map the chain to IndexFlow's hub-and-spoke topology specifically: is it a candidate hub, a deposit-only spoke, or a non-EVM spoke that needs a separate implementation? Name the exact deploy script (`script/Deploy.s.sol` for hub, `script/DeploySpoke.s.sol` for an EVM spoke) and the audience the chain unlocks (curators, allocators, cross-chain couriers).>

## Deployment status

**Testnet**

- Status: <not started | in progress | live | superseded>
- Chain: <name and chain_id, or "n/a" for non-EVM>
- Role: <hub | spoke>
- Deploy script / tooling: <`script/DeploySpoke.s.sol` | custom Ralph contracts | etc.>
- Addresses doc: <path to `apps/web/src/config/<chain>-deployment.json`, or "n/a until deployed">
- What works today: <e.g. spoke vault accepts deposits, StateRelay receives keeper updates, multi-chain deposit drawer routes to a name-matched twin basket>
- What is pending: <e.g. CCIP lane verification, RedemptionReceiver wiring, twin basket creation>
- Blockers: <e.g. no CCIP testnet lane to Sepolia, non-EVM toolchain, oracle adapter not available>

**Mainnet**

- Status: <not started | in discussion | scoped | applied | live>
- Chain: <name and chain_id, or "n/a">
- Role: <hub | spoke>
- Next concrete step: <e.g. confirm grant-track gating on a mainnet spoke, scope security review, add entry to `config/chains.json`>

## Active campaigns

- <slot date> (<slot type, e.g. "Thu standalone" or "Fri thread">) — `growth/drafts/<YYYY-MM-DD>-<type>-<slug>.md`. <One line describing the slot's angle.> Co-tweet from `@<chain_handle>` quoting our slot with one line of chain context.

## Open requests on both sides

**From them:**

- <e.g. logo placement on the spoke-chain matrix, ecosystem grant application, technical integration scope, joint Spaces, hackathon submission.>

**From us:**

- <e.g. co-tweet timing for the slot date, ecosystem fund pre-introduction, shared Galxe quest, hackathon mentor intro.>

## Future surfaces (Season 2+)

- <e.g. ecosystem grant application — formal scope still to be drafted; agent must not initiate without explicit user approval per the deployment safety rules.>
- <e.g. technical integration to deploy a real spoke via `script/DeploySpoke.s.sol`, including a chain entry in `config/chains.json` and the corresponding addresses in `apps/web/src/config/<chain>-deployment.json`.>
- <e.g. co-marketed thread post-deploy once the first cross-chain deposit through `IntentRouter` from <chain> has been measured.>
- <e.g. co-funded Boost.xyz Action ("first N baskets created with a <chain>-deployed `BasketShareToken` get an extra USDC bonus").>

## Historical thread / contact log

- <YYYY-MM-DD> — <touch description; reverse-chronological so the most recent touch is at the top.>
