import type { PrivyClientConfig } from "@privy-io/react-auth";
import { addRpcUrlOverrideToChain } from "@privy-io/chains";
import { anvil } from "viem/chains";
import { sepolia, arbitrumSepolia, arbitrum } from "wagmi/chains";

const anvilWithRpc = addRpcUrlOverrideToChain(anvil, "http://127.0.0.1:8545");
const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
const isLocal =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const isPrivyConfigured = privyAppId.length > 0;

const includeAnvil = isLocal || isE2ETestMode;

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
  defaultChain: includeAnvil ? anvilWithRpc : sepolia,
  supportedChains: includeAnvil
    ? [anvilWithRpc, sepolia, arbitrumSepolia, arbitrum]
    : [sepolia, arbitrumSepolia, arbitrum],
};
