"use client";

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { createConfig as createPrivyConfig, useSetActiveWallet } from "@privy-io/wagmi";
import { WagmiProvider } from "@privy-io/wagmi";
import { useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { http } from "wagmi";
import { useAccount } from "wagmi";
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

function AutoSelectPrivyWallet() {
  const { ready, authenticated } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { address } = useAccount();
  const { setActiveWallet } = useSetActiveWallet();
  const { createWallet } = useCreateWallet();

  useEffect(() => {
    if (!ready || !authenticated || !walletsReady) return;
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    if (!embedded) {
      createWallet().catch(() => {});
      return;
    }
    if (address) return;
    setActiveWallet(embedded).catch(() => {});
  }, [address, authenticated, createWallet, ready, setActiveWallet, wallets, walletsReady]);

  return null;
}

export default function PrivyWeb3ProviderInner({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <SmartWalletsProvider>
        <QueryClientProvider client={queryClient}>
          <WagmiProvider
            config={privyWagmiConfig}
            setActiveWalletForWagmi={({ wallets }) =>
              wallets.find((wallet) => wallet.walletClientType === "privy") ?? wallets[0]
            }
          >
            <AutoSelectPrivyWallet />
            <AutoSwitchWalletToDeploymentChain />
            {children}
          </WagmiProvider>
        </QueryClientProvider>
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}
