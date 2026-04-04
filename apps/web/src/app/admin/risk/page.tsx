"use client";

import { useState, useEffect } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch } from "@/hooks/usePerpReader";
import {
  usePaused,
  useSetPaused,
  useSetMaxOpenInterest,
  useSetMaxPositionSize,
  useMaxOpenInterest,
  useMaxPositionSize,
} from "@/hooks/useVaultAccounting";
import { formatUSDC, formatAddress, parseUSDCInput } from "@/lib/format";
import { PRICE_PRECISION, USDC_PRECISION } from "@/lib/constants";
import { showToast } from "@/components/ui/toast";
import { type Address } from "viem";
import { motion } from "framer-motion";
import { ShieldAlert, ShieldCheck, Pause, Play } from "lucide-react";

export default function AdminRiskPage() {
  const { data: baskets, isLoading: basketsLoading } = useAllBaskets();
  const vaultAddresses = (baskets as unknown as Address[]) ?? [];
  const { data: basketInfos } = useBasketInfoBatch(vaultAddresses);
  const { data: isPaused, isLoading: pauseLoading } = usePaused();

  const infos =
    (basketInfos as unknown as Array<{ vault: Address; name: string }>) ?? [];

  return (
    <PageWrapper>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-app-text">
            Risk Controls
          </h1>
          <p className="mt-1 text-sm text-app-muted">
            Global and per-vault risk parameters
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pauseLoading ? (
            <Skeleton className="h-10 w-32" />
          ) : (
            <PauseStatus paused={!!isPaused} />
          )}
        </div>
      </div>

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="System Status"
          value={pauseLoading ? "--" : isPaused ? "PAUSED" : "ACTIVE"}
          isLoading={pauseLoading}
        />
        <StatCard label="Active Baskets" value={String(vaultAddresses.length)} />
        <StatCard
          label="Baskets With Caps"
          value={String(infos.length)}
          isLoading={basketsLoading}
        />
      </div>

      <h2 className="mb-4 text-lg font-semibold text-app-text">
        Per-Vault Risk Limits
      </h2>
      {basketsLoading ? (
        <Card className="p-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-app-border px-0 py-4 last:border-0"
            >
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </Card>
      ) : infos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-app-muted">
          No baskets registered yet
        </Card>
      ) : (
        <div className="space-y-4">
          {infos.map((info) => (
            <VaultRiskCard key={info.vault} vault={info.vault} name={info.name} />
          ))}
        </div>
      )}
    </PageWrapper>
  );
}

function PauseStatus({ paused }: { paused: boolean }) {
  const { setPaused, receipt, isPending } = useSetPaused();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", paused ? "System unpaused" : "System paused");
    }
  }, [receipt.isSuccess, paused]);

  return (
    <Button
      variant={paused ? "primary" : "danger"}
      onClick={() => {
        setPaused(!paused);
        showToast("pending", paused ? "Unpausing..." : "Pausing...");
      }}
      disabled={isPending}
    >
      {paused ? (
        <>
          <Play className="mr-2 h-4 w-4" /> Unpause System
        </>
      ) : (
        <>
          <Pause className="mr-2 h-4 w-4" /> Pause System
        </>
      )}
    </Button>
  );
}

function VaultRiskCard({ vault, name }: { vault: Address; name: string }) {
  const { data: currentMaxOI } = useMaxOpenInterest(vault);
  const { data: currentMaxPos } = useMaxPositionSize(vault);

  const maxOI = currentMaxOI as bigint | undefined;
  const maxPos = currentMaxPos as bigint | undefined;

  const formatCap = (val: bigint | undefined) => {
    if (val === undefined) return "--";
    if (val === 0n) return "Unlimited";
    return formatUSDC(val / (PRICE_PRECISION / USDC_PRECISION));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-app-text">
              {name || "Basket"}
            </h3>
            <p className="font-mono text-xs text-app-muted">
              {formatAddress(vault)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {maxOI !== undefined && maxOI > 0n ? (
              <ShieldAlert className="h-4 w-4 text-app-warning" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-app-success" />
            )}
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-app-bg-subtle p-3">
            <p className="text-xs font-medium text-app-muted">Max Open Interest</p>
            <p className="mt-1 text-sm font-semibold text-app-text">
              {formatCap(maxOI)}
            </p>
          </div>
          <div className="rounded-lg bg-app-bg-subtle p-3">
            <p className="text-xs font-medium text-app-muted">Max Position Size</p>
            <p className="mt-1 text-sm font-semibold text-app-text">
              {formatCap(maxPos)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <MaxOIForm vault={vault} />
          <MaxPositionSizeForm vault={vault} />
        </div>
      </Card>
    </motion.div>
  );
}

function MaxOIForm({ vault }: { vault: Address }) {
  const [value, setValue] = useState("");
  const { setMaxOpenInterest, receipt, isPending } = useSetMaxOpenInterest();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Max OI updated");
      setValue("");
    }
  }, [receipt.isSuccess]);

  const submit = (cap: bigint) => {
    setMaxOpenInterest(vault, cap);
    showToast("pending", "Setting max OI...");
  };

  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-app-muted">
        Set Max Open Interest (USD)
      </label>
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="e.g. 50000"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 text-xs"
        />
        <Button
          size="sm"
          disabled={!value || isPending}
          onClick={() => {
            const usdcVal = parseUSDCInput(value);
            const pricePrecisionVal =
              (usdcVal * PRICE_PRECISION) / USDC_PRECISION;
            submit(pricePrecisionVal);
          }}
        >
          Set
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => submit(0n)}
          title="Remove cap (unlimited)"
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

function MaxPositionSizeForm({ vault }: { vault: Address }) {
  const [value, setValue] = useState("");
  const { setMaxPositionSize, receipt, isPending } = useSetMaxPositionSize();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Max position size updated");
      setValue("");
    }
  }, [receipt.isSuccess]);

  const submit = (cap: bigint) => {
    setMaxPositionSize(vault, cap);
    showToast("pending", "Setting max position size...");
  };

  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-app-muted">
        Set Max Position Size (USD)
      </label>
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="e.g. 20000"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 text-xs"
        />
        <Button
          size="sm"
          disabled={!value || isPending}
          onClick={() => {
            const usdcVal = parseUSDCInput(value);
            const pricePrecisionVal =
              (usdcVal * PRICE_PRECISION) / USDC_PRECISION;
            submit(pricePrecisionVal);
          }}
        >
          Set
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => submit(0n)}
          title="Remove cap (unlimited)"
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
