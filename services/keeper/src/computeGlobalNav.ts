/**
 * Compute per-chain PnL adjustments so spoke chains reflect the hub's
 * perp PnL in their share pricing.
 *
 * The hub reads local PnL directly from VaultAccounting, so its
 * adjustment is always 0. Each spoke receives its pro-rata share of
 * the hub's total PnL (unrealised + realised), proportional to the
 * spoke's deposits relative to total cross-chain deposits.
 */

export interface ChainDeposits {
  chainSelector: bigint;
  idleUsdc: bigint;
  /** True for the hub chain (e.g. Sepolia). */
  isHub: boolean;
}

export interface PnLAdjustment {
  chainSelector: bigint;
  /** Signed, 6-decimal USDC-scale adjustment. */
  pnlAdjustment: bigint;
}

/**
 * @param chains Per-chain deposit info.
 * @param hubPerpAllocated Capital allocated to perp positions on the hub (6 dec).
 * @param hubPnL Total hub PnL = unrealised + realised from VaultAccounting (6 dec, signed).
 * @returns Per-chain pnlAdjustment values for StateRelay.updateState.
 */
export function computeGlobalNav(
  chains: ChainDeposits[],
  _hubPerpAllocated: bigint,
  hubPnL: bigint,
): PnLAdjustment[] {
  if (chains.length === 0) return [];

  const totalDeposits = chains.reduce((sum, c) => sum + c.idleUsdc, 0n);

  return chains.map((chain) => {
    if (chain.isHub) {
      return { chainSelector: chain.chainSelector, pnlAdjustment: 0n };
    }

    if (totalDeposits === 0n) {
      return { chainSelector: chain.chainSelector, pnlAdjustment: 0n };
    }

    // spoke share = spokeDeposits / totalDeposits * hubPnL
    const pnlAdjustment = (chain.idleUsdc * hubPnL) / totalDeposits;

    return { chainSelector: chain.chainSelector, pnlAdjustment };
  });
}
