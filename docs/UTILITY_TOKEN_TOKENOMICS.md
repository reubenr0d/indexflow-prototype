# Utility Token Tokenomics (Planning Document)

> **Status: Draft / Brainstorm**
>
> Nothing described in this document has been implemented. These are
> exploratory ideas for a utility token that could provide liquidity and
> align incentives across the synthetic-basket platform. Items may be
> adopted, modified, or discarded as the design matures.

---

## Motivation

The protocol today has three liquidity and incentive gaps a utility token
could address:

1. **Single collateral source** — all basket liquidity comes from investor
   USDC deposits and operator pool top-ups. There is no mechanism to
   attract or lock additional capital.
2. **Redemption bottleneck** — users can only redeem against idle USDC in a
   `BasketVault`; capital allocated to perps is illiquid until the basket
   owner calls `withdrawFromPerp`.
3. **No formal incentive alignment** — basket creators operate under
   `Ownable` with no on-chain bond or slashing. Governance is fully
   centralized.

A utility token can address each of these while creating sustainable
demand through real yield and governance rights.

---

## Idea 1 — Staking Backstop Pool

Token holders stake into a **Backstop Pool** that insures the protocol
against basket under-collateralization.

**Mechanics:**

- Stakers deposit tokens into a `StakingPool` contract with a cooldown
  period for withdrawals.
- If a basket's NAV falls below its USDC obligations (bad perp PnL), the
  backstop pool's staked tokens can be auctioned or liquidated to cover
  the shortfall.
- In return, stakers earn a pro-rata share of **all protocol fee revenue**:
  deposit/redeem fees from every basket plus a portion of GMX-layer
  trading fees.
- A `FeeDistributor` contract collects fees and distributes them to
  stakers.

**Why it matters:** gives the token intrinsic value (real yield from
protocol fees) and makes the synthetic system safer by adding an
insurance layer.

**Contracts involved:**

- New `StakingPool.sol` — stake/unstake with cooldown, reward accounting.
- New `FeeDistributor.sol` — collects from `BasketVault.collectFees` and
  GMX fee reserves; distributes pro-rata.
- Modify `BasketVault.collectFees` to split fees between basket owner and
  protocol `FeeDistributor`.

---

## Idea 2 — Redemption Liquidity Buffer

A dedicated reserve that guarantees user redemptions even when basket
USDC is allocated to perps.

**Mechanics:**

- A `RedemptionReserve` contract holds USDC contributed by token stakers.
- When a user redeems and the basket has insufficient idle USDC, the
  reserve provides the USDC and receives the basket's share tokens at a
  small discount (1-2%).
- The reserve unwinds its share-token position as the basket owner brings
  USDC back from perps.
- Stakers in the reserve earn the discount spread as yield.

**Why it matters:** guaranteed redemptions increase investor confidence and
TVL, directly deepening liquidity for synthetic assets.

---

## Idea 3 — Basket Creator Bonds

Basket creators must bond tokens to operate, aligning their incentives
with investors.

**Mechanics:**

- Creating a basket via `BasketFactory.createBasket` requires bonding N
  tokens (scaled by TVL cap or risk tier).
- The bond is slashable if:
  - The basket becomes under-collateralized.
  - The creator fails to manage perp positions (e.g., does not call
    `withdrawFromPerp` when liquidity is needed).
- Well-managed baskets earn bonus token emissions on top of their fee
  revenue.
- Bonded tokens are returned (minus any slashing) when the basket is
  wound down.

**Contracts involved:**

- New `BasketBonding.sol` or extend `BasketFactory` with bond/slash
  logic.
- Slashing conditions checked by a keeper or governance vote.

---

## Idea 4 — Fee Discount Tiers

Holding or staking tokens reduces deposit and redeem fees, creating
straightforward demand.

| Tier     | Tokens Staked | Deposit Fee Discount | Redeem Fee Discount |
| -------- | ------------- | -------------------- | ------------------- |
| Base     | 0             | 0%                   | 0%                  |
| Silver   | 1,000         | 25%                  | 25%                 |
| Gold     | 10,000        | 50%                  | 50%                 |
| Platinum | 100,000       | 75%                  | 75%                 |

Thresholds and discounts are illustrative; final values would be set by
governance or protocol parameters.

**Contracts involved:**

- Modify `BasketVault.deposit` and `BasketVault.redeem` to check the
  caller's staked balance and apply a discount.
- Alternatively, a `FeeRouter` wrapper contract that applies tier logic
  before forwarding to the vault.

---

## Idea 5 — Vote-Escrowed Governance (veToken Model)

Long-term alignment via time-locked staking and weighted governance.

**Mechanics:**

- Lock tokens for 1 week to 4 years; receive non-transferable `veTOKEN`
  proportional to lock duration.
