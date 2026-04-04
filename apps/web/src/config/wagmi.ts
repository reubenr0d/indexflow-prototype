import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arbitrum, arbitrumSepolia } from "wagmi/chains";
import { http } from "viem";
import { anvil } from "viem/chains";

export const config = getDefaultConfig({
  appName: "IndexFlow",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID ?? "demo",
  chains: [anvil, arbitrumSepolia, arbitrum],
  transports: {
    [anvil.id]: http("http://127.0.0.1:8545"),
    [arbitrumSepolia.id]: http(),
    [arbitrum.id]: http(),
  },
  ssr: true,
});
