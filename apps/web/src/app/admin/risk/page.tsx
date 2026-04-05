"use client";

import { useEffect, useMemo, useState } from "react";
import { isAddress, type Address } from "viem";
import { motion } from "framer-motion";
import { Pause, Play, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { showToast } from "@/components/ui/toast";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch, useVaultState } from "@/hooks/usePerpReader";
import {
  useDeregisterVault,
  useIsVaultRegistered,
  useMaxOpenInterest,
  useMaxPositionSize,
  usePaused,
  useRegisterVault,
  useSetMaxOpenInterest,
  useSetMaxPositionSize,
  useSetPaused,
} from "@/hooks/useVaultAccounting";
import { formatAddress, formatUSDC, parseUSDCInput } from "@/lib/format";
import { PRICE_PRECISION, USDC_PRECISION } from "@/lib/constants";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";

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
        Vault Registration
      </h2>
      {basketsLoading ? (
        <Card className="p-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-app-border px-0 py-4 last:border-0"
            >
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </Card>
      ) : infos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-app-muted">
          No baskets found
        </Card>
      ) : (
        <Card className="divide-y divide-app-border">
          {infos.map((info) => (
            <VaultRegistrationRow
              key={info.vault}
              vault={info.vault}
              name={info.name}
            />
          ))}
        </Card>
      )}

      <div className="mt-4 mb-10">
        <ManualVaultRegistrationCard />
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
  const { setPaused, receipt, isPending, error, isError } = useSetPaused();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", paused ? "System unpaused" : "System paused");
    }
  }, [receipt.isSuccess, paused]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "System pause update failed",
  });

  return (
    <Button
      variant={paused ? "primary" : "danger"}
      title={
        paused
          ? "Unpause trading and capital operations."
          : "Pause trading and capital operations."
      }
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

function VaultRegistrationRow({ vault, name }: { vault: Address; name: string }) {
  const { data } = useVaultState(vault);
  const state = data as { registered: boolean } | undefined;
  const registered = !!state?.registered;

  const {
    registerVault,
    receipt: registerReceipt,
    isPending: isRegisterPending,
    error: registerError,
    isError: isRegisterError,
  } =
    useRegisterVault();
  const {
    deregisterVault,
    receipt: deregisterReceipt,
    isPending: isDeregisterPending,
    error: deregisterError,
    isError: isDeregisterError,
  } = useDeregisterVault();

  useEffect(() => {
    if (registerReceipt.isSuccess) showToast("success", "Vault registered");
  }, [registerReceipt.isSuccess]);

  useEffect(() => {
    if (deregisterReceipt.isSuccess) showToast("success", "Vault deregistered");
  }, [deregisterReceipt.isSuccess]);

  useContractErrorToast({
    writeError: registerError,
    writeIsError: isRegisterError,
    receiptError: registerReceipt.error,
    receiptIsError: registerReceipt.isError,
    fallbackMessage: "Vault registration failed",
  });
  useContractErrorToast({
    writeError: deregisterError,
    writeIsError: isDeregisterError,
    receiptError: deregisterReceipt.error,
    receiptIsError: deregisterReceipt.isError,
    fallbackMessage: "Vault deregistration failed",
  });

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <div>
        <p className="font-medium text-app-text">{name || "Basket"}</p>
        <p className="font-mono text-xs text-app-muted">{formatAddress(vault)}</p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-md px-2 py-1 text-xs font-semibold ${
            registered
              ? "bg-app-success/20 text-app-success"
              : "bg-app-warning/20 text-app-warning"
          }`}
        >
          {registered ? "Registered" : "Not Registered"}
        </span>
        {registered ? (
          <Button
            size="sm"
            variant="secondary"
            title="Deregister vault from VaultAccounting. Requires zero open interest."
            disabled={isDeregisterPending}
            onClick={() => {
              deregisterVault(vault);
              showToast("pending", "Deregistering vault...");
            }}
          >
            Deregister
          </Button>
        ) : (
          <Button
            size="sm"
            title="Register vault in VaultAccounting to enable position operations."
            disabled={isRegisterPending}
            onClick={() => {
              registerVault(vault);
              showToast("pending", "Registering vault...");
            }}
          >
            Register
          </Button>
        )}
      </div>
    </div>
  );
}

function ManualVaultRegistrationCard() {
  const [vaultInput, setVaultInput] = useState("");
  const parsedVault = useMemo(
    () => (isAddress(vaultInput.trim()) ? (vaultInput.trim() as Address) : undefined),
    [vaultInput]
  );

  const { data: isRegistered } = useIsVaultRegistered(parsedVault);
  const {
    registerVault,
    receipt: registerReceipt,
    isPending: isRegisterPending,
    error: registerError,
    isError: isRegisterError,
  } =
    useRegisterVault();
  const {
    deregisterVault,
    receipt: deregisterReceipt,
    isPending: isDeregisterPending,
    error: deregisterError,
    isError: isDeregisterError,
  } = useDeregisterVault();

  useEffect(() => {
    if (registerReceipt.isSuccess) showToast("success", "Vault registered");
  }, [registerReceipt.isSuccess]);

  useEffect(() => {
    if (deregisterReceipt.isSuccess) showToast("success", "Vault deregistered");
  }, [deregisterReceipt.isSuccess]);

  useContractErrorToast({
    writeError: registerError,
    writeIsError: isRegisterError,
    receiptError: registerReceipt.error,
    receiptIsError: registerReceipt.isError,
    fallbackMessage: "Vault registration failed",
  });
  useContractErrorToast({
    writeError: deregisterError,
    writeIsError: isDeregisterError,
    receiptError: deregisterReceipt.error,
    receiptIsError: deregisterReceipt.isError,
    fallbackMessage: "Vault deregistration failed",
  });

  const disabled = !parsedVault || isRegisterPending || isDeregisterPending;
  const statusLabel =
    parsedVault === undefined
      ? "Enter a valid address to check status"
      : isRegistered
        ? "Registered"
        : "Not Registered";

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-base font-semibold text-app-text">
        Manual Vault Registration Check
      </h3>
      <p className="mb-4 text-sm text-app-muted">
        Check and manage registration for any vault address.
      </p>
      <Input
        placeholder="0x..."
        value={vaultInput}
        onChange={(e) => setVaultInput(e.target.value)}
        title="Vault address to check in VaultAccounting."
      />
      <p className="mt-3 text-sm text-app-muted">
        Status: <span className="font-semibold text-app-text">{statusLabel}</span>
      </p>
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          disabled={disabled}
          title="Register this vault in VaultAccounting."
          onClick={() => {
            if (!parsedVault) return;
            registerVault(parsedVault);
            showToast("pending", "Registering vault...");
          }}
        >
          Register
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          title="Deregister this vault. Requires zero open interest."
          onClick={() => {
            if (!parsedVault) return;
            deregisterVault(parsedVault);
            showToast("pending", "Deregistering vault...");
          }}
        >
          Deregister
        </Button>
      </div>
    </Card>
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
  const { setMaxOpenInterest, receipt, isPending, error, isError } = useSetMaxOpenInterest();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Max OI updated");
      setValue("");
    }
  }, [receipt.isSuccess]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Max OI update failed",
  });

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
          title="USD cap for total open interest on this vault."
        />
        <Button
          size="sm"
          title="Apply max open interest cap for this vault."
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
          title="Clear max open interest cap (unlimited)."
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

function MaxPositionSizeForm({ vault }: { vault: Address }) {
  const [value, setValue] = useState("");
  const { setMaxPositionSize, receipt, isPending, error, isError } = useSetMaxPositionSize();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Max position size updated");
      setValue("");
    }
  }, [receipt.isSuccess]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Max position size update failed",
  });

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
          title="USD cap for a single position size on this vault."
        />
        <Button
          size="sm"
          title="Apply max single-position size cap for this vault."
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
          title="Clear max position size cap (unlimited)."
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
