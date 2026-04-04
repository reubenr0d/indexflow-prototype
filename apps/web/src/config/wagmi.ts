import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arbitrum, arbitrumSepolia } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "Perp Baskets",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID ?? "demo",
  chains: [arbitrumSepolia, arbitrum],
  ssr: true,
});
