"use client";

import { useEffect, useMemo, useState } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { StatusDot, getOracleStatus } from "@/components/ui/status-dot";
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { OracleAdapterABI } from "@/abi/contracts";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import {
  useOracleAssetPrice,
  useOracleIsStale,
  useOracleAssetConfig,
  useOracleAssetLabelMap,
  useSupportedOracleAssets,
  getOracleSourceLabel,
} from "@/hooks/useOracle";
import { formatPrice, formatRelativeTime, formatAssetId } from "@/lib/format";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { showToast } from "@/components/ui/toast";
import { motion } from "framer-motion";
import { Radio } from "lucide-react";

const PRICE_SYNC_ABI = [
  {
    type: "function",
    name: "syncAll",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

export default function AdminOraclePage() {
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter, priceSync } = getContracts(chainId);

  const { data: assetCount, isLoading } = useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getAssetCount",
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  const count = assetCount ? Number(assetCount) : 0;
  const { data: assetLabels } = useOracleAssetLabelMap();
  const { data: supportedAssets, isLoading: supportedAssetsLoading } = useSupportedOracleAssets();

  const [assetInput, setAssetInput] = useState("");
  const [priceInput, setPriceInput] = useState("");

  const selectedAsset = useMemo(
    () =>
      (supportedAssets ?? []).find(
        (asset) =>
          asset.label.toLowerCase() === assetInput.trim().toLowerCase() ||
          asset.idHex.toLowerCase() === assetInput.trim().toLowerCase()
      ),
    [assetInput, supportedAssets]
  );

  const {
    writeContract: submitPriceWrite,
    data: submitPriceHash,
    isPending: isSubmitPricePending,
    error: submitPriceError,
    isError: isSubmitPriceError,
  } = useWriteContract();
  const submitPriceReceipt = useWaitForTransactionReceipt({ hash: submitPriceHash });

  const {
    writeContract: syncAllWrite,
    data: syncAllHash,
    isPending: isSyncAllPending,
    error: syncAllError,
    isError: isSyncAllError,
  } = useWriteContract();
  const syncAllReceipt = useWaitForTransactionReceipt({ hash: syncAllHash });

  useEffect(() => {
    if (submitPriceReceipt.isSuccess) {
      showToast("success", "Oracle price submitted");
      setPriceInput("");
    }
  }, [submitPriceReceipt.isSuccess]);

  useEffect(() => {
    if (syncAllReceipt.isSuccess) {
      showToast("success", "Price sync complete");
    }
  }, [syncAllReceipt.isSuccess]);

  useContractErrorToast({
    writeError: submitPriceError,
    writeIsError: isSubmitPriceError,
    receiptError: submitPriceReceipt.error,
    receiptIsError: submitPriceReceipt.isError,
    fallbackMessage: "Oracle price submit failed",
  });
  useContractErrorToast({
    writeError: syncAllError,
    writeIsError: isSyncAllError,
    receiptError: syncAllReceipt.error,
    receiptIsError: syncAllReceipt.isError,
    fallbackMessage: "Oracle sync failed",
  });

  const parsedPrice = useMemo(() => {
    if (!priceInput.trim()) return undefined;
    if (!/^\d+(\.\d{1,8})?$/.test(priceInput.trim())) return undefined;
    const [whole, fracRaw = ""] = priceInput.trim().split(".");
    const frac = fracRaw.padEnd(8, "0");
    return BigInt(whole) * 100_000_000n + BigInt(frac);
  }, [priceInput]);
  const canSubmitPrice = Boolean(selectedAsset?.idHex && parsedPrice && parsedPrice > 0n && !isSubmitPricePending);
  const canSyncAll = Boolean(priceSync && priceSync !== "0x0000000000000000000000000000000000000000" && !isSyncAllPending);

  return (
    <PageWrapper>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-app-text">
            Oracle Status
          </h1>
          <p className="mt-1 text-sm text-app-muted">{count} assets configured</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-app-border bg-app-accent-dim px-3 py-1.5">
          <Radio className="h-3 w-3 text-app-accent" />
          <span className="text-xs font-semibold uppercase tracking-wide text-app-accent">Monitoring</span>
        </div>
      </div>

      <Card className="mb-6 p-6">
        <h2 className="mb-2 text-base font-semibold text-app-text">
          <InfoLabel label="Oracle Write Controls" tooltip="Submit custom oracle prices and sync them to GMX price feed." />
        </h2>
        <p className="mb-4 text-sm text-app-muted">
          Use for relayer-fed assets (8 decimal raw price inputs, e.g. `2600` or `2600.50000000`).
        </p>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
          <Input
            list="oracle-assets-list"
            placeholder="Asset label or id"
            value={assetInput}
            onChange={(e) => setAssetInput(e.target.value)}
            data-testid="oracle-asset-input"
            disabled={supportedAssetsLoading}
          />
          <datalist id="oracle-assets-list">
            {(supportedAssets ?? []).map((asset) => (
              <option key={asset.idHex} value={asset.label}>
                {asset.idHex}
              </option>
            ))}
          </datalist>
          <Input
            placeholder="Price (8 decimals)"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            data-testid="oracle-price-input"
          />
          <Button
            onClick={() => {
              if (!selectedAsset || !parsedPrice) return;
              submitPriceWrite({
                address: oracleAdapter,
                abi: OracleAdapterABI,
                functionName: "submitPrice",
                args: [selectedAsset.idHex, parsedPrice],
              });
              showToast("pending", "Submitting oracle price...");
            }}
            disabled={!canSubmitPrice}
            data-testid="oracle-submit-price"
          >
            {isSubmitPricePending ? "Submitting..." : "Submit Price"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (!canSyncAll) return;
              syncAllWrite({
                address: priceSync,
                abi: PRICE_SYNC_ABI,
                functionName: "syncAll",
              });
              showToast("pending", "Syncing prices...");
            }}
            disabled={!canSyncAll}
            data-testid="oracle-sync-all"
          >
            {isSyncAllPending ? "Syncing..." : "Sync All"}
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="mb-2 h-5 w-20" />
              <Skeleton className="mb-4 h-8 w-28" />
              <Skeleton className="h-4 w-24" />
            </Card>
          ))}
        </div>
      ) : count > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: count }).map((_, i) => (
            <OracleAssetCard key={i} index={i} assetLabels={assetLabels} />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-lg font-medium text-app-muted">No oracle assets configured</p>
        </div>
      )}
    </PageWrapper>
  );
}

