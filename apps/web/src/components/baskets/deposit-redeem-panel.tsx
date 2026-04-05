"use client";

import { useState, useEffect } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "wagmi";
import { useChainId } from "wagmi";
import { useDeposit, useRedeem, useApproveUSDC, useUSDCBalance, useUSDCAllowance } from "@/hooks/useBasketVault";
import { getContracts } from "@/config/contracts";
import { formatUSDC, formatShares, parseUSDCInput } from "@/lib/format";
import { PRICE_PRECISION } from "@/lib/constants";
import { showToast } from "@/components/ui/toast";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { type Address } from "viem";

type Mode = "deposit" | "redeem";

interface DepositRedeemPanelProps {
  vault: Address;
  basketPrice: bigint;
  sharePrice: bigint;
  depositFeeBps: bigint;
  redeemFeeBps: bigint;
  shareBalance?: bigint;
}

export function DepositRedeemPanel({
  vault,
  basketPrice,
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
  const needsApproval = mode === "deposit" && parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;

  const estimatedShares =
    mode === "deposit" && basketPrice > 0n
      ? (parsedAmount * (10000n - depositFeeBps) * PRICE_PRECISION) / (10000n * basketPrice)
      : 0n;

  const estimatedUSDC =
    mode === "redeem" && sharePrice > 0n
      ? (parsedAmount * sharePrice * (10000n - redeemFeeBps)) / (10000n * PRICE_PRECISION)
      : 0n;

  useEffect(() => {
    if (approveReceipt.isSuccess) {
      showToast("success", "USDC approved");
    }
  }, [approveReceipt.isSuccess]);

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

  const handleSubmit = () => {
    if (!address) return;

    if (mode === "deposit") {
      if (needsApproval) {
        approve(usdc, vault, parsedAmount);
        showToast("pending", "Approving USDC...");
      } else {
        deposit(vault, parsedAmount);
        showToast("pending", "Depositing...");
      }
    } else {
      redeem(vault, parsedAmount);
      showToast("pending", "Redeeming...");
    }
  };

  const isProcessing = isApproving || isDepositing || isRedeeming;
  const balance = mode === "deposit" ? usdcBalance : shareBalance;

  return (
    <Card className="sticky top-20 p-5">
      <SegmentedControl
        options={[
          { value: "deposit", label: "Deposit" },
          { value: "redeem", label: "Redeem" },
        ]}
        value={mode}
        onChange={setMode}
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
              onClick={() => setAmount(
                mode === "deposit"
                  ? (Number(balance) / 1e6).toString()
                  : (Number(balance) / 1e6).toString()
              )}
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
          onChange={(e) => setAmount(e.target.value)}
          className="text-xl font-semibold"
        />
      </div>

      {parsedAmount > 0n && (
        <div className="mb-6 rounded-md border border-app-border bg-app-bg-subtle p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-app-muted">You receive</span>
            <span className="font-mono font-medium text-app-text">
              {mode === "deposit"
                ? `${formatShares(estimatedShares)} shares`
                : `${formatUSDC(estimatedUSDC)} USDC`}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-app-muted">Fee</span>
            <span className="font-mono text-app-muted">
              {mode === "deposit"
                ? `${Number(depositFeeBps) / 100}%`
                : `${Number(redeemFeeBps) / 100}%`}
            </span>
          </div>
        </div>
      )}

      {!address ? (
        <Button variant="secondary" size="lg" className="w-full" disabled>
          Connect Wallet
        </Button>
      ) : (
        <Button
          size="lg"
          className="w-full"
          disabled={parsedAmount === 0n || isProcessing}
          onClick={handleSubmit}
        >
          {isProcessing
            ? "Processing..."
            : needsApproval
              ? "Approve USDC"
              : mode === "deposit"
                ? "Deposit"
                : "Redeem"}
        </Button>
      )}
    </Card>
  );
}
