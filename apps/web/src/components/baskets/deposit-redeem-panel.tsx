"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  useApproveUSDC,
  useDeposit,
  useRedeem,
  useSimulateDeposit,
  useSimulateRedeem,
  useUSDCAllowance,
  useUSDCBalance,
} from "@/hooks/useBasketVault";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { formatUSDC, formatShares, parseUSDCInput } from "@/lib/format";
import { PRICE_PRECISION } from "@/lib/constants";
import { showToast } from "@/components/ui/toast";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TrendPill } from "@/components/ui/trend-pill";
import {
  getPanelPrimaryActionMeta,
  type PanelMode,
} from "@/components/ui/icon-helpers";
import { ArrowDownToLine, ArrowUpToLine, Layers } from "lucide-react";
import { type Address } from "viem";
import { MultiChainDepositDrawer } from "./multi-chain-deposit-drawer";
import { SponsorshipErrorDialog, isSponsorshipError } from "./sponsorship-error-dialog";
import { isPrivyConfigured } from "@/config/privy";

type Mode = PanelMode;

interface DepositRedeemPanelProps {
  vault: Address;
  sharePrice: bigint;
  depositFeeBps: bigint;
  redeemFeeBps: bigint;
  shareBalance?: bigint;
}

export function getModeStateOnSwitch(nextMode: Mode) {
  return { mode: nextMode, amount: "" };
}

export function getQuoteAmountLabel(mode: Mode, amount: bigint) {
  return mode === "deposit" ? `${formatUSDC(amount)} USDC` : `${formatShares(amount)} shares`;
}

export function getSimulationErrorMessage(mode: Mode, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");

  if (mode === "deposit" && raw.includes("Chain not accepting deposits")) {
    return "This chain is not accepting deposits right now. Wait for the next keeper update or deposit on another chain.";
  }
  if (mode === "redeem" && raw.includes("Insufficient liquidity")) {
    return "Not enough idle USDC is available for this redemption size. Try a smaller redeem and wait for liquidity to refill.";
  }
  if (mode === "redeem") {
    return "This redemption is likely to fail. Check your share balance and available vault liquidity.";
  }
  return "This deposit is likely to fail. Check your balance and chain routing status.";
}

