import type { PrivyClientConfig } from "@privy-io/react-auth";
import { addRpcUrlOverrideToChain } from "@privy-io/chains";
import { anvil, avalancheFuji } from "viem/chains";
import { sepolia, arbitrumSepolia, arbitrum } from "wagmi/chains";
import { isAnvilEnabled } from "@/lib/dev-mode";

const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
const includeAnvil = isE2ETestMode || isAnvilEnabled();

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const isPrivyConfigured = privyAppId.length > 0;

function buildPrivyConfig(): PrivyClientConfig {
  const base: PrivyClientConfig = {
    embeddedWallets: {
      ethereum: {
        createOnLogin: "users-without-wallets",
      },
    },
    appearance: {
      walletChainType: "ethereum-only",
      showWalletLoginFirst: false,
    },
  };

  if (includeAnvil) {
    const anvilWithRpc = addRpcUrlOverrideToChain(anvil, "http://127.0.0.1:8545");
    return {
      ...base,
      defaultChain: sepolia,
      supportedChains: [sepolia, anvilWithRpc, arbitrumSepolia, arbitrum, avalancheFuji],
    };
  }

  return {
    ...base,
    defaultChain: sepolia,
    supportedChains: [sepolia, arbitrumSepolia, arbitrum, avalancheFuji],
  };
}

export const privyConfig = buildPrivyConfig();
