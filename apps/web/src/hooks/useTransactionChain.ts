"use client";

import { useChainId } from "wagmi";
import { deploymentTargetForChainId } from "@/lib/deployment";
import { isDeploymentConfigured } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";

/**
 * In "all chains" mode, resolves the wallet's current chain for transaction routing.
 * Returns whether the wallet is on a supported/configured chain and which one.
 */
export function useTransactionChain() {
  const walletChainId = useChainId();
  const { viewMode, target } = useDeploymentTarget();

  if (viewMode === "single") {
    return {
      canTransact: true,
      walletChainId,
      walletTarget: target,
    };
  }

  const walletTarget = deploymentTargetForChainId(walletChainId);
  const canTransact = walletTarget !== null && isDeploymentConfigured(walletTarget);

  return {
    canTransact,
    walletChainId,
    walletTarget,
  };
}
