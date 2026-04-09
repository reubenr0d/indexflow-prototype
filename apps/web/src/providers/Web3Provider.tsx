"use client";

import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider, useAccount, useChainId, useSwitchChain } from "wagmi";
import { connect as connectAction } from "wagmi/actions";
import { showToast } from "@/components/ui/toast";
import { deploymentLabel, deploymentTargetForChainId } from "@/lib/deployment";
import { config } from "@/config/wagmi";
import { DeploymentProvider, useDeploymentTarget } from "@/providers/DeploymentProvider";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();
const MM_SWITCH_COOLDOWN_MS = 30_000;
const MM_SWITCH_COOLDOWN_KEY = "indexflow:mm-switch-deployment-cooldown-until";
const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";

const rkTheme = {
  lightMode: lightTheme({
    accentColor: "#0d9488",
    accentColorForeground: "#ffffff",
    borderRadius: "medium",
    fontStack: "system",
  }),
  darkMode: darkTheme({
    accentColor: "#2dd4bf",
    accentColorForeground: "#04120f",
    borderRadius: "medium",
    fontStack: "system",
  }),
};

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

function AutoSwitchMetaMaskToDeploymentChain() {
  const { isConnected, connector, address } = useAccount();
  const walletChainId = useChainId();
  const { chainId: targetChainId, target, setTarget } = useDeploymentTarget();
  const { switchChainAsync } = useSwitchChain();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (isE2ETestMode) return;
    if (!isConnected) return;
    if (connector?.id !== "metaMask") return;
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
          `Wrong MetaMask network. Please switch to ${deploymentLabel(target)} to continue.`
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

function Web3ProviderInner({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme} modalSize="compact">
          <AutoConnectE2EWallet />
          <AutoSwitchMetaMaskToDeploymentChain />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <DeploymentProvider>
      <Web3ProviderInner>{children}</Web3ProviderInner>
    </DeploymentProvider>
  );
}
