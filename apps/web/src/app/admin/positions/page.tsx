"use client";

import { useState, useEffect } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch, useVaultState } from "@/hooks/usePerpReader";
import { useOpenPosition, useClosePosition } from "@/hooks/useVaultAccounting";
import { formatUSDC, formatAddress, parseUSDCInput } from "@/lib/format";
import { showToast } from "@/components/ui/toast";
import { type Address } from "viem";
import { stringToHex } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, ChevronDown } from "lucide-react";

export default function AdminPositionsPage() {
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);

  const { data: baskets, isLoading } = useAllBaskets();
  const vaultAddresses = (baskets as unknown as Address[]) ?? [];
  const { data: basketInfos } = useBasketInfoBatch(vaultAddresses);

  const infos = (basketInfos as unknown as Array<{
    vault: Address;
    name: string;
  }>) ?? [];

  return (
    <PageWrapper>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">
          Position Management
        </h1>
        <div className="flex gap-2">
          <Button onClick={() => { setShowOpen(!showOpen); setShowClose(false); }}>
            <Plus className="mr-2 h-4 w-4" /> Open Position
          </Button>
          <Button variant="secondary" onClick={() => { setShowClose(!showClose); setShowOpen(false); }}>
            Close Position
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-8 overflow-hidden"
          >
            <OpenPositionForm vaults={infos} onSuccess={() => setShowOpen(false)} />
          </motion.div>
        )}
        {showClose && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-8 overflow-hidden"
          >
            <ClosePositionForm vaults={infos} onSuccess={() => setShowClose(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <h2 className="mb-4 text-lg font-semibold text-app-text">Vault Overview</h2>
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
              <span className="flex-1">Vault</span>
              <span className="w-28 text-right">Deposited</span>
              <span className="w-28 text-right">Realised PnL</span>
              <span className="w-28 text-right">Open Interest</span>
              <span className="w-20 text-right">Positions</span>
            </div>
            {infos.map((info) => (
              <VaultRow key={info.vault} vault={info.vault} name={info.name} />
            ))}
          </div>
        </Card>
      )}
    </PageWrapper>
  );
}

function VaultRow({ vault, name }: { vault: Address; name: string }) {
  const { data } = useVaultState(vault);
  const state = data as {
    depositedCapital: bigint;
    realisedPnL: bigint;
    openInterest: bigint;
    positionCount: bigint;
    registered: boolean;
  } | undefined;

  if (!state?.registered) {
    return (
      <div className="flex items-center gap-4 px-6 py-4 text-app-muted">
        <span className="flex-1">{name || "Basket"}</span>
        <span className="text-sm">Not registered</span>
      </div>
    );
  }

  const pnlColor = state.realisedPnL >= 0n ? "text-app-success" : "text-app-danger";

  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <span className="flex-1 font-medium text-app-text">{name || "Basket"}</span>
      <span className="w-28 text-right text-sm">{formatUSDC(state.depositedCapital)}</span>
      <span className={`w-28 text-right text-sm font-medium ${pnlColor}`}>{formatUSDC(state.realisedPnL)}</span>
      <span className="w-28 text-right text-sm">{formatUSDC(state.openInterest)}</span>
      <span className="w-20 text-right text-sm">{String(state.positionCount)}</span>
    </div>
  );
}

