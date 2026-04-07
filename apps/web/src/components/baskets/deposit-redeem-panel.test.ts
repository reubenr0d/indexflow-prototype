import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DepositRedeemPanel,
  getModeStateOnSwitch,
  getQuoteAmountLabel,
} from "./deposit-redeem-panel";
import { getPanelPrimaryActionMeta } from "@/components/ui/icon-helpers";

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined }),
  useChainId: () => 31337,
  useConfig: () => ({ chains: [] }),
}));

vi.mock("@/hooks/useBasketVault", () => ({
  useUSDCBalance: () => ({ data: 0n }),
  useUSDCAllowance: () => ({ data: 0n }),
  useApproveUSDC: () => ({
    approve: vi.fn(),
    receipt: { isSuccess: false, isError: false, error: null },
    isPending: false,
    error: null,
    isError: false,
  }),
  useDeposit: () => ({
    deposit: vi.fn(),
    receipt: { isSuccess: false, isError: false, error: null },
    isPending: false,
    error: null,
    isError: false,
  }),
  useRedeem: () => ({
    redeem: vi.fn(),
    receipt: { isSuccess: false, isError: false, error: null },
    isPending: false,
    error: null,
    isError: false,
  }),
}));

vi.mock("@/hooks/useContractErrorToast", () => ({
  useContractErrorToast: () => undefined,
}));

vi.mock("@/config/contracts", () => ({
  getContracts: () => ({ usdc: "0x0000000000000000000000000000000000000001" }),
}));

describe("DepositRedeemPanel", () => {
  it("renders icon tabs with the quote section and no inline transaction rail", () => {
    const html = renderToStaticMarkup(
      createElement(DepositRedeemPanel, {
        vault: "0x0000000000000000000000000000000000000002",
        sharePrice: 1_000_000n,
        depositFeeBps: 10n,
        redeemFeeBps: 10n,
        shareBalance: 0n,
      })
    );

    expect(html).toContain(">Deposit<");
    expect(html).toContain(">Redeem<");
    expect(html).toContain("You receive");
    expect(html).toContain("Fee");
    expect(html).not.toContain("Transaction status");
    expect(html).toContain("Connect Wallet");
    expect(html).toContain("min-h-[118px]");
  });

  it("clears amount on tab switch state transition", () => {
    expect(getModeStateOnSwitch("deposit")).toEqual({ mode: "deposit", amount: "" });
    expect(getModeStateOnSwitch("redeem")).toEqual({ mode: "redeem", amount: "" });
  });

  it("formats helper copy for the active mode", () => {
    expect(getQuoteAmountLabel("deposit", 1_250_000n)).toBe("1.25 USDC");
    expect(getQuoteAmountLabel("redeem", 2_500_000n)).toBe("2.5 shares");
  });

  it("maps action metadata for the CTA", () => {
    expect(getPanelPrimaryActionMeta({ hasAddress: false, mode: "deposit", needsApproval: false, isProcessing: false }).label).toBe("Connect Wallet");
    expect(getPanelPrimaryActionMeta({ hasAddress: true, mode: "deposit", needsApproval: true, isProcessing: false }).label).toBe("Approve USDC");
    expect(getPanelPrimaryActionMeta({ hasAddress: true, mode: "redeem", needsApproval: false, isProcessing: false }).label).toBe("Redeem");
  });
});
