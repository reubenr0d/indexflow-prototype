"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { createConfig as createPrivyConfig } from "@privy-io/wagmi";
import { WagmiProvider } from "@privy-io/wagmi";
import { http } from "wagmi";
import { sepolia, arbitrumSepolia, arbitrum, anvil, avalancheFuji } from "@/config/wagmi";
import { privyAppId, privyConfig } from "@/config/privy";
import { useAutoSwitchChain } from "@/hooks/useAutoSwitchChain";
import { queryClient } from "@/providers/query-client";
import { isAnvilEnabled } from "@/lib/dev-mode";

const includeAnvil =
  process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1" || isAnvilEnabled();

const privyWagmiConfig = includeAnvil
  ? createPrivyConfig({
      chains: [sepolia, anvil, arbitrumSepolia, arbitrum, avalancheFuji],
      transports: {
        [sepolia.id]: http(),
        [anvil.id]: http("http://127.0.0.1:8545"),
        [arbitrumSepolia.id]: http(),
        [arbitrum.id]: http(),
        [avalancheFuji.id]: http(),
      },
      multiInjectedProviderDiscovery: false,
      ssr: true,
    })
  : createPrivyConfig({
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
