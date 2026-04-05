import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  baseAccount,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { arbitrum, arbitrumSepolia, sepolia } from "wagmi/chains";
import { http } from "viem";
import { anvil } from "viem/chains";
import { metaMaskExtensionWallet } from "./metaMaskExtensionWallet";

export const config = getDefaultConfig({
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