export function DepositRedeemPanel({
  vault,
  sharePrice,
  depositFeeBps,
  redeemFeeBps,
  shareBalance,
}: DepositRedeemPanelProps) {
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");
  const [isMultiChainDrawerOpen, setIsMultiChainDrawerOpen] = useState(false);
  const [showSponsorshipError, setShowSponsorshipError] = useState(false);
  const [sponsorshipErrorMessage, setSponsorshipErrorMessage] = useState<string | undefined>();
  const { address } = useAccount();
  const { chainId, viewMode } = useDeploymentTarget();
  const { usdc } = getContracts(chainId);

  const isMultiChainEnabled = isPrivyConfigured && viewMode === "all";

  const { data: usdcBalance } = useUSDCBalance(usdc, address);
  const { data: allowance } = useUSDCAllowance(usdc, address, vault);

  const {
    approve,
    receipt: approveReceipt,
    isPending: isApproving,
    error: approveError,
    isError: isApproveError,
  } = useApproveUSDC();
  const {
    deposit,
    receipt: depositReceipt,
    isPending: isDepositing,
    error: depositError,
    isError: isDepositError,
  } = useDeposit();
  const {
    redeem,
    receipt: redeemReceipt,
    isPending: isRedeeming,
    error: redeemError,
    isError: isRedeemError,
  } = useRedeem();

  const parsedAmount = amount ? parseUSDCInput(amount) : 0n;

  const { error: simDepositError } = useSimulateDeposit(
    vault,
    mode === "deposit" ? parsedAmount : 0n,
    mode === "deposit" ? address : undefined
  );
  const { error: simRedeemError } = useSimulateRedeem(
    vault,
    mode === "redeem" ? parsedAmount : 0n,
    mode === "redeem" ? address : undefined
  );
  const simulationError = mode === "deposit" ? simDepositError : simRedeemError;
  const simulationErrorMessage = simulationError ? getSimulationErrorMessage(mode, simulationError) : null;

  const needsApproval =
    mode === "deposit" &&
    parsedAmount > 0n &&
    (allowance ?? 0n) < parsedAmount;

  const estimatedShares =
    mode === "deposit" && sharePrice > 0n
      ? (parsedAmount * (10000n - depositFeeBps) * PRICE_PRECISION) / (10000n * sharePrice)
      : 0n;

  const estimatedUSDC =
    mode === "redeem" && sharePrice > 0n
      ? (parsedAmount * sharePrice * (10000n - redeemFeeBps)) / (10000n * PRICE_PRECISION)
      : 0n;

  const isProcessing = isApproving || isDepositing || isRedeeming;
  const blockedBySimulation = parsedAmount > 0n && !needsApproval && Boolean(simulationError);
  const balance = mode === "deposit" ? usdcBalance : shareBalance;
  const hasAmount = parsedAmount > 0n;
  const actionMeta = getPanelPrimaryActionMeta({
    hasAddress: Boolean(address),
    mode,
    needsApproval,
    isProcessing,
  });

  useEffect(() => {
    if (approveReceipt.isSuccess) {
      showToast("success", "USDC approved");
    }
  }, [approveReceipt.isSuccess]);

  useContractErrorToast({
    writeError: approveError,
    writeIsError: isApproveError,
    receiptError: approveReceipt.error,
    receiptIsError: approveReceipt.isError,
    fallbackMessage: "USDC approval failed",
  });

  useContractErrorToast({
    writeError: depositError,
    writeIsError: isDepositError,
    receiptError: depositReceipt.error,
    receiptIsError: depositReceipt.isError,
    fallbackMessage: "Deposit failed",
  });

  useEffect(() => {
    if (isDepositError && depositError && isSponsorshipError(depositError)) {
      const msg = depositError instanceof Error ? depositError.message : String(depositError);
      setSponsorshipErrorMessage(msg);
      setShowSponsorshipError(true);
    }
  }, [isDepositError, depositError]);

  useEffect(() => {
    if (isApproveError && approveError && isSponsorshipError(approveError)) {
      const msg = approveError instanceof Error ? approveError.message : String(approveError);
      setSponsorshipErrorMessage(msg);
      setShowSponsorshipError(true);
    }
  }, [isApproveError, approveError]);

  useContractErrorToast({
    writeError: redeemError,
    writeIsError: isRedeemError,
    receiptError: redeemReceipt.error,
    receiptIsError: redeemReceipt.isError,
    fallbackMessage: "Redemption failed",
  });

  useEffect(() => {
    if (depositReceipt.isSuccess) {
      showToast("success", "Deposit successful");
      setAmount("");
    }
  }, [depositReceipt.isSuccess]);

  useEffect(() => {
    if (redeemReceipt.isSuccess) {
      showToast("success", "Redemption successful");
      setAmount("");
    }
  }, [redeemReceipt.isSuccess]);

  const handleModeChange = (nextMode: Mode) => {
    const nextState = getModeStateOnSwitch(nextMode);
    setMode(nextState.mode);
    setAmount(nextState.amount);
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
  };

  const handleSubmit = () => {
    if (!address || parsedAmount === 0n) return;

    if (blockedBySimulation) {
      showToast("error", simulationErrorMessage ?? "Transaction is likely to fail.");
      return;
    }

    if (mode === "deposit" && isMultiChainEnabled) {
      setIsMultiChainDrawerOpen(true);
      return;
    }

    if (mode === "deposit" && needsApproval) {
      approve(usdc, vault, parsedAmount);
      showToast("pending", "Approving USDC...");
      return;
    }

    if (mode === "deposit") {
      deposit(vault, parsedAmount);
      showToast("pending", "Depositing...");
      return;
    }

    redeem(vault, parsedAmount);
    showToast("pending", "Redeeming...");
  };

  const handleMultiChainDepositSuccess = () => {
    setAmount("");
    showToast("success", "Multi-chain deposit complete");
  };

  return (
    <Card className="p-5">
      <SegmentedControl
        options={[
          { value: "deposit", label: "Deposit", icon: <ArrowDownToLine className="h-4 w-4" /> },
          { value: "redeem", label: "Redeem", icon: <ArrowUpToLine className="h-4 w-4" /> },
        ]}
        value={mode}
        onChange={handleModeChange}
        equalWidth
        ariaLabel="Deposit and redeem tabs"
        className="mb-6 w-full"
      />

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="deposit-redeem-amount" className="text-sm font-medium text-app-muted">
            {mode === "deposit" ? "USDC amount" : "Shares"}
          </label>
          {balance !== undefined && (
            <button
              type="button"
              onClick={() =>
                handleAmountChange(
                  mode === "deposit"
                    ? (Number(balance) / 1e6).toString()
                    : (Number(balance) / 1e6).toString()
                )
              }
              className="font-mono text-xs font-semibold text-app-accent hover:underline"
            >
              Max: {mode === "deposit" ? formatUSDC(balance) : formatShares(balance)}
            </button>
          )}
        </div>
        <Input
          id="deposit-redeem-amount"
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          data-testid="deposit-redeem-amount"
          className="text-xl font-semibold"
        />
      </div>

      <div className="mb-4 min-h-[118px] rounded-md border border-app-border bg-app-bg-subtle p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-app-muted">You receive</span>
          <TrendPill direction={hasAmount ? "up" : "flat"} tone={hasAmount ? "success" : "neutral"}>
            {hasAmount
              ? `${mode === "deposit" ? formatShares(estimatedShares) : formatUSDC(estimatedUSDC)} ${
                  mode === "deposit" ? "shares" : "USDC"
                }`
              : "--"}
          </TrendPill>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-app-muted">Fee</span>
          <TrendPill direction={hasAmount ? "down" : "flat"} tone={hasAmount ? "danger" : "neutral"}>
            {hasAmount
              ? `${mode === "deposit"
                  ? `${Number(depositFeeBps) / 100}%`
                  : `${Number(redeemFeeBps) / 100}%`}`
              : "--"}
          </TrendPill>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-app-muted">
          {mode === "deposit"
            ? "Deposit quotes use the current share price and fee setting."
            : "Redeem quotes estimate the cash you will receive after fee impact."}
        </p>
      </div>

      {blockedBySimulation && (
        <p className="mb-3 rounded-md border border-app-danger/30 bg-app-danger/5 px-3 py-2 text-xs text-app-danger">
          {simulationErrorMessage}
        </p>
      )}

      {mode === "deposit" && isMultiChainEnabled && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-app-accent/30 bg-app-accent/5 px-3 py-2">
          <Layers className="h-4 w-4 text-app-accent" />
          <p className="text-xs text-app-muted">
            Multi-chain deposit enabled. Your deposit will be automatically routed across chains.
          </p>
        </div>
      )}

      {!address ? (
        <Button variant="secondary" size="lg" className="w-full" disabled>
          <span className="inline-flex items-center gap-2">
            {actionMeta.icon}
            {actionMeta.label}
          </span>
        </Button>
      ) : (
        <Button
          size="lg"
          className="w-full"
          disabled={parsedAmount === 0n || isProcessing || blockedBySimulation}
          onClick={handleSubmit}
          data-testid="deposit-redeem-submit"
        >
          <span className="inline-flex items-center gap-2">
            {mode === "deposit" && isMultiChainEnabled ? (
              <>
                <Layers className="h-4 w-4" />
                Multi-Chain Deposit
              </>
            ) : (
              <>
                {actionMeta.icon}
                {actionMeta.label}
              </>
            )}
          </span>
        </Button>
      )}

      <MultiChainDepositDrawer
        open={isMultiChainDrawerOpen}
        onOpenChange={setIsMultiChainDrawerOpen}
        amount={parsedAmount}
        vaultAddress={vault}
        sharePrice={sharePrice}
        depositFeeBps={depositFeeBps}
        onSuccess={handleMultiChainDepositSuccess}
      />

      <SponsorshipErrorDialog
        open={showSponsorshipError}
        onOpenChange={setShowSponsorshipError}
        errorMessage={sponsorshipErrorMessage}
        onRetry={() => {
          setShowSponsorshipError(false);
          handleSubmit();
        }}
      />
    </Card>
  );
}
