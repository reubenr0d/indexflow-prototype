"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { showToast } from "@/components/ui/toast";
import { useMaxPerpAllocation, useSetMaxPerpAllocation } from "@/hooks/useBasketVault";
import { formatUSDC, parseUSDCInput } from "@/lib/format";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { type Address } from "viem";

export function MaxPerpAllocationCard({ vault }: { vault: Address }) {
  const [amount, setAmount] = useState("");
  const { data: currentCap } = useMaxPerpAllocation(vault);
  const { setMaxPerpAllocation, receipt, isPending, error, isError } = useSetMaxPerpAllocation();

  const capValue = currentCap as bigint | undefined;

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Max perp allocation updated");
      setAmount("");
    }
  }, [receipt.isSuccess]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Max perp allocation update failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-base font-semibold text-app-text">
        <InfoLabel label="Max Perp Allocation" tooltipKey="maxPerpAllocation" />
      </h3>
      <p className="mb-4 text-sm text-app-muted">
        Current:{" "}
        {capValue === undefined
          ? "--"
          : capValue === 0n
            ? "Unlimited"
            : formatUSDC(capValue)}
      </p>
      <Input
        type="number"
        placeholder="USDC cap (0 = unlimited)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mb-3"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!amount || isPending}
          onClick={() => {
            setMaxPerpAllocation(vault, parseUSDCInput(amount));
            showToast("pending", "Setting cap...");
          }}
        >
          Set Cap
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setMaxPerpAllocation(vault, 0n);
            showToast("pending", "Removing cap...");
          }}
        >
          Clear
        </Button>
      </div>
    </Card>
  );
}
