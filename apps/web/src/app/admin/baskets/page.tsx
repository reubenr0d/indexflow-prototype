"use client";

import { useState, useMemo, useEffect } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllBaskets, useCreateBasket } from "@/hooks/useBasketFactory";
import { useVaultStateBatch } from "@/hooks/usePerpReader";
import { useBasketsOverviewQuery } from "@/hooks/subgraph/useBasketOverview";
import { formatUSDC, formatAddress, formatBps } from "@/lib/format";
import { computeBlendedComposition } from "@/lib/blendedComposition";
import { showToast } from "@/components/ui/toast";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { AdminBasketsHeaderRow } from "@/components/baskets/admin-baskets-header";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { type Address } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";

export default function AdminBasketsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const subgraph = useBasketsOverviewQuery({ first: 500, skip: 0 });
  const { data: baskets } = useAllBaskets();
  const vaultAddresses = useMemo(() => (baskets as unknown as Address[]) ?? [], [baskets]);
  const { data: vaultStates } = useVaultStateBatch(vaultAddresses);

  const subgraphData = useMemo(
    () => (Array.isArray(subgraph.data) ? subgraph.data : []),
    [subgraph.data]
  );
  const isLoading = subgraph.isLoading;

  const infos = useMemo(
    () =>
      subgraphData.map((item) => ({
        vault: item.vault,
        name: item.name,
        usdcBalance: item.usdcBalance,
        perpAllocated: item.perpAllocated,
        assetCount: item.assetCount,
      })),
    [subgraphData]
  );

  const openInterestByVault = useMemo(() => {
    const states = (vaultStates as Array<{ result?: { openInterest: bigint }; status: string }> | undefined) ?? [];
    return new Map(
      vaultAddresses.map((vault, i) => [
        vault,
        states[i]?.status === "success" ? states[i]?.result?.openInterest ?? 0n : 0n,
      ])
    );
  }, [vaultAddresses, vaultStates]);

  return (
    <PageWrapper>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">
          Basket Management
        </h1>
        <Button onClick={() => setShowCreate(!showCreate)} data-testid="admin-create-basket-toggle">
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
            <AdminBasketsHeaderRow />
            {infos.map((info) => (
              <Link key={info.vault} href={`/admin/baskets/${info.vault}`}>
                <div className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-app-surface-hover">
                  <span className="flex-1 font-medium text-app-text">
                    <InfoLabel label={info.name || "Basket"} tooltipKey="tableName" />
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
                  <span className="w-20 text-right text-sm text-app-muted">
                    {formatBps(
                      computeBlendedComposition(
                        info.usdcBalance ?? 0n,
                        info.perpAllocated ?? 0n,
                        openInterestByVault.get(info.vault as Address) ?? 0n,
                        []
                      ).perpBlendBps
                    )}
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
  const [depositFee, setDepositFee] = useState("10");
  const [redeemFee, setRedeemFee] = useState("10");

  const { createBasket, receipt, isPending, error, isError } = useCreateBasket();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Basket created");
      onSuccess();
    }
  }, [receipt.isSuccess, onSuccess]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Basket creation failed",
  });

  const handleSubmit = () => {
    if (!name) return;
    createBasket(name, BigInt(depositFee), BigInt(redeemFee));
    showToast("pending", "Creating basket...");
  };

  return (
    <Card className="p-6">
      <h2 className="mb-6 text-lg font-semibold text-app-text">
        <InfoLabel label="Create New Basket" tooltipKey="createNewBasket" />
      </h2>

      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-app-muted">Basket Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mining Majors"
          data-testid="admin-create-basket-name"
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Deposit Fee (bps)</label>
          <Input
            type="number"
            value={depositFee}
            onChange={(e) => setDepositFee(e.target.value)}
            data-testid="admin-create-basket-deposit-fee"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Redeem Fee (bps)</label>
          <Input
            type="number"
            value={redeemFee}
            onChange={(e) => setRedeemFee(e.target.value)}
            data-testid="admin-create-basket-redeem-fee"
          />
        </div>
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={!name || isPending}
        onClick={handleSubmit}
        data-testid="admin-create-basket-submit"
      >
        {isPending ? "Creating..." : "Create Basket"}
      </Button>
    </Card>
  );
}
