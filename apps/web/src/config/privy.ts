import type { PrivyClientConfig } from "@privy-io/react-auth";
import { addRpcUrlOverrideToChain } from "@privy-io/chains";
import { anvil } from "viem/chains";
import { sepolia, arbitrumSepolia, arbitrum } from "wagmi/chains";

const anvilWithRpc = addRpcUrlOverrideToChain(anvil, "http://127.0.0.1:8545");

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const isPrivyConfigured = privyAppId.length > 0;

export const privyConfig: PrivyClientConfig = {
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
  },
  appearance: {
    walletChainType: "ethereum-only",
    showWalletLoginFirst: false,
  },
  defaultChain: sepolia,
  supportedChains: [anvilWithRpc, sepolia, arbitrumSepolia, arbitrum],
};
