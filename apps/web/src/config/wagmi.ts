import { createConfig, http, mock } from "wagmi";
import { arbitrum, arbitrumSepolia, sepolia, anvil } from "wagmi/chains";
import { avalancheFuji } from "viem/chains";

export { arbitrum, arbitrumSepolia, sepolia };
export { avalancheFuji };

const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";

export const defaultConfig = createConfig({
  chains: [sepolia, arbitrumSepolia, arbitrum, avalancheFuji],
  transports: {
    [sepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [arbitrum.id]: http(),
    [avalancheFuji.id]: http(),
  },
  multiInjectedProviderDiscovery: false,
  ssr: true,
});

function buildE2EConfig() {
  return createConfig({
    chains: [anvil],
    connectors: [
      mock({
        accounts: ["0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"],
        features: { reconnect: true },
      }),
    ],
    transports: {
      [anvil.id]: http("http://127.0.0.1:8545"),
    },
    ssr: true,
  });
}

export const config = isE2ETestMode ? buildE2EConfig() : defaultConfig;
