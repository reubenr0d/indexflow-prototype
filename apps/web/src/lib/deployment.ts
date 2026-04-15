export type DeploymentTarget = "sepolia" | "anvil" | "arbitrum-sepolia" | "arbitrum";

export const DEPLOYMENT_TARGET_STORAGE_KEY = "indexflow:deployment-target";
export const DEFAULT_DEPLOYMENT_TARGET: DeploymentTarget = "sepolia";

export const DEPLOYMENT_CHAIN_ID: Record<DeploymentTarget, number> = {
  sepolia: 11155111,
  anvil: 31337,
  "arbitrum-sepolia": 421614,
  arbitrum: 42161,
};

export function isDeploymentTarget(value: unknown): value is DeploymentTarget {
  return (
    value === "sepolia" ||
    value === "anvil" ||
    value === "arbitrum-sepolia" ||
    value === "arbitrum"
  );
}

export function parseDeploymentTarget(
  value: unknown,
): DeploymentTarget | null {
  return isDeploymentTarget(value) ? value : null;
}

export function chainIdForDeploymentTarget(target: DeploymentTarget): number {
  return DEPLOYMENT_CHAIN_ID[target];
}

export function deploymentTargetForChainId(
  chainId: number,
): DeploymentTarget | null {
  for (const [target, id] of Object.entries(DEPLOYMENT_CHAIN_ID)) {
    if (id === chainId) return target as DeploymentTarget;
  }
  return null;
}

export function deploymentLabel(target: DeploymentTarget): string {
  const labels: Record<DeploymentTarget, string> = {
    anvil: "Anvil (Local)",
    sepolia: "Sepolia",
    "arbitrum-sepolia": "Arbitrum Sepolia",
    arbitrum: "Arbitrum",
  };
  return labels[target];
}

const LOCAL_SUBGRAPH_URL =
  "http://localhost:8000/subgraphs/name/indexflow-prototype";

/**
 * Returns the subgraph URL for a given target.
 * - e2e test mode: always null (pure RPC, no subgraph dependency).
 * - anvil: local graph-node URL.
 * - sepolia / other: uses NEXT_PUBLIC_SUBGRAPH_URL from env.
 */
export function getSubgraphUrlForTarget(
  target: DeploymentTarget,
): string | null {
  if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1") return null;
  if (target === "anvil") return LOCAL_SUBGRAPH_URL;
  const envUrl = process.env.NEXT_PUBLIC_SUBGRAPH_URL?.trim() ?? "";
  return envUrl.length > 0 ? envUrl : null;
}
