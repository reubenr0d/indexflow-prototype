"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { showToast } from "@/components/ui/toast";
import { useMinReserveBps, useSetMinReserveBps } from "@/hooks/useBasketVault";
import { formatBps } from "@/lib/format";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { type Address } from "viem";

export function ReservePolicyCard({ vault }: { vault: Address }) {
  const [bpsInput, setBpsInput] = useState("");
  const { data: currentBps } = useMinReserveBps(vault);
  const { setMinReserveBps, receipt, isPending, error, isError } = useSetMinReserveBps();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Reserve policy updated");
    }
  }, [receipt.isSuccess]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Reserve policy update failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-base font-semibold text-app-text">
        <InfoLabel label="Reserve Policy" tooltipKey="reservePolicy" />
      </h3>
      <p className="mb-4 text-sm text-app-muted">
        Current target: {formatBps((currentBps as bigint | undefined) ?? 0n)}
      </p>
      <Input
        type="number"
        min="0"
        max="10000"
        placeholder="BPS (0 - 10000)"
        value={bpsInput}
        data-testid="reserve-target-input"
        onChange={(e) => setBpsInput(e.target.value)}
        className="mb-3"
      />
      <Button
        size="sm"
        disabled={!bpsInput || isPending}
        data-testid="reserve-target-submit"
        onClick={() => {
          setMinReserveBps(vault, BigInt(bpsInput));
          showToast("pending", "Updating reserve policy...");
        }}
      >
        Set Reserve Target
      </Button>
    </Card>
  );
}