- `veTOKEN` weight determines:
  - **Governance votes** — which assets the `OracleAdapter` supports, fee
    parameters, risk limits, treasury spending.
  - **Fee share boost** — longer locks earn a larger share of protocol
    fees.
  - **Emission direction** — holders vote on which baskets receive token
    emission incentives (Curve gauge-style voting).
- Prevents mercenary capital: tokens cannot be bought, voted, and
  immediately dumped.

**Contracts involved:**

- New `VotingEscrow.sol` (ERC20 lock to non-transferable veTOKEN).
- New `GaugeController.sol` for emission allocation votes.
- Modify `OracleAdapter` asset activation to require governance approval.

---

## Idea 6 — Liquidity Mining Emissions

Bootstrap TVL by distributing tokens to basket depositors.

**Mechanics:**

- Protocol emits tokens per block or epoch, split across active baskets.
- Each basket's share of emissions is determined by governance gauge votes
  (Idea 5) or proportional to TVL.
- Depositors earn tokens proportional to their share of the basket,
  claimable periodically.
- Emissions taper over time (halving schedule or fixed total supply with
  a declining emission curve).

**Contracts involved:**

- New `LiquidityMining.sol` — Masterchef-style reward distributor.
- `BasketShareToken` holders register/stake in the mining contract to
  accrue rewards.

---

## Idea 7 — Protocol-Owned Liquidity (Treasury)

The protocol itself becomes a permanent liquidity provider, reducing
dependence on external capital.

**Mechanics:**

- A portion of fee revenue (e.g., 20%) flows to a `Treasury` contract
  that:
  1. Buys back tokens from the open market.
  2. Pairs bought tokens with USDC to seed permanent DEX liquidity
     (TOKEN/USDC pool).
  3. Deposits USDC into well-performing baskets as protocol-owned TVL.
- Treasury actions are governed by `veTOKEN` holders.

---

## Idea 8 — Collateral Augmentation

Allow staked tokens to supplement USDC as basket collateral at a haircut.

**Mechanics:**

- Staked tokens valued at 50% of market price can count toward basket
  NAV.
- If the token price drops below a threshold, excess token collateral is
  liquidated for USDC automatically.
- Creates direct demand: more tokens staked means more capital available
  for perp positions.

**Risk — reflexivity:** a token price drop reduces collateral, which could
trigger liquidations that further depress the token price. Mitigations
include conservative haircuts and hard caps (e.g., max 20% of any
basket's collateral can be token-based). This idea carries the most risk
and should be considered last.

---

## Suggested Implementation Priority

If adopted incrementally, a reasonable ordering from highest to lowest
impact:

1. **Staking Backstop Pool** (Idea 1) — core value proposition: real
   yield plus insurance.
2. **Fee Discount Tiers** (Idea 4) — simplest to build, immediate demand
   driver.
3. **Basket Creator Bonds** (Idea 3) — aligns creator incentives, adds
   trust.
4. **Liquidity Mining** (Idea 6) — bootstraps TVL growth.
5. **Vote-Escrowed Governance** (Idea 5) — decentralizes control as the
   protocol matures.
6. **Redemption Liquidity Buffer** (Idea 2) — solves UX pain point,
   complex but high value.
7. **Protocol-Owned Liquidity** (Idea 7) — long-term sustainability.
8. **Collateral Augmentation** (Idea 8) — powerful but reflexivity risk;
   add last with careful parameters.

---

## Token Supply and Distribution Sketch

Illustrative only. Final numbers require economic modeling.

| Allocation           | Share | Notes                                  |
| -------------------- | ----- | -------------------------------------- |
| Liquidity            | 40%   | DEX pools, mining, protocol-owned liq. |
| Ecosystem            | 35%   | Grants, partnerships, integrations     |
| Team / Contributors  | 15%   | 1-year cliff, 3-year vest             |
| Private Investors    | 10%   | Strategic round participants           |

Total supply would be fixed (e.g., 100M tokens) with no inflation after
the emission schedule completes.

---

## Codebase Integration Points

These are the existing contracts that would need modification if any of
the ideas above are adopted:

- `src/vault/BasketVault.sol` — fee splitting, fee tier discounts on
  `deposit` / `redeem`.
- `src/vault/BasketFactory.sol` — bond requirement for `createBasket`.
- `src/perp/OracleAdapter.sol` — governance-gated `addAsset`.

New contracts that would be introduced:

- `StakingPool`, `FeeDistributor`, `VotingEscrow`, `GaugeController`,
  `LiquidityMining`, `RedemptionReserve`, `BasketBonding`, `Treasury`.

---

> **Next steps:** select which ideas to pursue, conduct economic modeling
> for token supply / emission parameters, and draft formal specifications
> before any implementation begins.
