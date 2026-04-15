"use client";

import { useEffect, useRef } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider as WagmiProviderNative } from "wagmi";
import { useAccount } from "wagmi";
import { connect as connectAction } from "wagmi/actions";
import { config } from "@/config/wagmi";
import { privyAppId } from "@/config/privy";
import { DeploymentProvider } from "@/providers/DeploymentProvider";
import { useAutoSwitchChain } from "@/hooks/useAutoSwitchChain";
import { queryClient } from "@/providers/query-client";
import dynamic from "next/dynamic";

const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
const hasPrivyAppId = privyAppId.length > 0;

const PrivyWeb3ProviderInner = dynamic(
  () => import("@/providers/PrivyWeb3Provider"),
  { ssr: false },
);

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

function AutoSwitchFallbackChain() {
  useAutoSwitchChain();
  return null;
}

function FallbackWeb3ProviderInner({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProviderNative config={config}>
      <QueryClientProvider client={queryClient}>
        {isE2ETestMode && <AutoConnectE2EWallet />}
        <AutoSwitchFallbackChain />
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
