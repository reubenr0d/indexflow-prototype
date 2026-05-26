# Chain partnerships

Chain partnerships are the subset of [`growth/partnerships/`](../README.md) where the counterpart is a chain (L1/L2/appchain) IndexFlow may deploy a hub or spoke onto. They are tracked separately because each row has a deployment lifecycle (testnet → mainnet) on top of the usual co-tweet / Galxe / Boost surfaces, and one chain partnership typically maps to many rows in [`AGENT_DEPLOYMENT_MEMORY.md`](../../../AGENT_DEPLOYMENT_MEMORY.md) (one per deployed contract).

The IndexFlow topology background lives in the root [`README.md`](../../../README.md#architecture): one hub runs the full perp stack, spokes are deposit-only with `StateRelay`, deploy scripts are `script/Deploy.s.sol` (hub) and `script/DeploySpoke.s.sol` (EVM spoke), and the per-chain wiring is in [`config/chains.json`](../../../config/chains.json).

For co-marketing and funding-intros column definitions, see the legends in the parent [`../README.md`](../README.md#co-marketing-confirmation-legend).

## Chain partners

| partner | handle | status | co_marketing | funding | vm | testnet | mainnet | hackathon | next_milestone | next_milestone_date |
| ------- | ------ | ------ | ------------ | ------- | -- | ------- | ------- | --------- | -------------- | ------------------- |
| [Avalanche](avalanche.md) | `@avax` | active | agreed | intros_made | EVM | Fuji (`43113`) spoke — live | Avalanche C-Chain (`43114`) spoke — in discussion | n/a | Hand back a target-fund profile to Ava Labs so the next round of investor intros can be routed; scope co-marketing surface around the live Fuji spoke and the multi-chain deposit demo | 2026-06-01 |
| [Mantle](mantle.md) | `@Mantle_Official` | active | pending_deploy | none | EVM | Mantle Sepolia (`5003`) spoke — in progress | Mantle (`5000`) spoke — in discussion | TBD (hackathon track to confirm) | Land first Mantle Sepolia spoke deploy via `script/DeploySpoke.s.sol` for the hackathon demo; confirm @Mantle_Official co-tweet timing for Thu Jun 4 | 2026-06-01 |
| [BNB Chain](bnb.md) | `@BNBCHAIN` (to confirm) | in_discussion | pending_deploy | none | EVM | BNB Smart Chain Testnet (`97`) spoke — in progress | BNB Smart Chain (`56`) spoke — not started | TBD (hackathon track to confirm) | Verify CCIP testnet lane to Sepolia, then run `script/DeploySpoke.s.sol` for the hackathon submission | TBD |
| [Alephium](alephium.md) | `@alephium` | in_discussion | not_confirmed | none | non-EVM (UTXO + Ralph) | Alephium testnet — in progress | Alephium mainnet — not started | TBD (hackathon track to confirm) | Decide whether the hackathon scope is a real Ralph spoke implementation or a co-marketing/grant relationship without a code deployment | TBD |
| [Sui](sui.md) | `@SuiNetwork` | in_discussion | not_confirmed | none | non-EVM (Move) | Sui testnet — not started | Sui mainnet — not started | n/a | Confirm Sui counterpart + scope (real Move spoke implementation vs. co-marketing/grant relationship); nothing has been agreed yet | TBD |

## Deployment status legend

| status | meaning |
| ------ | ------- |
| `not started` | No code, no contracts, no config; conversation only. |
| `in progress` | Deploy in flight: scripts being adapted, addresses not yet committed, or partial deploy (e.g. factory live but `StateRelay` pending). |
| `live` | Full spoke or hub stack deployed and recorded in [`AGENT_DEPLOYMENT_MEMORY.md`](../../../AGENT_DEPLOYMENT_MEMORY.md), with addresses in `apps/web/src/config/<chain>-deployment.json`. |
| `superseded` | A previous deployment that has been replaced by a newer one. Keep the row strikethrough for historical reference; the new deployment gets its own row. |
| `in discussion` / `scoped` / `applied` | Mainnet-only milestones used before any code is deployed to mainnet. |

## Workflow

To add a new chain partner:

1. Copy [`_TEMPLATE.md`](_TEMPLATE.md) to `growth/partnerships/chains/<chain-slug>.md`.
2. Fill in every `<placeholder>` value in the YAML frontmatter (including the `chain:` block) and the markdown sections.
3. Append a row to the **Chain partners** table above, reading values directly from the new file's frontmatter (`partner`, `canonical_handle`, `status`, `co_marketing`, `funding_intros`, `chain.vm`, `chain.testnet`, `chain.mainnet`, `hackathon_track`, `next_milestone`, `next_milestone_date`).
4. Append a matching row to the **All partners** table in [`../README.md`](../README.md).
5. If the chain has on-chain contract deployments (live or planned), add or update the matching row(s) in [`AGENT_DEPLOYMENT_MEMORY.md`](../../../AGENT_DEPLOYMENT_MEMORY.md). One chain partnership typically maps to many contract rows (e.g. `BasketFactory`, `StateRelay`, `RedemptionReceiver`, bootstrap basket, `MockUSDC`).
6. Add the chain to [`config/chains.json`](../../../config/chains.json) **only** when an actual deploy is imminent — avoid stale spoke config. Until then, record the intent in the chain file's `## Deployment status` section.
7. Update the `## Growth` → `### Partnerships` checklist in the root [`README.md`](../../../README.md) per [`.cursor/rules/growth-checklist.mdc`](../../../.cursor/rules/growth-checklist.mdc).
8. If the chain also has a co-tweet, Galxe quest, or Boost action, cross-link it into [`../README.md`](../README.md) (the parent partnerships index) so it shows up in both the master comparison table and the **Chain partners** table here.

When a chain partnership moves to dormant: ~~strikethrough~~ the row in the table but keep the file. Update the file's frontmatter `status` to `dormant` and append a final entry to the contact log explaining why the relationship is no longer active. If the corresponding `AGENT_DEPLOYMENT_MEMORY.md` deployment is also being retired, strikethrough that row separately (per the existing pattern in that file).

## File layout

```
growth/partnerships/chains/
  README.md             # this file (chain-partners index + status legend + workflow)
  _TEMPLATE.md          # per-chain schema with placeholders (extends the generic partner shape with a `chain:` block)
  mantle.md             # EVM spoke; Mantle Sepolia hackathon target; also a Season 1 X co-tweet partner
  avalanche.md          # EVM spoke; Fuji live; mainnet in discussion; Ava Labs funding intros
  bnb.md                # EVM spoke; BNB Smart Chain Testnet hackathon target
  alephium.md           # non-EVM (UTXO + Ralph); hackathon target; deployment shape TBD
  sui.md                # non-EVM (Move); communications opened; no agreement yet
```

For the broader X co-tweet / Galxe / Boost partner roster (which includes non-chain partners like Secret Network, iExec, Nox, and Theseus), see [`../README.md`](../README.md).
