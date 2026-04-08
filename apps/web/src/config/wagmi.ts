import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  baseAccount,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { arbitrum, arbitrumSepolia, sepolia } from "wagmi/chains";
import { createConfig, http, mock } from "wagmi";
import { anvil } from "viem/chains";
import { metaMaskExtensionWallet } from "./metaMaskExtensionWallet";

const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";

const defaultConfig = getDefaultConfig({
  appName: "IndexFlow",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID ?? "demo",
  chains: [anvil, sepolia, arbitrumSepolia, arbitrum],
  transports: {
    [anvil.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [arbitrum.id]: http(),
  },
  ssr: true,
  wallets: [
    {
      groupName: "Popular",
      wallets: [
        safeWallet,
        rainbowWallet,
        baseAccount,
        metaMaskExtensionWallet,
        walletConnectWallet,
      ],
    },
  ],
});

const e2eConfig = createConfig({
  chains: [anvil],
  connectors: [
    mock({
      accounts: ["0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"],
      features: {
        reconnect: true,
      },
    }),
  ],
  transports: {
    [anvil.id]: http("http://127.0.0.1:8545"),
  },
  ssr: true,
});

export const config = isE2ETestMode ? e2eConfig : defaultConfig;
