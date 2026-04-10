"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { showToast } from "@/components/ui/toast";
import { useUSDCAllowance, useApproveUSDC, useTopUpReserve } from "@/hooks/useBasketVault";
import { parseUSDCInput } from "@/lib/format";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { useAccount } from "wagmi";
import { type Address } from "viem";

export function ReserveTopUpCard({ vault, usdc }: { vault: Address; usdc: Address }) {
  const [amount, setAmount] = useState("");
  const { address } = useAccount();
  const { data: allowance } = useUSDCAllowance(usdc, address, vault);
  const {
    approve,
    receipt: approveReceipt,
    isPending: isApproving,
    error: approveError,
    isError: isApproveError,
  } = useApproveUSDC();
  const {
    topUpReserve,
    receipt: topUpReceipt,
    isPending: isToppingUp,
    error: topUpError,
    isError: isTopUpError,
  } = useTopUpReserve();

  const parsedAmount = amount ? parseUSDCInput(amount) : 0n;
  const needsApproval = parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;
  const isProcessing = isApproving || isToppingUp;

  useEffect(() => {
    if (approveReceipt.isSuccess) {
      showToast("success", "USDC approved");
    }
  }, [approveReceipt.isSuccess]);

  useEffect(() => {
    if (topUpReceipt.isSuccess) {
      showToast("success", "Reserve topped up");
    }
  }, [topUpReceipt.isSuccess]);

  useContractErrorToast({
    writeError: approveError,
    writeIsError: isApproveError,
    receiptError: approveReceipt.error,
    receiptIsError: approveReceipt.isError,
    fallbackMessage: "USDC approval failed",
  });
  useContractErrorToast({
    writeError: topUpError,
    writeIsError: isTopUpError,
    receiptError: topUpReceipt.error,
    receiptIsError: topUpReceipt.isError,
    fallbackMessage: "Reserve top up failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-base font-semibold text-app-text">
        <InfoLabel label="Top Up Reserve" tooltipKey="topUpReserve" />
      </h3>
      <p className="mb-4 text-sm text-app-muted">
        Transfer USDC into the vault without minting shares.
      </p>
      <Input
        type="number"
        placeholder="USDC amount"
        value={amount}
        data-testid="reserve-topup-amount"
        onChange={(e) => setAmount(e.target.value)}
        className="mb-3"
      />
      <Button
        size="sm"
        disabled={!address || parsedAmount === 0n || isProcessing}
        data-testid="reserve-topup-submit"
        onClick={() => {
          if (needsApproval) {
            approve(usdc, vault, parsedAmount);
            showToast("pending", "Approving USDC...");
            return;
          }
          topUpReserve(vault, parsedAmount);
          showToast("pending", "Topping up reserve...");
        }}
      >
        {isProcessing ? "Processing..." : needsApproval ? "Approve USDC" : "Top Up Reserve"}
      </Button>
    </Card>
  );
}
