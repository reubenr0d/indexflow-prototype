import { createConfig, http, mock } from "wagmi";
import { arbitrum, arbitrumSepolia, sepolia } from "wagmi/chains";
import { anvil, avalancheFuji } from "viem/chains";
import { isAnvilEnabled } from "@/lib/dev-mode";

export { arbitrum, arbitrumSepolia, sepolia };
export { anvil, avalancheFuji };

const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
const includeAnvil = isE2ETestMode || isAnvilEnabled();

function buildDefaultConfig() {
  if (includeAnvil) {
    return createConfig({
      chains: [sepolia, anvil, arbitrumSepolia, arbitrum, avalancheFuji],
      transports: {
        [sepolia.id]: http(),
        [anvil.id]: http("http://127.0.0.1:8545"),
        [arbitrumSepolia.id]: http(),
        [arbitrum.id]: http(),
        [avalancheFuji.id]: http(),
      },
      multiInjectedProviderDiscovery: false,
      ssr: true,
    });
  }
  return createConfig({
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
}

export const defaultConfig = buildDefaultConfig();

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
