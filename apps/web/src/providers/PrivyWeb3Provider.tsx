"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { createConfig as createPrivyConfig } from "@privy-io/wagmi";
import { WagmiProvider } from "@privy-io/wagmi";
import { http } from "wagmi";
import { sepolia, arbitrumSepolia, arbitrum, avalancheFuji } from "@/config/wagmi";
import { privyAppId, privyConfig } from "@/config/privy";
import { useAutoSwitchChain } from "@/hooks/useAutoSwitchChain";
import { queryClient } from "@/providers/query-client";

const privyWagmiConfig = createPrivyConfig({
  chains: [sepolia, arbitrumSepolia, arbitrum, avalancheFuji],
  transports: {
    [sepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [arbitrum.id]: http(),
    [avalancheFuji.id]: http(),
  },
  multiInjectedProviderDiscovery: false,
  ssr: true,
});

function AutoSwitchWalletToDeploymentChain() {
  useAutoSwitchChain();
  return null;
}

export default function PrivyWeb3ProviderInner({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={privyWagmiConfig}>
          <AutoSwitchWalletToDeploymentChain />
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
