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
export declare function computeRoutingWeights(reserves: ChainReserve[]): ChainWeight[];
//# sourceMappingURL=computeRoutingWeights.d.ts.map