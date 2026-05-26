# Partnerships

Partnerships are tracked here as a first-class growth workstream alongside [`growth/CONTENT_CALENDAR.md`](../CONTENT_CALENDAR.md) and the date-slotted Season 1 schedule in `growth/X_CONTENT_CALENDAR.md`. Each partner has a markdown file with YAML frontmatter so the comparison table below can be regenerated programmatically from the files. New partners use [`_TEMPLATE.md`](_TEMPLATE.md) (non-chain) or [`chains/_TEMPLATE.md`](chains/_TEMPLATE.md) (chain) as a starting point.

## All partners

| partner | type | handle | status | co_marketing | funding | next_milestone | next_milestone_date | file |
| ------- | ---- | ------ | ------ | ------------ | ------- | -------------- | ------------------- | ---- |
| [Avalanche](chains/avalanche.md) | chain | `@avax` | active | agreed | intros_made | Hand back a target-fund profile to Ava Labs so the next round of investor intros can be routed; scope co-marketing surface around the live Fuji spoke and the multi-chain deposit demo | 2026-06-01 | [chains/avalanche.md](chains/avalanche.md) |
| [Secret Network](secret-network.md) | non-chain | `@SecretNetwork` | active | agreed | none | Confirm @SecretNetwork co-tweet timing for Sat Jun 13 | 2026-06-10 | [secret-network.md](secret-network.md) |
| [iExec](iexec.md) | non-chain | `@iEx_ec` | active | agreed | none | Confirm @iEx_ec co-tweet for Fri Jun 12; scope iApp confidential-compute PoC for an IndexFlow agent | 2026-06-09 | [iexec.md](iexec.md) |
| [Nox](nox.md) | non-chain | `@nox_TBD` (pending) | active | agreed | none | Confirm Nox canonical X handle + co-tweet timing for Sun Jun 14 | 2026-06-11 | [nox.md](nox.md) |
| [Mantle](chains/mantle.md) | chain | `@Mantle_Official` | active | pending_deploy | none | Land first Mantle Sepolia spoke deploy via `script/DeploySpoke.s.sol` for the hackathon demo; confirm @Mantle_Official co-tweet timing for Thu Jun 4; flag potential ecosystem grant track to user | 2026-06-01 | [chains/mantle.md](chains/mantle.md) |
| [BNB Chain](chains/bnb.md) | chain | `@BNBCHAIN` | in_discussion | pending_deploy | none | Verify CCIP testnet lane Sepolia <-> BNB Smart Chain Testnet, then run `script/DeploySpoke.s.sol` for the hackathon submission | TBD | [chains/bnb.md](chains/bnb.md) |
| [Theseus](theseus.md) | non-chain | `@theseus_TBD` (pending) | signed_mou | pending_deploy | none | Deploy an IndexFlow vault on Theseus to unlock the agreed co-marketing surface; confirm canonical X handle and founder counterpart | TBD | [theseus.md](theseus.md) |
| [Alephium](chains/alephium.md) | chain | `@alephium` | in_discussion | not_confirmed | none | Decide whether the hackathon scope is a real Ralph spoke implementation or a co-marketing/grant relationship without a code deployment | TBD | [chains/alephium.md](chains/alephium.md) |
| [Sui](chains/sui.md) | chain | `@SuiNetwork` | in_discussion | not_confirmed | none | Confirm Sui counterpart + scope (real Move spoke implementation vs. co-marketing/grant relationship); nothing has been agreed yet | TBD | [chains/sui.md](chains/sui.md) |

### Co-marketing confirmation legend

| value | meaning |
| ----- | ------- |
| `agreed` | Partner has confirmed co-marketing; only execution (slot, tweet, asset hand-off) is outstanding. |
| `pending_deploy` | Co-marketing gated on an upcoming IndexFlow deploy on the partner's chain or platform. |
| `not_confirmed` | No confirmation from counterpart yet. |
| `active` | Co-marketing surface already running (none today). |

### Funding-intros legend

