"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import {
  useApproveUSDC,
  useDeposit,
  useRedeem,
  useUSDCAllowance,
  useUSDCBalance,
} from "@/hooks/useBasketVault";
import { getContracts } from "@/config/contracts";
import { formatUSDC, formatShares, parseUSDCInput } from "@/lib/format";
import { PRICE_PRECISION } from "@/lib/constants";
import { showToast } from "@/components/ui/toast";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { StatusChip } from "@/components/ui/status-chip";
import { TrendPill } from "@/components/ui/trend-pill";
import {
  getPanelPrimaryActionMeta,
  type PanelMode,
} from "@/components/ui/icon-helpers";
import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { type Address } from "viem";

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

export function DepositRedeemPanel({
  vault,
  sharePrice,
  depositFeeBps,
  redeemFeeBps,
  shareBalance,
}: DepositRedeemPanelProps) {
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");
  const { address } = useAccount();
  const chainId = useChainId();
  const { usdc } = getContracts(chainId);

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

  return (
    <Card className="sticky top-20 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-app-text">
          <InfoLabel label="Quote preview" tooltipKey="quotePreview" />
        </h3>
        <StatusChip
          tone={mode === "deposit" ? "accent" : "warning"}
          icon={mode === "deposit" ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <ArrowUpToLine className="h-3.5 w-3.5" />}
        >
          {mode === "deposit" ? "Deposit" : "Redeem"}
        </StatusChip>
      </div>

      <SegmentedControl
        options={[
          { value: "deposit", label: "Deposit" },
          { value: "redeem", label: "Redeem" },
        ]}
        value={mode}
        onChange={handleModeChange}
        equalWidth
        ariaLabel="Deposit and redeem tabs"
        className="mb-6 w-full"
      />

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-app-muted">
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
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
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
          disabled={parsedAmount === 0n || isProcessing}
          onClick={handleSubmit}
        >
          <span className="inline-flex items-center gap-2">
            {actionMeta.icon}
            {actionMeta.label}
          </span>
        </Button>
      )}
    </Card>
  );
}
