import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DepositRedeemPanel,
  getSimulationErrorMessage,
  getModeStateOnSwitch,
  getQuoteAmountLabel,
} from "./deposit-redeem-panel";
import { getPanelPrimaryActionMeta } from "@/components/ui/icon-helpers";

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined }),
  useChainId: () => 31337,
  useConfig: () => ({ chains: [] }),
}));

vi.mock("@privy-io/react-auth/smart-wallets", () => ({
  useSmartWallets: () => ({ client: undefined }),
}));

vi.mock("@/hooks/useBasketVault", () => ({
  useUSDCBalance: () => ({ data: 0n }),
  useSimulateDeposit: () => ({ error: null }),
  useSimulateRedeem: () => ({ error: null }),
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

vi.mock("@/providers/DeploymentProvider", () => ({
  useDeploymentTarget: () => ({ chainId: 31337, viewMode: "single" }),
}));

// Stub the modal so the panel test stays focused on the panel itself; the
// modal has its own coverage in a separate spec.
vi.mock("./deposit-confirm-modal", () => ({
  DepositConfirmModal: () => null,
}));

vi.mock("./sponsorship-error-dialog", () => ({
  SponsorshipErrorDialog: () => null,
  isSponsorshipError: () => false,
}));

describe("DepositRedeemPanel", () => {
  it("renders the unified deposit panel with copy that reflects the new modal flow", () => {
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
    expect(html).toContain("Connect Wallet");
    expect(html).toContain("min-h-[118px]");
    expect(html).toContain("Approval and deposit are bundled");
    // The two-step "Approve USDC" CTA was replaced by the unified modal, so it
    // must no longer appear in the panel button.
    expect(html).not.toContain(">Approve USDC<");
    // Stepper is redeem-only now, so the deposit-redeem-stepper data-testid
    // should not render on first paint.
    expect(html).not.toContain('data-testid="deposit-redeem-stepper"');
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
    expect(
      getPanelPrimaryActionMeta({
        hasAddress: false,
        mode: "deposit",
        needsApproval: false,
        isProcessing: false,
      }).label
    ).toBe("Connect Wallet");
    expect(
      getPanelPrimaryActionMeta({
        hasAddress: true,
        mode: "deposit",
        needsApproval: false,
        isProcessing: false,
      }).label
    ).toBe("Deposit");
    expect(
      getPanelPrimaryActionMeta({
        hasAddress: true,
        mode: "redeem",
        needsApproval: false,
        isProcessing: false,
      }).label
    ).toBe("Redeem");
  });

  it("maps routing guard and liquidity simulation failures to explicit copy", () => {
    expect(
      getSimulationErrorMessage("deposit", new Error("execution reverted: Chain not accepting deposits"))
    ).toContain("not accepting deposits");
    expect(
      getSimulationErrorMessage("redeem", new Error("execution reverted: Insufficient liquidity"))
    ).toContain("Not enough idle USDC");
  });
});
