/**
 * Compute deposit routing weights inversely proportional to idle USDC.
 *
 * Chains with less idle capital receive higher weight so new deposits
 * are steered toward under-funded spokes, balancing liquidity across
 * the network.
 */

export interface ChainReserve {
  chainSelector: bigint;
  idleUsdc: bigint;
}

export interface ChainWeight {
  chainSelector: bigint;
  weightBps: bigint;
}

const BPS = 10_000n;

/**
 * @param reserves Per-chain idle USDC balances (6-decimal token units).
 * @returns Per-chain routing weights in basis points summing to 10 000.
 *
 * Weight is inverse-proportional: chains with *less* idle USDC get a
 * *higher* weight to attract deposits toward capacity gaps.
 *
 * Edge cases:
 *  - Empty input → empty output
 *  - Single chain → 10 000 bps
 *  - All chains at zero idle → equal split
 */
export function computeRoutingWeights(reserves: ChainReserve[]): ChainWeight[] {
  if (reserves.length === 0) return [];
  if (reserves.length === 1) {
    return [{ chainSelector: reserves[0].chainSelector, weightBps: BPS }];
  }

  const totalIdle = reserves.reduce((sum, r) => sum + r.idleUsdc, 0n);

  if (totalIdle === 0n) {
    return equalSplit(reserves);
  }

  // Inverse weight: each chain's inverse contribution is (total - own) / total.
  // Normalised to BPS.
  const inverses = reserves.map((r) => totalIdle - r.idleUsdc);
  const inverseSum = inverses.reduce((s, v) => s + v, 0n);

  if (inverseSum === 0n) {
    return equalSplit(reserves);
  }

  const weights: ChainWeight[] = [];
  let assigned = 0n;

  for (let i = 0; i < reserves.length; i++) {
    const isLast = i === reserves.length - 1;
    const w = isLast ? BPS - assigned : (inverses[i] * BPS) / inverseSum;
    assigned += w;
    weights.push({ chainSelector: reserves[i].chainSelector, weightBps: w });
  }

  return weights;
}

function equalSplit(reserves: ChainReserve[]): ChainWeight[] {
  const n = BigInt(reserves.length);
  const base = BPS / n;
  const weights: ChainWeight[] = [];
  let assigned = 0n;

  for (let i = 0; i < reserves.length; i++) {
    const isLast = i === reserves.length - 1;
    const w = isLast ? BPS - assigned : base;
    assigned += w;
    weights.push({ chainSelector: reserves[i].chainSelector, weightBps: w });
  }

  return weights;
}
