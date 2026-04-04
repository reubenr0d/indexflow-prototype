"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { config } from "@/config/wagmi";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

const rkTheme = {
  lightMode: lightTheme({
    accentColor: "#0d9488",
    accentColorForeground: "#ffffff",
    borderRadius: "medium",
    fontStack: "system",
  }),
  darkMode: darkTheme({
    accentColor: "#2dd4bf",
    accentColorForeground: "#04120f",
    borderRadius: "medium",
    fontStack: "system",
  }),
};

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
