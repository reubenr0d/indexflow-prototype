"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { defaultConfig } from "@/config/wagmi";
import { privyAppId, privyConfig } from "@/config/privy";
import { useAutoSwitchChain } from "@/hooks/useAutoSwitchChain";
import { queryClient } from "@/providers/query-client";

function AutoSwitchWalletToDeploymentChain() {
  useAutoSwitchChain();
  return null;
}

export default function PrivyWeb3ProviderInner({ children }: { children: React.ReactNode }) {
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
