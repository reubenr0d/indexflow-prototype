import { createConfig } from "@privy-io/wagmi";
import { arbitrum, arbitrumSepolia, sepolia } from "wagmi/chains";
import { createConfig as createWagmiConfig, http, mock } from "wagmi";
import { anvil } from "viem/chains";

const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";

export const defaultConfig = createConfig({
  chains: [anvil, sepolia, arbitrumSepolia, arbitrum],
  transports: {
    [anvil.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [arbitrum.id]: http(),
  },
  multiInjectedProviderDiscovery: false,
  ssr: true,
});

const e2eConfig = createWagmiConfig({
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
