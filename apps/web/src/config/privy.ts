import type { PrivyClientConfig } from "@privy-io/react-auth";
import { avalancheFuji } from "viem/chains";
import { sepolia, arbitrumSepolia, arbitrum } from "wagmi/chains";

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const isPrivyConfigured = privyAppId.length > 0;

export const privyConfig: PrivyClientConfig = {
  embeddedWallets: {
    ethereum: {
      createOnLogin: "all-users",
    },
    // Run embedded-wallet transactions headlessly. Our own in-app
    // TransactionDock + inline panel stepper take over the confirmation UX.
    // See https://docs.privy.io/recipes/react/manage-wallet-UIs
    showWalletUIs: false,
  },
  externalWallets: {
    disableAllExternalWallets: true,
  },
  appearance: {
    walletChainType: "ethereum-only",
    showWalletLoginFirst: false,
  },
  defaultChain: sepolia,
  supportedChains: [sepolia, arbitrumSepolia, arbitrum, avalancheFuji],
};
