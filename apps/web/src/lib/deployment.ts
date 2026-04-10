export type DeploymentTarget = "sepolia" | "anvil";

export const DEPLOYMENT_TARGET_STORAGE_KEY = "indexflow:deployment-target";
export const DEFAULT_DEPLOYMENT_TARGET: DeploymentTarget = "sepolia";

export const DEPLOYMENT_CHAIN_ID: Record<DeploymentTarget, number> = {
  sepolia: 11155111,
  anvil: 31337,
};

export function isDeploymentTarget(value: unknown): value is DeploymentTarget {
  return value === "sepolia" || value === "anvil";
}

export function parseDeploymentTarget(value: unknown): DeploymentTarget | null {
  return isDeploymentTarget(value) ? value : null;
}

export function chainIdForDeploymentTarget(target: DeploymentTarget): number {
  return DEPLOYMENT_CHAIN_ID[target];
}

export function deploymentTargetForChainId(chainId: number): DeploymentTarget | null {
  if (chainId === DEPLOYMENT_CHAIN_ID.sepolia) return "sepolia";
  if (chainId === DEPLOYMENT_CHAIN_ID.anvil) return "anvil";
  return null;
}

export function deploymentLabel(target: DeploymentTarget): string {
  return target === "anvil" ? "Anvil (Local)" : "Sepolia";
}

const LOCAL_SUBGRAPH_URL = "http://localhost:8000/subgraphs/name/indexflow-prototype";

/**
 * Returns the subgraph URL for a given target.
 * - e2e test mode: always null (pure RPC, no subgraph dependency).
 * - anvil: local graph-node URL.
 * - sepolia / other: uses NEXT_PUBLIC_SUBGRAPH_URL from env.
 */
export function getSubgraphUrlForTarget(target: DeploymentTarget): string | null {
  if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1") return null;
  if (target === "anvil") return LOCAL_SUBGRAPH_URL;
  const envUrl = process.env.NEXT_PUBLIC_SUBGRAPH_URL?.trim() ?? "";
  return envUrl.length > 0 ? envUrl : null;
}
