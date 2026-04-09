"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  chainIdForDeploymentTarget,
  DEFAULT_DEPLOYMENT_TARGET,
  DEPLOYMENT_TARGET_STORAGE_KEY,
  isSubgraphEnabledForTarget,
  parseDeploymentTarget,
  type DeploymentTarget,
} from "@/lib/deployment";

type DeploymentContextValue = {
  target: DeploymentTarget;
  setTarget: (target: DeploymentTarget) => void;
  chainId: number;
  isSubgraphEnabled: boolean;
  canSwitchTarget: boolean;
};

const DeploymentContext = createContext<DeploymentContextValue | null>(null);
const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
const subgraphUrl = process.env.NEXT_PUBLIC_SUBGRAPH_URL;

function readInitialTarget(): DeploymentTarget {
  if (typeof window === "undefined") {
    return isE2ETestMode ? "anvil" : DEFAULT_DEPLOYMENT_TARGET;
  }
  if (isE2ETestMode) return "anvil";
  const stored = parseDeploymentTarget(localStorage.getItem(DEPLOYMENT_TARGET_STORAGE_KEY));
  return stored ?? DEFAULT_DEPLOYMENT_TARGET;
}

export function DeploymentProvider({ children }: { children: React.ReactNode }) {
  const [target, setTargetState] = useState<DeploymentTarget>(readInitialTarget);

  const setTarget = useCallback((nextTarget: DeploymentTarget) => {
    if (isE2ETestMode) return;
    setTargetState(nextTarget);
  }, []);

  useEffect(() => {
    if (isE2ETestMode) return;
    localStorage.setItem(DEPLOYMENT_TARGET_STORAGE_KEY, target);
  }, [target]);

  const value = useMemo<DeploymentContextValue>(() => {
    const effectiveTarget = isE2ETestMode ? "anvil" : target;
    return {
      target: effectiveTarget,
      setTarget,
      chainId: chainIdForDeploymentTarget(effectiveTarget),
      isSubgraphEnabled: isSubgraphEnabledForTarget(effectiveTarget, subgraphUrl),
      canSwitchTarget: !isE2ETestMode,
    };
  }, [setTarget, target]);

  return <DeploymentContext.Provider value={value}>{children}</DeploymentContext.Provider>;
}

export function useDeploymentTarget(): DeploymentContextValue {
  const value = useContext(DeploymentContext);
  if (!value) {
    throw new Error("useDeploymentTarget must be used within DeploymentProvider");
  }
  return value;
}