function OpenPositionForm({ vaults, onSuccess }: { vaults: Array<{ vault: Address; name: string }>; onSuccess: () => void }) {
  const [selectedVault, setSelectedVault] = useState("");
  const [asset, setAsset] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [size, setSize] = useState("");
  const [collateral, setCollateral] = useState("");

  const { openPosition, receipt, isPending } = useOpenPosition();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Position opened");
      onSuccess();
    }
  }, [receipt.isSuccess, onSuccess]);

  return (
    <Card className="p-6">
      <h2 className="mb-6 text-lg font-semibold text-app-text">Open Position</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Vault</label>
          <select
            value={selectedVault}
            onChange={(e) => setSelectedVault(e.target.value)}
            className="h-12 w-full rounded-xl border-0 border border-app-border bg-app-bg px-4 text-base text-app-text dark:bg-app-bg-subtle"
          >
            <option value="">Select vault...</option>
            {vaults.map((v) => (
              <option key={v.vault} value={v.vault}>{v.name || formatAddress(v.vault)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Asset ID</label>
          <Input placeholder="e.g. GOLD" value={asset} onChange={(e) => setAsset(e.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Side</label>
          <SegmentedControl
            options={[
              { value: "long", label: "Long" },
              { value: "short", label: "Short" },
            ]}
            value={side}
            onChange={setSide}
            className="w-full"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Size (USDC)</label>
          <Input type="number" placeholder="0.00" value={size} onChange={(e) => setSize(e.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Collateral (USDC)</label>
          <Input type="number" placeholder="0.00" value={collateral} onChange={(e) => setCollateral(e.target.value)} />
        </div>
      </div>
      <Button
        className="mt-6 w-full"
        size="lg"
        disabled={!selectedVault || !asset || !size || !collateral || isPending}
        onClick={() => {
          openPosition(
            selectedVault as Address,
            stringToHex(asset, { size: 32 }) as `0x${string}`,
            side === "long",
            parseUSDCInput(size),
            parseUSDCInput(collateral)
          );
          showToast("pending", "Opening position...");
        }}
      >
        {isPending ? "Processing..." : `Open ${side === "long" ? "Long" : "Short"}`}
      </Button>
    </Card>
  );
}

function ClosePositionForm({ vaults, onSuccess }: { vaults: Array<{ vault: Address; name: string }>; onSuccess: () => void }) {
  const [selectedVault, setSelectedVault] = useState("");
  const [asset, setAsset] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [sizeDelta, setSizeDelta] = useState("");
  const [collateralDelta, setCollateralDelta] = useState("");

  const { closePosition, receipt, isPending } = useClosePosition();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Position closed");
      onSuccess();
    }
  }, [receipt.isSuccess, onSuccess]);

  return (
    <Card className="p-6">
      <h2 className="mb-6 text-lg font-semibold text-app-text">Close Position</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Vault</label>
          <select
            value={selectedVault}
            onChange={(e) => setSelectedVault(e.target.value)}
            className="h-12 w-full rounded-xl border-0 border border-app-border bg-app-bg px-4 text-base text-app-text dark:bg-app-bg-subtle"
          >
            <option value="">Select vault...</option>
            {vaults.map((v) => (
              <option key={v.vault} value={v.vault}>{v.name || formatAddress(v.vault)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Asset ID</label>
          <Input placeholder="e.g. GOLD" value={asset} onChange={(e) => setAsset(e.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Side</label>
          <SegmentedControl
            options={[
              { value: "long", label: "Long" },
              { value: "short", label: "Short" },
            ]}
            value={side}
            onChange={setSide}
            className="w-full"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Size Delta (USDC)</label>
          <Input type="number" placeholder="0.00" value={sizeDelta} onChange={(e) => setSizeDelta(e.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-app-muted">Collateral Delta (USDC)</label>
          <Input type="number" placeholder="0.00" value={collateralDelta} onChange={(e) => setCollateralDelta(e.target.value)} />
        </div>
      </div>
      <Button
        className="mt-6 w-full"
        variant="danger"
        size="lg"
        disabled={!selectedVault || !asset || !sizeDelta || isPending}
        onClick={() => {
          closePosition(
            selectedVault as Address,
            stringToHex(asset, { size: 32 }) as `0x${string}`,
            side === "long",
            parseUSDCInput(sizeDelta),
            parseUSDCInput(collateralDelta || "0")
          );
          showToast("pending", "Closing position...");
        }}
      >
        {isPending ? "Processing..." : "Close Position"}
      </Button>
    </Card>
  );
}
