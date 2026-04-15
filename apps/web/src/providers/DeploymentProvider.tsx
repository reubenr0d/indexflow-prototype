"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  chainIdForDeploymentTarget,
  DEFAULT_DEPLOYMENT_TARGET,
  DEPLOYMENT_TARGET_STORAGE_KEY,
  getSubgraphUrlForTarget,
  parseDeploymentTarget,
  type DeploymentTarget,
} from "@/lib/deployment";
import { isAnvilEnabled, registerDevCommands } from "@/lib/dev-mode";

type DeploymentContextValue = {
  target: DeploymentTarget;
  setTarget: (target: DeploymentTarget) => void;
  chainId: number;
  isSubgraphEnabled: boolean;
  subgraphUrl: string | null;
  canSwitchTarget: boolean;
};

const DeploymentContext = createContext<DeploymentContextValue | null>(null);
const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";

function readInitialTarget(): DeploymentTarget {
  if (typeof window === "undefined") {
    return isE2ETestMode ? "anvil" : DEFAULT_DEPLOYMENT_TARGET;
  }
  if (isE2ETestMode) return "anvil";
  const stored = parseDeploymentTarget(localStorage.getItem(DEPLOYMENT_TARGET_STORAGE_KEY));
  if (stored === "anvil" && !isAnvilEnabled()) return DEFAULT_DEPLOYMENT_TARGET;
  return stored ?? DEFAULT_DEPLOYMENT_TARGET;
}

export function DeploymentProvider({ children }: { children: React.ReactNode }) {
  const [target, setTargetState] = useState<DeploymentTarget>(readInitialTarget);

  const setTarget = useCallback((nextTarget: DeploymentTarget) => {
    if (isE2ETestMode) return;
    setTargetState(nextTarget);
  }, []);

  useEffect(() => {
    registerDevCommands();
  }, []);

  useEffect(() => {
    if (isE2ETestMode) return;
    localStorage.setItem(DEPLOYMENT_TARGET_STORAGE_KEY, target);
  }, [target]);

  const value = useMemo<DeploymentContextValue>(() => {
    const effectiveTarget = isE2ETestMode ? "anvil" : target;
    const url = getSubgraphUrlForTarget(effectiveTarget);
    return {
      target: effectiveTarget,
      setTarget,
      chainId: chainIdForDeploymentTarget(effectiveTarget),
      isSubgraphEnabled: url !== null,
      subgraphUrl: url,
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
