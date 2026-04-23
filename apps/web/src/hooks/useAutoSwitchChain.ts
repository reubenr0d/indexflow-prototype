"use client";

import { useEffect, useRef } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { showToast } from "@/components/ui/toast";
import { deploymentLabel } from "@/lib/deployment";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";

const COOLDOWN_MS = 30_000;
const COOLDOWN_KEY = "indexflow:mm-switch-deployment-cooldown-until";

function getCooldownUntil(): number {
  if (typeof window === "undefined") return 0;
  const value = window.sessionStorage.getItem(COOLDOWN_KEY);
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function setCooldownUntil(until: number) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(COOLDOWN_KEY, String(until));
}

/**
 * Keeps the connected wallet on the deployment target chain.
 * Works with both Privy and plain Wagmi providers.
 */
export function useAutoSwitchChain() {
  const { isConnected, connector, address } = useAccount();
  const walletChainId = useChainId();
  const { chainId: targetChainId, target, viewMode } = useDeploymentTarget();
  const { switchChainAsync } = useSwitchChain();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1") return;
    if (!isConnected) return;
    if (viewMode === "all") return;

    if (walletChainId === targetChainId) {
      setCooldownUntil(0);
      return;
    }
    if (!switchChainAsync || inFlightRef.current) return;

    const now = Date.now();
    if (now < getCooldownUntil()) return;

    inFlightRef.current = true;
    setCooldownUntil(now + COOLDOWN_MS);

    switchChainAsync({ chainId: targetChainId })
      .then(() => {
        setCooldownUntil(0);
        showToast("success", `Switched network to ${deploymentLabel(target)}`);
      })
      .catch(() => {
        showToast(
          "error",
          `Wrong network. Please switch to ${deploymentLabel(target)} to continue.`
        );
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [address, connector?.id, isConnected, switchChainAsync, target, targetChainId, viewMode, walletChainId]);
}
