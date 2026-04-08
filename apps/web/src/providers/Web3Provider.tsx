"use client";

import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider, useAccount, useChainId, useSwitchChain } from "wagmi";
import { connect as connectAction } from "wagmi/actions";
import { sepolia } from "wagmi/chains";
import { showToast } from "@/components/ui/toast";
import { config } from "@/config/wagmi";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();
const MM_SWITCH_COOLDOWN_MS = 30_000;
const MM_SWITCH_COOLDOWN_KEY = "indexflow:mm-switch-sepolia-cooldown-until";
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

function AutoSwitchMetaMaskToSepolia() {
  const { isConnected, connector, address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (isE2ETestMode) return;
    if (!isConnected) return;
    if (connector?.id !== "metaMask") return;
    if (chainId === sepolia.id) {
      setCooldownUntil(0);
      return;
    }
    if (!switchChainAsync || inFlightRef.current) return;

    const now = Date.now();
    if (now < getCooldownUntil()) return;

    inFlightRef.current = true;
    setCooldownUntil(now + MM_SWITCH_COOLDOWN_MS);

    switchChainAsync({ chainId: sepolia.id })
      .then(() => {
        setCooldownUntil(0);
        showToast("success", "Switched network to Sepolia");
      })
      .catch(() => {
        showToast(
          "error",
          "Wrong MetaMask network. Please switch to Sepolia to continue."
        );
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [address, chainId, connector?.id, isConnected, switchChainAsync]);

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

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme} modalSize="compact">
          <AutoConnectE2EWallet />
          <AutoSwitchMetaMaskToSepolia />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
