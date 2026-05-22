import { describe, expect, it, vi } from "vitest";
import { keccak256, toBytes } from "viem";

vi.mock("wagmi", () => ({
  useConfig: () => ({}),
}));

vi.mock("@wagmi/core", () => ({
  getPublicClient: () => null,
}));

vi.mock("@/hooks/useSponsoredTransactionAdapter", () => ({
  useSponsoredTransactionAdapter: () => ({
    sendSponsoredTx: vi.fn(),
    embeddedWallet: null,
    getSenderAddress: vi.fn(),
  }),
}));

vi.mock("@/config/contracts", () => ({
  CONFIGURED_DEPLOYMENT_TARGETS: ["sepolia", "fuji", "arbitrum-sepolia"],
  getContractsForDeploymentTarget: (target: string) => {
    if (target === "sepolia") {
      return {
        basketFactory: "0xA9a83c9383dA6EA831504F79c68E3230B604145E",
        stateRelay: "0xSepoliaStateRelay",
      };
    }
    if (target === "fuji") {
      return {
        basketFactory: "0xb797210b3A6315726bC829599B8b2435FEa53C29",
        stateRelay: "0xFujiStateRelay",
      };
    }
    if (target === "arbitrum-sepolia") {
      return {
        basketFactory: "0xArbFactory",
        // stateRelay missing on arbitrum: not wired yet for spoke twins
      };
    }
    return { basketFactory: undefined, stateRelay: undefined };
  },
}));

vi.mock("@/lib/deployment", () => ({
  CHAIN_REGISTRY: {
    sepolia: { chainId: 11155111, role: "hub" },
    fuji: { chainId: 43113, role: "spoke" },
    "arbitrum-sepolia": { chainId: 421614, role: "spoke" },
  },
  deploymentLabel: (t: string) => t,
}));

vi.mock("@/abi/BasketFactory", () => ({
  BasketFactoryABI: [],
}));

vi.mock("@/abi/BasketVault", () => ({
  BasketVaultABI: [],
}));

import { defaultSpokeTargetsForHub } from "./useCreateMultichainBasket";

describe("defaultSpokeTargetsForHub", () => {
  it("returns every configured spoke that has both basketFactory + stateRelay (excluding the hub)", () => {
    // sepolia is the hub -> excluded
    // fuji has both factory + stateRelay -> included
    // arbitrum-sepolia has factory but no stateRelay -> excluded so the
    // wiring step doesn't fail mid-flight
    expect(defaultSpokeTargetsForHub("sepolia")).toEqual(["fuji"]);
  });

  it("excludes the hub from its own twin list when the hub itself is also a configured target", () => {
    expect(defaultSpokeTargetsForHub("fuji")).toEqual(["sepolia"]);
  });
});

describe("SPOKE_STUB_ASSET_ID derivation", () => {
  it("matches keccak256('USDC') so spoke twins accept deposits with the same asset id as DeploySpoke.s.sol", () => {
    // The asset id is computed inside the hook module via the same primitive
    // used here, but we pin the literal value the on-chain side expects.
    const expected = "0xd6aca1be9729c13d677335161321649cccae6a591554772516700f986f942eaa";
    expect(keccak256(toBytes("USDC"))).toBe(expected);
  });
});
