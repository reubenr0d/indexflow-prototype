"use client";

import { useState, useMemo, useEffect } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useVaultStateBatch } from "@/hooks/usePerpReader";
import { useBasketsOverviewQuery } from "@/hooks/subgraph/useBasketOverview";
import { formatUSDC, formatAddress, formatBps } from "@/lib/format";
import { computeBlendedComposition } from "@/lib/blendedComposition";
import { showToast } from "@/components/ui/toast";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { AdminBasketsHeaderRow } from "@/components/baskets/admin-baskets-header";
import { Plus, X, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { type Address } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import {
  useCreateMultichainBasket,
  defaultSpokeTargetsForHub,
  type CreateBasketChainStatus,
} from "@/hooks/useCreateMultichainBasket";
import { deploymentLabel, type DeploymentTarget } from "@/lib/deployment";

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

function statusLabel(status: CreateBasketChainStatus): string {
  switch (status) {
    case "idle":
      return "Pending";
    case "creating":
      return "Creating basket…";
    case "wiring_state_relay":
      return "Wiring StateRelay…";
    case "wiring_assets":
      return "Wiring stub asset…";
    case "success":
      return "Done";
    case "skipped":
      return "Skipped";
    case "error":
      return "Failed";
  }
}

function StatusIcon({ status }: { status: CreateBasketChainStatus }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden />;
  if (status === "error") return <XCircle className="h-4 w-4 text-red-500" aria-hidden />;
  if (status === "skipped") return <XCircle className="h-4 w-4 text-app-muted" aria-hidden />;
  if (status === "idle") return <div className="h-4 w-4 rounded-full border border-app-border" aria-hidden />;
  return <Loader2 className="h-4 w-4 animate-spin text-app-text" aria-hidden />;
}

function CreateBasketForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [depositFee, setDepositFee] = useState("10");
  const [redeemFee, setRedeemFee] = useState("10");

  const { target: hubTarget, configuredTargets } = useDeploymentTarget();
  const eligibleSpokes = useMemo(
    () => defaultSpokeTargetsForHub(hubTarget),
    [hubTarget],
  );
  // Defaults to "every eligible spoke selected". The user can deselect any
  // spoke via the checkbox row, and the deselection is tracked separately so
  // we don't need an effect to reset selection when `hubTarget` changes — the
  // selected set is fully derived from `eligibleSpokes - deselectedSpokes`.
  const [deselectedSpokes, setDeselectedSpokes] = useState<Set<DeploymentTarget>>(
    () => new Set(),
  );
  const selectedSpokes = useMemo(
    () => new Set(eligibleSpokes.filter((s) => !deselectedSpokes.has(s))),
    [eligibleSpokes, deselectedSpokes],
  );

  const { state, createMultichainBasket, reset } = useCreateMultichainBasket();

  const toggleSpoke = (target: DeploymentTarget) => {
    setDeselectedSpokes((prev) => {
      const next = new Set(prev);
      if (next.has(target)) next.delete(target);
      else next.add(target);
      return next;
    });
  };

  useEffect(() => {
    if (!state.isExecuting && state.entries.length > 0 && !state.hasErrors) {
      showToast(
        "success",
        state.entries.length > 1
          ? `Basket created on ${state.entries.length} chain${state.entries.length === 1 ? "" : "s"}`
          : "Basket created",
      );
      onSuccess();
      reset();
    }
  }, [state.isExecuting, state.entries.length, state.hasErrors, onSuccess, reset]);

  useEffect(() => {
    if (!state.isExecuting && state.hasErrors && state.entries.length > 0) {
      const failed = state.entries.filter((e) => e.status === "error");
      const firstError = failed[0];
      const detail = firstError?.error ? `: ${firstError.error.slice(0, 160)}` : "";
      const failedLabel = failed.map((e) => e.label).join(", ");
      showToast(
        "error",
        `Basket creation failed on ${failedLabel}${detail}`,
      );
    }
  }, [state.isExecuting, state.hasErrors, state.entries]);

  const handleSubmit = async () => {
    if (!name) return;
    showToast("pending", "Creating basket…");
    await createMultichainBasket({
      name,
      depositFeeBps: BigInt(depositFee),
      redeemFeeBps: BigInt(redeemFee),
      hubTarget,
      spokeTargets: Array.from(selectedSpokes),
    });
  };

  const isMultiChain = configuredTargets.length > 1;

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

      {isMultiChain && eligibleSpokes.length > 0 && (
        <div
          className="mb-6 rounded-md border border-app-border bg-app-surface/40 p-4"
          data-testid="admin-create-basket-chains"
        >
          <div className="mb-2 text-sm font-medium text-app-muted">
            <InfoLabel label="Also deploy twin baskets on" tooltipKey="createNewBasket" />
          </div>
          <p className="mb-3 text-xs text-app-muted">
            Twin baskets on spoke chains have the same name so the multi-chain
            deposit drawer can route a fraction of every deposit to each
            chain. Spokes are wired with <code className="text-[10px]">setStateRelay</code>{" "}
            and a stub <code className="text-[10px]">setAssets([keccak256(&quot;USDC&quot;)])</code> so they accept
            deposits immediately.
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-app-text opacity-60">
              <input
                type="checkbox"
                checked
                disabled
                className="h-4 w-4 accent-current"
                data-testid="admin-create-basket-hub-check"
              />
              {deploymentLabel(hubTarget)} <span className="text-xs text-app-muted">(hub — required)</span>
            </label>
            {eligibleSpokes.map((spoke) => (
              <label key={spoke} className="flex items-center gap-2 text-sm text-app-text">
                <input
                  type="checkbox"
                  checked={selectedSpokes.has(spoke)}
                  onChange={() => toggleSpoke(spoke)}
                  className="h-4 w-4 accent-current"
                  data-testid={`admin-create-basket-spoke-${spoke}`}
                />
                {deploymentLabel(spoke)}
                <span className="text-xs text-app-muted">(spoke twin)</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {state.entries.length > 0 && (
        <div
          className="mb-6 space-y-2 rounded-md border border-app-border bg-app-surface/40 p-4"
          data-testid="admin-create-basket-progress"
        >
          <div className="text-sm font-medium text-app-muted">Deployment progress</div>
          {state.entries.map((entry) => (
            <div
              key={entry.target}
              className="flex items-center justify-between text-sm"
              data-testid={`admin-create-basket-entry-${entry.target}`}
            >
              <div className="flex items-center gap-2">
                <StatusIcon status={entry.status} />
                <span className="text-app-text">{entry.label}</span>
                {entry.isHub && <span className="text-xs text-app-muted">(hub)</span>}
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-app-muted">{statusLabel(entry.status)}</span>
                {entry.vaultAddress && (
                  <span className="font-mono text-[10px] text-app-muted">
                    {formatAddress(entry.vaultAddress)}
                  </span>
                )}
                {entry.error && (
                  <span className="max-w-[260px] truncate text-[10px] text-red-500" title={entry.error}>
                    {entry.error}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={!name || state.isExecuting}
        onClick={handleSubmit}
        data-testid="admin-create-basket-submit"
      >
        {state.isExecuting
          ? "Creating…"
          : isMultiChain
            ? `Create on ${1 + selectedSpokes.size} chain${1 + selectedSpokes.size === 1 ? "" : "s"}`
            : "Create Basket"}
      </Button>
    </Card>
  );
}