| value | meaning |
| ----- | ------- |
| `intros_made` | Partner has actually introduced IndexFlow to one or more funds/investors. Today: Ava Labs only. |
| `offered` | Partner has offered or discussed funding intros but no concrete intro yet. |
| `none` | No funding/investor intros made or offered by the partner. |

## 0xLabs introductions pipeline

[0xLabs](https://0xlabs.network) has submitted IndexFlow's application to a broad set of L1 / L2 / protocol ecosystems and is tracking progress on our behalf. The table below is the canonical list of intros submitted through that channel. Most are `awaiting_response`; the few that have already responded are linked to their per-partner file in the **All partners** table above. As more protocols respond, append a row to **All partners** (with a `co_marketing` / `funding_intros` value) and flip the status here to `responded`.

| status | meaning |
| ------ | ------- |
| `awaiting_response` | Intro submitted by 0xLabs; no reply yet. |
| `responded` | Protocol has engaged; tracked in the **All partners** table. |
| `declined` | Protocol explicitly passed; keep row for history. |

| protocol | status | notes |
| -------- | ------ | ----- |
| 0G Foundation | awaiting_response | |
| 5ire | awaiting_response | |
| Abey Foundation | awaiting_response | |
| Abstract | awaiting_response | |
| Aethir | awaiting_response | |
| Alchemy | awaiting_response | |
| Alephium | responded | tracked in [chains/alephium.md](chains/alephium.md) (status: in_discussion, co_marketing: not_confirmed) |
| Algorand | awaiting_response | |
| Analog One | awaiting_response | |
| Anoma | awaiting_response | |
| Anryton | awaiting_response | |
| Aptos | awaiting_response | |
| Arbitrum Alchemy | awaiting_response | |
| Aurora | awaiting_response | |
| Autonomys/Subspace | awaiting_response | |
| Avalanche | responded | tracked in [chains/avalanche.md](chains/avalanche.md) (status: active, co_marketing: agreed, funding_intros: intros_made) |
| Bahamut | awaiting_response | |
| Base | awaiting_response | |
| BNB | responded | tracked in [chains/bnb.md](chains/bnb.md) (status: in_discussion, co_marketing: pending_deploy) |
| Camino Network | awaiting_response | |
| Canton Network | awaiting_response | |
| Casper | awaiting_response | |
| Cedra Network | awaiting_response | |
| Centrifuge Network Foundation | awaiting_response | |
| ChainGPT | awaiting_response | |
| Chainlink | awaiting_response | |
| Chiliz | awaiting_response | |
| Concordium | awaiting_response | |
| Cosmos | awaiting_response | |
| Coti | awaiting_response | |
| Creata Chain | awaiting_response | |
| Dfinity | awaiting_response | |
| DIA Oracle | awaiting_response | |
| Doma Forge | awaiting_response | |
| dYdX | awaiting_response | |
| Eigenlayer | awaiting_response | |
| Elysium Network | awaiting_response | |
| Ethernity | awaiting_response | |
| Gitcoin | awaiting_response | |
| Gnosis VC | awaiting_response | |
| GoodDollar | awaiting_response | |
| Gravity Ecosystem VC Alliance | awaiting_response | |
| Hedera | awaiting_response | |
| Hedera Boost | awaiting_response | |
| Hedera Launch | awaiting_response | |
| Horizen Genesis | awaiting_response | |
| iExec | responded | tracked in [iexec.md](iexec.md) (status: active, co_marketing: agreed) |
| Immutable | awaiting_response | |
| IOTA | awaiting_response | |
| Iron Fish | awaiting_response | |
| Kaia | awaiting_response | possible duplicate of Line (Kaia) below |
| Kaspa | awaiting_response | |
| Kleros | awaiting_response | |
| Kub Chain | awaiting_response | |
| Lamina1 | awaiting_response | |
| Line (Kaia) | awaiting_response | possible duplicate of Kaia above |
| Linea | awaiting_response | |
| Lisk | awaiting_response | |
| Manta | awaiting_response | |
| Miden | awaiting_response | |
| Minima | awaiting_response | |
| Monad | awaiting_response | |
| Moonbeam | awaiting_response | |
| MultiversX | awaiting_response | |
| Oasis Protocol | awaiting_response | |
| Open Ledger | awaiting_response | |
| Optimism | awaiting_response | |
| Osmosis | awaiting_response | |
| Peaq | awaiting_response | |
| Pharos | awaiting_response | |
| Plume | awaiting_response | |
| Polkadot | awaiting_response | |
| Polymesh | awaiting_response | |
| Prezenti | awaiting_response | |
| PWR Labs | awaiting_response | |
| Quranium | awaiting_response | |
| Reactive Network | awaiting_response | |
| Render | awaiting_response | |
| Skale | awaiting_response | |
| Somnia | awaiting_response | |
| Soneium | awaiting_response | |
| Sonic Labs | awaiting_response | |
| Starknet | awaiting_response | |
| Ston.fi | awaiting_response | |
| Storm Partners | awaiting_response | |
| Taiko | awaiting_response | |
| Tanssi | awaiting_response | |
| Taraxa | awaiting_response | |
| Tezos | awaiting_response | |
| Thrive zkVerify | awaiting_response | |
| TON | awaiting_response | |
| Tonomy | awaiting_response | |
| Trust Wallet | awaiting_response | |
| Unichain | awaiting_response | |
| VeChain | awaiting_response | |
| VGX Foundation | awaiting_response | |
| Virtuals | awaiting_response | |
| Voi Network | awaiting_response | |
| Web3 Foundation | awaiting_response | |
| Web3 Public Goods Glo Dollar | awaiting_response | |
| WhiteChain | awaiting_response | |
| Wire | awaiting_response | |
| World Foundation | awaiting_response | |
| Wormhole Ecosystem Fund | awaiting_response | |
| X1 Ecochain | awaiting_response | |
| Xion Investment Program | awaiting_response | |
| XRPL | awaiting_response | |
| XRPL Global | awaiting_response | |
| Zetachain | awaiting_response | |
| Zircuit | awaiting_response | |

**Summary:** 110 protocols introduced via 0xLabs · 4 responded (Avalanche, Alephium, BNB, iExec) · 106 awaiting response · 0 declined.

When a protocol from this pipeline responds:

1. Create a per-partner file under [`growth/partnerships/`](.) or [`growth/partnerships/chains/`](chains/) (chain partners use the `chains/_TEMPLATE.md`).
2. Append a row to the **All partners** table above (with `co_marketing` / `funding_intros` set to reflect the response).
3. Flip the row in this table to `responded` and add a notes-cell link to the new per-partner file.
4. Append a contact-log entry to the new per-partner file noting the 0xLabs origin of the intro.

## Workflow

To add a new partner:

1. Copy [`_TEMPLATE.md`](_TEMPLATE.md) to `growth/partnerships/<partner-slug>.md` (or [`chains/_TEMPLATE.md`](chains/_TEMPLATE.md) for a chain partner).
2. Fill in every `<placeholder>` value in the YAML frontmatter and the markdown sections.
3. Append a row to the **All partners** table above, reading values directly from the new file's frontmatter (`partner`, `canonical_handle`, `status`, `co_marketing`, `funding_intros`, `next_milestone`, `next_milestone_date`, plus `type` = `chain` or `non-chain`).
4. Wire the partner into any matching slot in `growth/X_CONTENT_CALENDAR.md` (and add a draft file under `growth/drafts/` if the slot does not have one yet).
5. For chain partners with on-chain deployments, also append a row to [`chains/README.md`](chains/README.md) and update [`AGENT_DEPLOYMENT_MEMORY.md`](../../AGENT_DEPLOYMENT_MEMORY.md) when contracts land.
6. Commit the new partner file, the updated `README.md` row, and any calendar wiring together so the index, the per-partner file, and the date-slotted schedule stay in lockstep.

When a partnership moves to dormant: ~~strikethrough~~ the row in the table but keep the file. Update the file's frontmatter `status` to `dormant` and append a final entry to the contact log explaining why the relationship is no longer active.

## Chain partners

Chain partnerships (counterparts that IndexFlow may deploy a hub or spoke onto) are tracked separately in [`chains/`](chains/) because each row has a deployment lifecycle (testnet → mainnet) on top of the usual co-tweet / Galxe / Boost surfaces. One chain partnership typically maps to many rows in [`AGENT_DEPLOYMENT_MEMORY.md`](../../AGENT_DEPLOYMENT_MEMORY.md) (one per deployed contract), so the chain-partners table doubles as the index into that deployment ledger.

See [`chains/README.md`](chains/README.md) for the full chain-partners table (with testnet/mainnet deployment columns) and deployment-status legend. Currently tracked:

- [Avalanche](chains/avalanche.md) — EVM spoke; Fuji testnet live (full stack + twin baskets in `apps/web/src/config/fuji-deployment.json`); mainnet C-Chain in discussion; Ava Labs co-marketing agreed; only partner with funding intros so far.
- [Mantle](chains/mantle.md) — EVM spoke; Mantle Sepolia hackathon target; co-marketing gated on spoke deploy; also the Season 1 X co-tweet partner (Thu Jun 4).
- [BNB](chains/bnb.md) — EVM spoke; BNB Smart Chain Testnet hackathon target; co-marketing gated on spoke deploy; CCIP lane verification flagged as a prerequisite.
- [Alephium](chains/alephium.md) — non-EVM (UTXO + Ralph); hackathon target; no confirmation from counterpart yet; deployment shape (real Ralph spoke vs. wrapped/co-marketing-only) TBD.
- [Sui](chains/sui.md) — non-EVM (Move); communications opened 2026-05-26, no agreement yet; scope decision pending (real Move spoke vs. wrapped/co-marketing-only).

## Partnership × platform

Which platform surface each partner co-funds or co-tweets on. All four Season 1 partners are X co-tweet only; Galxe quests and Boost.xyz actions are recorded as Season 2 candidates so they do not drop when Season 2 scoping starts. Layer3 Activations are out of scope for Season 1 entirely (per the Option C platform-stack design).

| partner | X (Season 1) | Galxe (Season 2 candidate) | Boost.xyz (Season 1 follow-up if budget permits) | Ecosystem grant track |
| ------- | ------------ | -------------------------- | ----------------------------------------------- | --------------------- |
| Secret Network | Co-tweet 2026-06-13 | Educators Guild quiz: "Pass a Secret Network privacy primer" | Co-funded action on encrypted-weighting basket registration | Not yet scoped |
| Mantle | Co-tweet 2026-06-04 | Onboarding task: "Follow @Mantle_Official" | Co-funded action on first N Mantle-spoke basket creations | Candidate (warm intro requested, not yet applied) |
| iExec | Co-tweet 2026-06-12 | Engineers Guild quiz on confidential compute | Co-funded action on first N agents shipped inside an iApp | Not yet scoped |
| Nox | Co-tweet 2026-06-14 | Engineers Guild quiz on MPC threshold signing | Co-funded action on keeper-signing PoC participation | Not yet scoped |

## File layout

```
growth/partnerships/
  README.md             # this file (master comparison table + workflow)
  _TEMPLATE.md          # per-partner schema with placeholders (generic partner)
  theseus.md            # vault-deploy-gated co-marketing; founders engaged
  secret-network.md     # State leg of the Week 3 confidential-infra trinity
  iexec.md              # Compute leg of the Week 3 confidential-infra trinity
  nox.md                # Signing leg of the Week 3 confidential-infra trinity
  chains/               # chain partnerships (separate lifecycle: testnet -> mainnet)
    README.md           # chain-partners index + deployment-status legend + workflow
    _TEMPLATE.md        # per-chain schema (extends the generic shape with a chain: block)
    mantle.md           # Cross-Chain Couriers spoke demo (Week 2) + Mantle Sepolia hackathon target
    avalanche.md        # Fuji spoke live; mainnet C-Chain in discussion; Ava Labs funding intros
    bnb.md              # BNB Smart Chain Testnet hackathon target
    alephium.md         # Non-EVM (UTXO + Ralph) hackathon target; scope TBD
    sui.md              # Non-EVM (Move); communications opened; no agreement yet
```
