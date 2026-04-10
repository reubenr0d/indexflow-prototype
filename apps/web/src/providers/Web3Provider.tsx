"use client";

import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { WagmiProvider as WagmiProviderNative } from "wagmi";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { connect as connectAction } from "wagmi/actions";
import { showToast } from "@/components/ui/toast";
import { deploymentLabel, deploymentTargetForChainId } from "@/lib/deployment";
import { config, defaultConfig } from "@/config/wagmi";
import { privyAppId, privyConfig } from "@/config/privy";
import { DeploymentProvider, useDeploymentTarget } from "@/providers/DeploymentProvider";

const queryClient = new QueryClient();
const MM_SWITCH_COOLDOWN_MS = 30_000;
const MM_SWITCH_COOLDOWN_KEY = "indexflow:mm-switch-deployment-cooldown-until";
const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
const hasPrivyAppId = privyAppId.length > 0;

function getCooldownUntil(): number {
  if (typeof window === "undefined") return 0;
  const value = window.sessionStorage.getItem(MM_SWITCH_COOLDOWN_KEY);
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function setCooldownUntil(until: number) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(MM_SWITCH_COOLDOWN_KEY, String(until));
}

function AutoSwitchWalletToDeploymentChain() {
  const { isConnected, connector, address } = useAccount();
  const walletChainId = useChainId();
  const { chainId: targetChainId, target, setTarget } = useDeploymentTarget();
  const { switchChainAsync } = useSwitchChain();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (isE2ETestMode) return;
    if (!isConnected) return;

    const mappedTarget = deploymentTargetForChainId(walletChainId);
    if (mappedTarget && mappedTarget !== target) {
      setTarget(mappedTarget);
      setCooldownUntil(0);
      return;
    }
    if (walletChainId === targetChainId) {
      setCooldownUntil(0);
      return;
    }
    if (!switchChainAsync || inFlightRef.current) return;

    const now = Date.now();
    if (now < getCooldownUntil()) return;

    inFlightRef.current = true;
    setCooldownUntil(now + MM_SWITCH_COOLDOWN_MS);

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
  }, [address, connector?.id, isConnected, setTarget, switchChainAsync, target, targetChainId, walletChainId]);

  return null;
}

function AutoConnectE2EWallet() {
  const { isConnected } = useAccount();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!isE2ETestMode) return;
    if (isConnected || inFlightRef.current) return;

    const connector = config.connectors[0];
    if (!connector) return;

    inFlightRef.current = true;
    connectAction(config, { connector })
      .catch(() => {})
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [isConnected]);

  return null;
}

function PrivyWeb3ProviderInner({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={defaultConfig}>
          <AutoSwitchWalletToDeploymentChain />
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

function FallbackWeb3ProviderInner({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProviderNative config={config}>
      <QueryClientProvider client={queryClient}>
        {isE2ETestMode && <AutoConnectE2EWallet />}
        {children}
      </QueryClientProvider>
    </WagmiProviderNative>
  );
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <DeploymentProvider>
      {hasPrivyAppId ? (
        <PrivyWeb3ProviderInner>{children}</PrivyWeb3ProviderInner>
      ) : (
        <FallbackWeb3ProviderInner>{children}</FallbackWeb3ProviderInner>
      )}
    </DeploymentProvider>
  );
}
