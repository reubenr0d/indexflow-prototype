"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { showToast } from "@/components/ui/toast";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { BasketVaultABI } from "@/abi/contracts";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { usePostTxRefresh } from "@/hooks/usePostTxRefresh";
import { type Address } from "viem";

export function FeeCollectionCard({ vault }: { vault: Address }) {
  const refreshAfterTx = usePostTxRefresh();
  const { writeContract, data: hash, isPending, error, isError } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [recipient, setRecipient] = useState("");

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Fees collected");
      refreshAfterTx();
    }
  }, [receipt.isSuccess, refreshAfterTx]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Fee collection failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-base font-semibold text-app-text">
        <InfoLabel label="Collect Fees" tooltipKey="collectFees" />
      </h3>
      <Input
        placeholder="Recipient address"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        className="mb-3"
      />
      <Button
        size="sm"
        disabled={!recipient || isPending}
        onClick={() => {
          writeContract({
            address: vault,
            abi: BasketVaultABI,
            functionName: "collectFees",
            args: [recipient as Address],
          });
          showToast("pending", "Collecting fees...");
        }}
      >
        Collect Fees
      </Button>
    </Card>
  );
}
