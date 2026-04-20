import { getConfiguredSubgraphUrlForTarget } from "@/config/subgraphs";

export type DeploymentTarget = string;
export type ViewMode = "single" | "all";
export type ChainRole = "hub" | "spoke";

export interface ChainConfig {
  chainId: number;
  ccipChainSelector: string;
  role: ChainRole;
  rpcAlias: string;
  mockUsdc: boolean;
}

export type DeploymentConfig = {
  basketFactory: string;
  usdc: string;
  vaultAccounting?: string;
  oracleAdapter?: string;
  perpReader?: string;
  pricingEngine?: string;
  fundingRateManager?: string;
  priceSync?: string;
  gmxVault?: string;
  assetWiring?: string;
  oracleConfigQuorum?: string;
  stateRelay?: string;
};

export const DEPLOYMENT_TARGET_STORAGE_KEY = "indexflow:deployment-target";
export const VIEW_MODE_STORAGE_KEY = "indexflow:view-mode";
export const DEFAULT_DEPLOYMENT_TARGET: DeploymentTarget = "sepolia";

// Built from config/chains.json – add entries here when new chains are onboarded.
const CHAINS_JSON: Record<string, ChainConfig> = {
  sepolia: { chainId: 11155111, ccipChainSelector: "16015286601757825753", role: "hub", rpcAlias: "sepolia", mockUsdc: true },
  fuji: { chainId: 43113, ccipChainSelector: "14767482510784806043", role: "spoke", rpcAlias: "fuji", mockUsdc: true },
  "arbitrum-sepolia": { chainId: 421614, ccipChainSelector: "3478487238524512106", role: "spoke", rpcAlias: "arbitrum_sepolia", mockUsdc: true },
};

export const CHAIN_REGISTRY: Record<string, ChainConfig> = {
  ...CHAINS_JSON,
  arbitrum: { chainId: 42161, ccipChainSelector: "0", role: "hub", rpcAlias: "arbitrum", mockUsdc: false },
};

const CHAIN_LABELS: Record<string, string> = {
  sepolia: "Sepolia",
  fuji: "Avalanche Fuji",
  "arbitrum-sepolia": "Arbitrum Sepolia",
  arbitrum: "Arbitrum",
};

export const DEPLOYMENT_CHAIN_ID: Record<string, number> = Object.fromEntries(
  Object.entries(CHAIN_REGISTRY).map(([k, v]) => [k, v.chainId]),
);

export function isDeploymentTarget(value: unknown): value is DeploymentTarget {
  return typeof value === "string" && value in CHAIN_REGISTRY;
}

export function parseDeploymentTarget(
  value: unknown,
): DeploymentTarget | null {
  return isDeploymentTarget(value) ? value : null;
}

export function chainIdForDeploymentTarget(target: DeploymentTarget): number {
  return DEPLOYMENT_CHAIN_ID[target] ?? 0;
}

export function deploymentTargetForChainId(
  chainId: number,
): DeploymentTarget | null {
  for (const [target, id] of Object.entries(DEPLOYMENT_CHAIN_ID)) {
    if (id === chainId) return target;
  }
  return null;
}

export function deploymentLabel(target: DeploymentTarget): string {
  return CHAIN_LABELS[target] ?? target;
}

export function isHubChain(target: string): boolean {
  return CHAIN_REGISTRY[target]?.role === "hub";
}

export function isSpokeChain(target: string): boolean {
  return CHAIN_REGISTRY[target]?.role === "spoke";
}

export function getChainRole(target: string): ChainRole | undefined {
  return CHAIN_REGISTRY[target]?.role;
}

/**
 * Returns the subgraph URL for a given target.
 * - e2e test mode: always null (pure RPC, no subgraph dependency).
 * - runtime: reads per-chain URLs from `src/config/subgraphs.json`.
 */
export function getSubgraphUrlForTarget(
  target: DeploymentTarget,
): string | null {
  if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1") return null;
  return getConfiguredSubgraphUrlForTarget(target);
}

export function isValidViewMode(value: unknown): value is ViewMode {
  return value === "single" || value === "all";
}
