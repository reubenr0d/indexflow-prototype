import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useQuery } from "@tanstack/react-query";
import { useVaultAddressByName, type ChainVaultMatch } from "./useVaultAddressByName";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useConfig: () => ({}),
}));

vi.mock("@wagmi/core", () => ({
  getPublicClient: () => null,
}));

vi.mock("@/config/contracts", () => ({
  CONFIGURED_DEPLOYMENT_TARGETS: ["sepolia", "fuji"],
  getContractsForDeploymentTarget: (target: string) => ({
    basketFactory:
      target === "sepolia"
        ? "0xA9a83c9383dA6EA831504F79c68E3230B604145E"
        : "0xb797210b3A6315726bC829599B8b2435FEa53C29",
  }),
}));

vi.mock("@/lib/deployment", () => ({
  CHAIN_REGISTRY: {
    sepolia: { chainId: 11155111, ccipChainSelector: "16015286601757825753", role: "hub" },
    fuji: { chainId: 43113, ccipChainSelector: "14767482510784806043", role: "spoke" },
  },
}));

describe("useVaultAddressByName", () => {
  beforeEach(() => {
    (useQuery as unknown as Mock).mockReset();
  });

  it("returns the resolved per-chain matches passed by the query layer", () => {
    const fixture: ChainVaultMatch[] = [
      {
        target: "sepolia",
        chainId: 11155111,
        vaultAddress: "0x4dcd435461e27f8bfb580d216b8d69490023a0ba",
        matchedByName: false,
      },
      {
        target: "fuji",
        chainId: 43113,
        vaultAddress: null,
        matchedByName: false,
      },
    ];
    (useQuery as unknown as Mock).mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
    });

    const captured: { current: ReturnType<typeof useVaultAddressByName> | null } = { current: null };
    function Probe() {
      captured.current = useVaultAddressByName(
        "Minestarters ML Picks",
        11155111,
        "0x4dcd435461e27f8bfb580d216b8d69490023a0ba",
      );
      return createElement("div");
    }
    renderToStaticMarkup(createElement(Probe));

    expect(captured.current?.data).toEqual(fixture);
    expect(captured.current?.isLoading).toBe(false);
  });

  it("keys the query on the trimmed-lowercased vault name so different casing reuses the cached result", () => {
    (useQuery as unknown as Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    function Probe() {
      useVaultAddressByName(
        "  Minestarters ML Picks  ",
        11155111,
        "0x4dcd435461e27f8bfb580d216b8d69490023a0ba",
      );
      return createElement("div");
    }
    renderToStaticMarkup(createElement(Probe));

    const call = (useQuery as unknown as Mock).mock.calls.at(-1)?.[0];
    expect(call?.queryKey).toEqual([
      "vault-address-by-name",
      "minestarters ml picks",
      11155111,
      "0x4dcd435461e27f8bfb580d216b8d69490023a0ba",
    ]);
    expect(call?.enabled).toBe(true);
  });

  it("disables the query when vaultName is missing", () => {
    (useQuery as unknown as Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    function Probe() {
      useVaultAddressByName(undefined, 11155111, "0x4dcd435461e27f8bfb580d216b8d69490023a0ba");
      return createElement("div");
    }
    renderToStaticMarkup(createElement(Probe));

    const call = (useQuery as unknown as Mock).mock.calls.at(-1)?.[0];
    expect(call?.enabled).toBe(false);
  });

  it("disables the query when referenceVaultAddress is missing", () => {
    (useQuery as unknown as Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    function Probe() {
      useVaultAddressByName("Minestarters ML Picks", 11155111, undefined);
      return createElement("div");
    }
    renderToStaticMarkup(createElement(Probe));

    const call = (useQuery as unknown as Mock).mock.calls.at(-1)?.[0];
    expect(call?.enabled).toBe(false);
  });
});
