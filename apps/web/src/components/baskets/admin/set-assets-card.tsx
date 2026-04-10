"use client";

import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { showToast } from "@/components/ui/toast";
import { useSupportedOracleAssets } from "@/hooks/useOracle";
import { useSetAssets } from "@/hooks/useBasketVault";
import { YahooFinanceSearch, type YFSearchSelection } from "@/components/yahoo-finance-search";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { usePostTxRefresh } from "@/hooks/usePostTxRefresh";
import { keccak256, stringToHex, type Address } from "viem";

export function SetAssetsCard({ vault }: { vault: Address }) {
  const refreshAfterTx = usePostTxRefresh();
  const { data: supportedAssets } = useSupportedOracleAssets();
  const supported = supportedAssets ?? [];
  const { setAssets, receipt, isPending, error, isError } = useSetAssets();
  const [rows, setRows] = useState<Array<{ assetIdHex: `0x${string}` | ""; assetQuery: string; unregisteredSymbol?: string }>>([
    { assetIdHex: "", assetQuery: "" },
  ]);

  const selectedAssets = rows.map((row) => row.assetIdHex).filter((id): id is `0x${string}` => id !== "");
  const hasDuplicateAssets = new Set(selectedAssets).size !== selectedAssets.length;
  const hasEmptyAssetSelection = rows.some((row) => row.assetIdHex === "");
  const excludeIds = useMemo(() => new Set(selectedAssets), [selectedAssets]);

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Assets updated");
      refreshAfterTx();
    }
  }, [receipt.isSuccess, refreshAfterTx]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Set assets failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-base font-semibold text-app-text">
        <InfoLabel label="Set Assets" tooltipKey="setAssets" />
      </h3>
      {rows.map((row, i) => (
        <div key={i} className="mb-2">
          <div className="flex gap-2">
            <YahooFinanceSearch
              className="flex-1"
              value={row.assetQuery}
              placeholder="Search registered or Yahoo Finance assets"
              data-testid={`set-assets-input-${i}`}
              registeredAssets={supported}
              excludeIds={excludeIds}
              onSelectRegistered={(asset) => {
                const next = [...rows];
                next[i] = { assetIdHex: asset.idHex, assetQuery: asset.label, unregisteredSymbol: undefined };
                setRows(next);
              }}
              onSelect={(result: YFSearchSelection) => {
                const candidateId = keccak256(stringToHex(result.symbol)) as `0x${string}`;
                const existing = supported.find((a) => a.idHex.toLowerCase() === candidateId.toLowerCase());
                const next = [...rows];
                if (existing) {
                  next[i] = { assetIdHex: existing.idHex, assetQuery: existing.label, unregisteredSymbol: undefined };
                } else {
                  next[i] = { assetIdHex: "", assetQuery: result.symbol, unregisteredSymbol: result.symbol };
                }
                setRows(next);
              }}
            />
            {rows.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
              >
                Remove
              </Button>
            )}
          </div>
          {row.unregisteredSymbol && (
            <p className="mt-1 text-xs text-app-warning">
              {row.unregisteredSymbol} is not registered on-chain.{" "}
              <a href="/admin/oracle" className="underline">Register it first</a> on the Assets page.
            </p>
          )}
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRows([...rows, { assetIdHex: "", assetQuery: "" }])}
        >
          Add Asset
        </Button>
      </div>
      {hasDuplicateAssets && <p className="mt-2 text-xs text-app-danger">Duplicate assets are not allowed.</p>}
      <Button
        size="sm"
        className="mt-4"
        disabled={isPending || hasEmptyAssetSelection || hasDuplicateAssets}
        data-testid="set-assets-submit"
        onClick={() => {
          const assetIds = rows.map((row) => row.assetIdHex as `0x${string}`);
          setAssets(vault, assetIds);
          showToast("pending", "Updating assets...");
        }}
      >
        {isPending ? "Processing..." : "Set Assets"}
      </Button>
    </Card>
  );
}