function OracleAssetCard({
  index,
  assetLabels,
}: {
  index: number;
  assetLabels: Map<`0x${string}`, string>;
}) {
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter } = getContracts(chainId);

  const { data: assetId } = useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "assetList",
    args: [BigInt(index)],
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  const id = assetId as `0x${string}` | undefined;
  const zeroBytes32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
  const queryId = id ?? zeroBytes32;

  const { data: priceData } = useOracleAssetPrice(queryId);
  const { data: isStale } = useOracleIsStale(queryId);
  const { data: config } = useOracleAssetConfig(queryId);

  if (!id) return null;

  const price = (priceData as [bigint, bigint] | undefined)?.[0] ?? 0n;
  const timestamp = Number((priceData as [bigint, bigint] | undefined)?.[1] ?? 0n);
  const status = getOracleStatus(isStale as boolean ?? false, timestamp);

  const assetConfig = config as {
    feedAddress: `0x${string}`;
    feedType: number;
    stalenessThreshold: bigint;
    deviationBps: bigint;
    decimals: number;
    active: boolean;
  } | undefined;

  const feedTypeName = getOracleSourceLabel(assetConfig?.feedType);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card className={`p-6 ring-2 ${
        status === "stale" ? "ring-app-danger/50" :
        status === "aging" ? "ring-app-warning/50" :
        "ring-app-success/40"
      }`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusDot status={status} className="h-2.5 w-2.5" />
            <h3 className="font-semibold text-app-text">
              <InfoLabel
                label={assetLabels.get(id) ?? formatAssetId(id)}
                tooltip="Oracle asset currently monitored for freshness and price health."
              />
            </h3>
          </div>
          <span className="rounded-md bg-app-bg-subtle px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-app-muted">
            {feedTypeName}
          </span>
        </div>

        <p className="text-2xl font-semibold tracking-tight text-app-text">
          {formatPrice(price)}
        </p>

        <div className="mt-3 space-y-1 text-xs text-app-muted">
          <p>Updated: {timestamp > 0 ? formatRelativeTime(timestamp) : "never"}</p>
          {assetConfig && (
            <>
              <p>Staleness: {String(assetConfig.stalenessThreshold)}s</p>
              <p>Deviation: {Number(assetConfig.deviationBps) / 100}%</p>
            </>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
