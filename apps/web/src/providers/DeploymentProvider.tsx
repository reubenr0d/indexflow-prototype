"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  chainIdForDeploymentTarget,
  DEFAULT_DEPLOYMENT_TARGET,
  DEPLOYMENT_TARGET_STORAGE_KEY,
  VIEW_MODE_STORAGE_KEY,
  getSubgraphUrlForTarget,
  isValidViewMode,
  parseDeploymentTarget,
  type DeploymentTarget,
  type ViewMode,
} from "@/lib/deployment";
import { CONFIGURED_DEPLOYMENT_TARGETS } from "@/config/contracts";

type DeploymentContextValue = {
  target: DeploymentTarget;
  setTarget: (target: DeploymentTarget) => void;
  chainId: number;
  isSubgraphEnabled: boolean;
  subgraphUrl: string | null;
  canSwitchTarget: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  configuredTargets: DeploymentTarget[];
};

const DeploymentContext = createContext<DeploymentContextValue | null>(null);
const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";

/** SSR + first client paint must match; persist restore runs in useEffect. */
function ssrSafeInitialTarget(): DeploymentTarget {
  return DEFAULT_DEPLOYMENT_TARGET;
}

function readStoredTargetFromBrowser(): DeploymentTarget {
  if (isE2ETestMode) return DEFAULT_DEPLOYMENT_TARGET;
  const stored = parseDeploymentTarget(localStorage.getItem(DEPLOYMENT_TARGET_STORAGE_KEY));
  return stored ?? DEFAULT_DEPLOYMENT_TARGET;
}

function readStoredViewModeFromBrowser(): ViewMode {
  if (isE2ETestMode) return "single";
  const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return isValidViewMode(stored) ? stored : "single";
}

export function DeploymentProvider({ children }: { children: React.ReactNode }) {
  const [target, setTargetState] = useState<DeploymentTarget>(ssrSafeInitialTarget);
  const [viewMode, setViewModeState] = useState<ViewMode>("single");
  const [hasRestoredPreferences, setHasRestoredPreferences] = useState(false);

  const setTarget = useCallback((nextTarget: DeploymentTarget) => {
    if (isE2ETestMode) return;
    setTargetState(nextTarget);
    setViewModeState("single");
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    if (isE2ETestMode) return;
    setViewModeState(mode);
  }, []);

  useEffect(() => {
    setTargetState(readStoredTargetFromBrowser());
    setViewModeState(readStoredViewModeFromBrowser());
    setHasRestoredPreferences(true);
  }, []);

  useEffect(() => {
    if (isE2ETestMode || !hasRestoredPreferences) return;
    localStorage.setItem(DEPLOYMENT_TARGET_STORAGE_KEY, target);
  }, [target, hasRestoredPreferences]);

  useEffect(() => {
    if (isE2ETestMode || !hasRestoredPreferences) return;
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode, hasRestoredPreferences]);

  const value = useMemo<DeploymentContextValue>(() => {
    const url = getSubgraphUrlForTarget(target);
    const anySubgraph = viewMode === "all"
      ? CONFIGURED_DEPLOYMENT_TARGETS.some((t) => getSubgraphUrlForTarget(t) !== null)
      : url !== null;
    return {
      target,
      setTarget,
      chainId: chainIdForDeploymentTarget(target),
      isSubgraphEnabled: anySubgraph,
      subgraphUrl: viewMode === "all" ? null : url,
      canSwitchTarget: !isE2ETestMode,
      viewMode: isE2ETestMode ? "single" : viewMode,
      setViewMode,
      configuredTargets: CONFIGURED_DEPLOYMENT_TARGETS,
    };
  }, [setTarget, setViewMode, target, viewMode]);

  return <DeploymentContext.Provider value={value}>{children}</DeploymentContext.Provider>;
}

export function useDeploymentTarget(): DeploymentContextValue {
  const value = useContext(DeploymentContext);
  if (!value) {
    throw new Error("useDeploymentTarget must be used within DeploymentProvider");
  }
  return value;
}
