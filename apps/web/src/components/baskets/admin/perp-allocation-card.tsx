"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { showToast } from "@/components/ui/toast";
import { BasketVaultABI } from "@/abi/contracts";
import { formatUSDC, parseUSDCInput } from "@/lib/format";
import { useWaitForTransactionReceipt } from "wagmi";
import { useSponsoredWriteContract } from "@/hooks/useSponsoredWriteContract";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { usePostTxRefresh } from "@/hooks/usePostTxRefresh";
import { type Address } from "viem";

export function PerpAllocationCard({
  vault,
  currentAllocation,
  availableToDeposit,
}: {
  vault: Address;
  currentAllocation: bigint;
  availableToDeposit: bigint;
}) {
  const [amount, setAmount] = useState("");
  const refreshAfterTx = usePostTxRefresh();
  const { writeContract, data: hash, isPending, error, isError } = useSponsoredWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Allocation updated");
      refreshAfterTx();
    }
  }, [receipt.isSuccess, refreshAfterTx]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Perp allocation update failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-base font-semibold text-app-text">
        <InfoLabel label="Perp Allocation" tooltipKey="perpAllocation" />
      </h3>
      <p className="text-sm text-app-muted">Current: {formatUSDC(currentAllocation)}</p>
      <p className="mb-4 text-sm text-app-muted">Available to Deposit: {formatUSDC(availableToDeposit)}</p>
      <Input
        type="number"
        placeholder="USDC amount"
        value={amount}
        data-testid="perp-allocation-amount"
        onChange={(e) => setAmount(e.target.value)}
        className="mb-3"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!amount || isPending}
          data-testid="perp-allocate-submit"
          onClick={() => {
            writeContract({
              address: vault,
              abi: BasketVaultABI,
              functionName: "allocateToPerp",
              args: [parseUSDCInput(amount)],
            });
            showToast("pending", "Allocating...");
          }}
        >
          Allocate
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!amount || isPending}
          data-testid="perp-withdraw-submit"
          onClick={() => {
            writeContract({
              address: vault,
              abi: BasketVaultABI,
              functionName: "withdrawFromPerp",
              args: [parseUSDCInput(amount)],
            });
            showToast("pending", "Withdrawing...");
          }}
        >
          Withdraw
        </Button>
      </div>
    </Card>
  );
}
