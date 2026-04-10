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

export function isSubgraphEnabledForTarget(
  _target: DeploymentTarget,
  subgraphUrl: string | null | undefined
): boolean {
  const trimmed = subgraphUrl?.trim() ?? "";
  return trimmed.length > 0;
}
