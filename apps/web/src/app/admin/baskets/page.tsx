"use client";

import { useState } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllBaskets, useCreateBasket } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch } from "@/hooks/usePerpReader";
import { useSupportedOracleAssets } from "@/hooks/useOracle";
import { formatUSDC, formatAddress } from "@/lib/format";
import { showToast } from "@/components/ui/toast";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { type Address } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";

export default function AdminBasketsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: baskets, isLoading } = useAllBaskets();
  const vaultAddresses = (baskets as unknown as Address[]) ?? [];
  const { data: basketInfos } = useBasketInfoBatch(vaultAddresses);

  const infos = (basketInfos as unknown as Array<{
    vault: Address;
    name: string;
    usdcBalance: bigint;
    perpAllocated: bigint;
    assetCount: bigint;
  }>) ?? [];

  return (
    <PageWrapper>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">
          Basket Management
        </h1>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {showCreate ? "Cancel" : "Create Basket"}
        </Button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-8 overflow-hidden"
          >
            <CreateBasketForm onSuccess={() => setShowCreate(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <Card>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-app-border px-6 py-4 last:border-0">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-app-border">
            <div className="flex items-center gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wider text-app-muted">
              <span className="flex-1">Name</span>
              <span className="w-24 text-right">TVL</span>
              <span className="w-16 text-right">Assets</span>
              <span className="w-24 text-right">Perp</span>
              <span className="w-20 text-right">Address</span>
            </div>
            {infos.map((info) => (
              <Link key={info.vault} href={`/admin/baskets/${info.vault}`}>
                <div className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-app-surface-hover">
                  <span className="flex-1 font-medium text-app-text">
                    {info.name || "Basket"}
                  </span>
                  <span className="w-24 text-right text-sm text-app-muted">
                    {formatUSDC((info.usdcBalance ?? 0n) + (info.perpAllocated ?? 0n))}
                  </span>
                  <span className="w-16 text-right text-sm text-app-muted">
                    {String(info.assetCount ?? 0n)}
                  </span>
                  <span className="w-24 text-right text-sm text-app-muted">
                    {formatUSDC(info.perpAllocated ?? 0n)}
                  </span>
                  <span className="w-20 text-right font-mono text-xs text-app-muted">
                    {formatAddress(info.vault)}
                  </span>
                </div>
              </Link>
            ))}
            {infos.length === 0 && (
              <div className="px-6 py-8 text-center text-sm text-app-muted">
                No baskets created yet.
              </div>
            )}
          </div>
        </Card>
      )}
    </PageWrapper>
  );
}

function CreateBasketForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [assets, setAssets] = useState<Array<{ assetIdHex: `0x${string}` | ""; assetQuery: string; weight: string }>>([
    { assetIdHex: "", assetQuery: "", weight: "" },
  ]);
  const [depositFee, setDepositFee] = useState("10");
  const [redeemFee, setRedeemFee] = useState("10");

  const { createBasket, receipt, isPending } = useCreateBasket();
  const { data: supportedAssets, isLoading: supportedAssetsLoading } = useSupportedOracleAssets();

  const totalWeight = assets.reduce((sum, a) => sum + (parseInt(a.weight) || 0), 0);
  const selectedAssets = assets.map((a) => a.assetIdHex).filter((id): id is `0x${string}` => id !== "");
  const hasDuplicateAssets = new Set(selectedAssets).size !== selectedAssets.length;
  const hasEmptyAssetSelection = assets.some((a) => a.assetIdHex === "");
  const noSupportedAssets = !supportedAssetsLoading && supportedAssets.length === 0;

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Basket created");
      onSuccess();
    }
  }, [receipt.isSuccess, onSuccess]);

  const handleSubmit = () => {
    if (!name || totalWeight !== 10000 || hasEmptyAssetSelection || hasDuplicateAssets || noSupportedAssets) return;

    const assetIds = assets.map((a) => a.assetIdHex as `0x${string}`);
    const weights = assets.map((a) => BigInt(a.weight));
    createBasket(name, assetIds, weights, BigInt(depositFee), BigInt(redeemFee));
    showToast("pending", "Creating basket...");
  };

  return (
    <Card className="p-6">
      <h2 className="mb-6 text-lg font-semibold text-app-text">Create New Basket</h2>

      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-app-muted">Basket Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mining Majors" />
      </div>

      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-app-muted">Assets & Weights (bps)</label>
        {assets.map((asset, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <datalist id={`supported-assets-${i}`}>
              {supportedAssets
                .filter((option) => {
                  const isCurrent = option.idHex === asset.assetIdHex;
                  const selectedElsewhere = selectedAssets.includes(option.idHex) && !isCurrent;
                  return !selectedElsewhere;
                })
                .map((option) => (
                  <option key={option.idHex} value={option.label}>
                    {option.idHex}
                  </option>
                ))}
            </datalist>
            <Input
              list={`supported-assets-${i}`}
              placeholder={supportedAssetsLoading ? "Loading supported assets..." : "Select supported asset"}
              value={asset.assetQuery}
              onChange={(e) => {
                const query = e.target.value;
                const match = supportedAssets.find(
                  (option) =>
                    option.label.toLowerCase() === query.toLowerCase() ||
                    option.idHex.toLowerCase() === query.toLowerCase()
                );
                const next = [...assets];
                if (match) {
                  const selectedElsewhere = next.some((row, rowIndex) => rowIndex !== i && row.assetIdHex === match.idHex);
                  if (selectedElsewhere) {
                    next[i] = { ...next[i], assetIdHex: "", assetQuery: query };
                  } else {
                    next[i] = { ...next[i], assetIdHex: match.idHex, assetQuery: match.label };
                  }
                } else {
                  next[i] = { ...next[i], assetIdHex: "", assetQuery: query };
                }
                setAssets(next);
              }}
              onBlur={() => {
                if (assets[i].assetIdHex !== "") return;
                const next = [...assets];
                next[i] = { ...next[i], assetQuery: "" };
                setAssets(next);
              }}
              disabled={supportedAssetsLoading || noSupportedAssets}
              className="flex-1"
            />
            <Input
              type="number"
              placeholder="Weight (bps)"
              value={asset.weight}
              onChange={(e) => {
                const next = [...assets];
                next[i] = { ...next[i], weight: e.target.value };
                setAssets(next);
              }}
              className="w-32"
            />
            {assets.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAssets(assets.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAssets([...assets, { assetIdHex: "", assetQuery: "", weight: "" }])}
            disabled={supportedAssetsLoading || noSupportedAssets}
          >
            <Plus className="mr-1 h-3 w-3" /> Add Asset
          </Button>
          <span className={`text-sm font-medium ${totalWeight === 10000 ? "text-app-success" : "text-app-danger"}`}>
            {totalWeight} / 10,000 bps
          </span>
        </div>
        {hasDuplicateAssets && (
          <p className="mt-2 text-xs text-app-danger">Duplicate assets are not allowed.</p>
        )}
        {noSupportedAssets && (
          <p className="mt-2 text-xs text-app-danger">No active supported assets found in the oracle.</p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Deposit Fee (bps)</label>
          <Input type="number" value={depositFee} onChange={(e) => setDepositFee(e.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Redeem Fee (bps)</label>
          <Input type="number" value={redeemFee} onChange={(e) => setRedeemFee(e.target.value)} />
        </div>
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={!name || totalWeight !== 10000 || hasEmptyAssetSelection || hasDuplicateAssets || isPending || supportedAssetsLoading || noSupportedAssets}
        onClick={handleSubmit}
      >
        {isPending ? "Creating..." : "Create Basket"}
      </Button>
    </Card>
  );
}
