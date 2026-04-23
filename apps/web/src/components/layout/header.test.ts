import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/baskets",
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: false, authenticated: false }),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined }),
  useChainId: () => 11155111,
  useConnect: () => ({ connect: vi.fn(), connectors: [], isPending: false }),
  useWaitForTransactionReceipt: () => ({ isSuccess: false, isError: false, error: null }),
}));

vi.mock("@/config/contracts", () => ({
  getContracts: () => ({ usdc: "0x0000000000000000000000000000000000000001" }),
}));

vi.mock("@/config/privy", () => ({
  isPrivyConfigured: true,
}));

vi.mock("@/providers/DeploymentProvider", () => ({
  useDeploymentTarget: () => ({ chainId: 11155111, viewMode: "single" }),
}));

vi.mock("@/hooks/useContractErrorToast", () => ({
  useContractErrorToast: () => undefined,
}));

vi.mock("@/hooks/useSponsoredWriteContract", () => ({
  useSponsoredWriteContract: () => ({
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
    isError: false,
  }),
}));

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggle: vi.fn() }),
}));

vi.mock("@/components/layout/network-selector", () => ({
  NetworkSelector: () => null,
}));

vi.mock("@/components/baskets/sponsorship-error-dialog", async () => {
  const actual = await vi.importActual<typeof import("@/components/baskets/sponsorship-error-dialog")>(
    "@/components/baskets/sponsorship-error-dialog"
  );
  return {
    ...actual,
    SponsorshipErrorDialog: () => null,
  };
});

import {
  TEST_USDC_MINT_AMOUNT,
  buildMintTestUsdcCall,
  getMintSponsorshipErrorMessage,
} from "./header";

describe("Header mint helpers", () => {
  it("builds the mint tx call with 10,000 USDC (6 decimals)", () => {
    const user = "0x00000000000000000000000000000000000000aa";
    const usdc = "0x00000000000000000000000000000000000000bb";

    const call = buildMintTestUsdcCall(user, usdc);

    expect(call.address).toBe(usdc);
    expect(call.functionName).toBe("mint");
    expect(call.args).toEqual([user, TEST_USDC_MINT_AMOUNT]);
    expect(TEST_USDC_MINT_AMOUNT).toBe(10_000n * 1_000_000n);
  });

  it("extracts sponsorship error messages and ignores non-sponsorship errors", () => {
    expect(getMintSponsorshipErrorMessage(new Error("insufficient funds for gas"))).toContain(
      "insufficient funds"
    );
    expect(getMintSponsorshipErrorMessage(new Error("execution reverted: paused"))).toBeNull();
  });
});
