export const TOOLTIP_COPY = {
  // Shared table-like headers
  tableName: "Basket display name used across portfolio, admin, and trading views.",
  tableTvl: "Total basket value: idle USDC plus capital currently allocated to perps.",
  tableAssets: "Number of configured assets mapped into this basket strategy.",
  tablePerp: "USDC currently routed from the basket into the perp accounting layer.",
  tableBlend: "Share of basket exposure attributed to perp activity, shown in basis points.",
  tableAddress: "Onchain vault contract address for this basket.",

  // Core metrics
  tvl: "Total value locked, combining idle vault funds and perp-allocated capital.",
  activeBaskets: "Count of basket vaults currently tracked by the app and backend reads.",
  vaultsTracked: "Number of vaults indexed from the factory for monitoring and analytics.",
  aggregateTvl: "Sum of TVL across all tracked baskets.",
  totalTvl: "Aggregate total value locked across all baskets in this environment.",
  perpAllocated: "Capital currently allocated from baskets into the shared perp sleeve.",
  totalShares: "Total basket share token supply currently minted.",
  positions: "Open perp positions currently tracked for this vault.",
  depositedCapital: "Net capital deposited from basket vault into the perp accounting system.",
  openInterest: "Current notional exposure of active perp positions for the vault.",
  realisedPnl: "PnL already realized from closed or partially closed positions.",

  // Fees and reserve policy
  depositFee: "Fee applied when users deposit USDC into the basket vault.",
  redeemFee: "Fee applied when users redeem basket shares back to USDC.",
  reserveTarget: "Configured minimum reserve policy for idle liquidity, in basis points.",
  targetReserve: "Configured reserve target percentage that should remain liquid in the vault.",
  requiredReserve: "Minimum USDC reserve required to satisfy the current reserve policy.",
  idleUsdcExFees: "Idle USDC available in the vault after excluding accrued protocol fees.",
  availableForPerp: "USDC headroom that can be allocated to perp trading without breaking reserve targets.",
  reserveStatus: "Health indicator comparing idle liquidity against required reserve policy.",

  // Admin and operations headings
  quickActions: "Shortcuts to high-impact admin workflows for basket, pool, oracle, and docs operations.",
  largestBaskets: "Top baskets ranked by TVL for a quick concentration snapshot.",
  holdings: "Wallet positions across basket share tokens and their current estimated values.",
  vaultHistory: "Recent onchain vault actions including deposits, redemptions, allocations, and position events.",
  perpDrivenComposition: "Exposure breakdown showing how perp positions influence basket composition.",
  perpExposure: "Aggregate perp sleeve exposure derived from current position notional.",
  owner: "Current owner account with authority over funding manager admin functions.",
  fundingInterval: "Interval in seconds used to pace funding-rate updates.",
  defaultFactors: "Default base and max funding factors used when asset-specific overrides are absent.",
  ownership: "Controls for transferring funding manager ownership to a new admin account.",
  keeperManagement: "Allowlist management for keeper addresses that can perform funding updates.",
  globalFundingSettings: "Global defaults and timing settings applied to funding updates.",
  keeperRateUpdate: "Manual call surface for keeper-style funding factor updates.",
  perAssetFundingConfiguration: "Asset-level funding curve parameters and token mapping controls.",
  poolAmount: "Total token liquidity currently present in the selected GMX pool.",
  reservedAmount: "Portion of pool liquidity reserved by existing open positions.",
  globalShortSize: "Aggregate short-side notional currently open against this pool.",
  guaranteedUsd: "Guaranteed USD accounting value tracked by the GMX vault.",
  poolDetails: "Health snapshot for utilization and liquidity pressure in the shared pool.",
  poolControls: "Operator and gov controls for buffer policy and direct pool top-ups.",
  setBufferAmount: "Gov-only action to set the minimum liquidity buffer retained for a token.",
  directPoolDeposit: "Non-dilutive liquidity top-up flow into the shared GMX pool.",
  systemStatus: "Global pause state for risk-critical trading and capital operations.",
  basketsWithCaps: "Number of baskets currently shown in per-vault risk cap management.",
  vaultRegistration: "Whether vaults are registered and eligible for position operations.",
  perVaultRiskLimits: "Per-vault caps for open interest and maximum single position size.",
  manualVaultRegistrationCheck: "Direct lookup and registration controls for a specific vault address.",
  maxOpenInterest: "Upper bound on total open interest allowed for a vault.",
  maxPositionSize: "Upper bound on any individual position size for a vault.",
  createNewBasket: "Create a new basket vault with configured name and entry/exit fees.",
  setAssets: "Define which supported oracle assets this basket can trade.",
  perpAllocation: "Move capital between idle vault liquidity and the perp sleeve.",
  maxPerpAllocation: "Cap the maximum capital that can be allocated to perps for this basket.",
  collectFees: "Transfer accumulated basket fees to a designated recipient address.",
  reservePolicy: "Configure the target reserve ratio that protects redemption liquidity.",
  topUpReserve: "Add USDC directly to basket reserve without minting new shares.",
  perpPositionManagement: "Open and close perp positions with vault-level limits and available collateral checks.",
} as const;

export type TooltipKey = keyof typeof TOOLTIP_COPY;

export function getTooltipCopy(key: TooltipKey): string {
  return TOOLTIP_COPY[key];
}
