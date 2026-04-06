"use client";

import { useEffect, useMemo, useState } from "react";
import { isAddress, isHex, stringToHex, type Address } from "viem";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { showToast } from "@/components/ui/toast";
import { formatAddress } from "@/lib/format";
import {
  useCalculatedFundingRateFactor,
  useConfigureFunding,
  useDefaultFundingFactors,
  useFundingAssetToken,
  useFundingConfig,
  useFundingInterval,
  useFundingKeeperStatus,
  useFundingOwner,
  useMapFundingAssetToken,
  useSetDefaultFunding,
  useSetFundingInterval,
  useSetFundingKeeper,
  useTransferFundingOwnership,
  useUpdateFundingRate,
} from "@/hooks/useFundingRateManager";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";

function parseIntegerInput(value: string): bigint | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return BigInt(trimmed);
  } catch {
    return undefined;
  }
}

function toAssetId(input: string): `0x${string}` | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (isHex(trimmed) && trimmed.length === 66) {
    return trimmed as `0x${string}`;
  }
  try {
    return stringToHex(trimmed, { size: 32 }) as `0x${string}`;
  } catch {
    return undefined;
  }
}

export default function AdminFundingPage() {
  const { data: owner } = useFundingOwner();
  const { data: fundingInterval } = useFundingInterval();
  const { base, max } = useDefaultFundingFactors();

  return (
    <PageWrapper>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">
          Funding Manager
        </h1>
        <p className="mt-1 text-sm text-app-muted">
          Owner and keeper operations for funding controls
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Owner"
          value={owner ? formatAddress(owner as string) : "--"}
          tooltipKey="owner"
        />
        <StatCard
          label="Funding Interval (s)"
          value={fundingInterval ? String(fundingInterval) : "--"}
          tooltipKey="fundingInterval"
        />
        <StatCard
          label="Default Factors"
          value={
            base.data !== undefined && max.data !== undefined
              ? `${String(base.data)} / ${String(max.data)}`
              : "--"
          }
          tooltipKey="defaultFactors"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <OwnershipCard />
        <KeeperManagementCard />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <GlobalFundingCard />
        <KeeperRateUpdateCard />
      </div>
      <div className="mt-6">
        <PerAssetFundingCard />
      </div>
    </PageWrapper>
  );
}

function OwnershipCard() {
  const { data: owner } = useFundingOwner();
  const [newOwner, setNewOwner] = useState("");
  const parsedOwner = useMemo(
    () => (isAddress(newOwner.trim()) ? (newOwner.trim() as Address) : undefined),
    [newOwner]
  );
  const { transferOwnership, receipt, isPending, error, isError } = useTransferFundingOwnership();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Ownership transferred");
    }
  }, [receipt.isSuccess]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Ownership transfer failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-base font-semibold text-app-text">
        <InfoLabel label="Ownership" tooltipKey="ownership" />
      </h3>
      <p className="mb-2 text-sm text-app-muted">
        Current owner:{" "}
        <span className="font-mono text-app-text">
          {owner ? (owner as string) : "--"}
        </span>
      </p>
      <Input
        placeholder="New owner address"
        value={newOwner}
        onChange={(e) => setNewOwner(e.target.value)}
        title="New owner address for FundingRateManager."
      />
      <Button
        className="mt-3"
        size="sm"
        disabled={!parsedOwner || isPending}
        title="Transfer FundingRateManager ownership to this address."
        onClick={() => {
          if (!parsedOwner) return;
          transferOwnership(parsedOwner);
          showToast("pending", "Transferring ownership...");
        }}
      >
        Transfer Ownership
      </Button>
    </Card>
  );
}

function KeeperManagementCard() {
  const [keeper, setKeeper] = useState("");
  const parsedKeeper = useMemo(
    () => (isAddress(keeper.trim()) ? (keeper.trim() as Address) : undefined),
    [keeper]
  );
  const { data: isActive } = useFundingKeeperStatus(parsedKeeper);
  const { setKeeper: setKeeperStatus, receipt, isPending, error, isError } = useSetFundingKeeper();

  useEffect(() => {
    if (receipt.isSuccess) showToast("success", "Keeper status updated");
  }, [receipt.isSuccess]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Keeper update failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-base font-semibold text-app-text">
        <InfoLabel label="Keeper Management" tooltipKey="keeperManagement" />
      </h3>
      <p className="mb-3 text-sm text-app-muted">
        Keeper status:{" "}
        <span className="font-semibold text-app-text">
          {parsedKeeper ? (isActive ? "Active" : "Inactive") : "--"}
        </span>
      </p>
      <Input
        placeholder="Keeper address"
        value={keeper}
        onChange={(e) => setKeeper(e.target.value)}
        title="Keeper address to authorize or revoke."
      />
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={!parsedKeeper || isPending}
          title="Authorize this keeper to call updateFundingRate."
          onClick={() => {
            if (!parsedKeeper) return;
            setKeeperStatus(parsedKeeper, true);
            showToast("pending", "Enabling keeper...");
          }}
        >
          Enable Keeper
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!parsedKeeper || isPending}
          title="Revoke this keeper's permission to call updateFundingRate."
          onClick={() => {
            if (!parsedKeeper) return;
            setKeeperStatus(parsedKeeper, false);
            showToast("pending", "Disabling keeper...");
          }}
        >
          Disable Keeper
        </Button>
      </div>
    </Card>
  );
}

function GlobalFundingCard() {
  const { data: fundingInterval } = useFundingInterval();
  const { base, max } = useDefaultFundingFactors();

  const [intervalInput, setIntervalInput] = useState("");
  const [baseInput, setBaseInput] = useState("");
  const [maxInput, setMaxInput] = useState("");

  const parsedInterval = parseIntegerInput(intervalInput);
  const parsedBase = parseIntegerInput(baseInput);
  const parsedMax = parseIntegerInput(maxInput);

  const intervalTx = useSetFundingInterval();
  const defaultsTx = useSetDefaultFunding();

  useEffect(() => {
    if (intervalTx.receipt.isSuccess) {
      showToast("success", "Funding interval updated");
      setIntervalInput("");
    }
  }, [intervalTx.receipt.isSuccess]);

  useEffect(() => {
    if (defaultsTx.receipt.isSuccess) {
      showToast("success", "Default funding factors updated");
      setBaseInput("");
      setMaxInput("");
    }
  }, [defaultsTx.receipt.isSuccess]);

  useContractErrorToast({
    writeError: intervalTx.error,
    writeIsError: intervalTx.isError,
    receiptError: intervalTx.receipt.error,
    receiptIsError: intervalTx.receipt.isError,
    fallbackMessage: "Funding interval update failed",
  });
  useContractErrorToast({
    writeError: defaultsTx.error,
    writeIsError: defaultsTx.isError,
    receiptError: defaultsTx.receipt.error,
    receiptIsError: defaultsTx.receipt.isError,
    fallbackMessage: "Default funding update failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-base font-semibold text-app-text">
        <InfoLabel label="Global Funding Settings" tooltipKey="globalFundingSettings" />
      </h3>
      <p className="mb-4 text-sm text-app-muted">
        Current interval: {fundingInterval ? String(fundingInterval) : "--"}s
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="Funding interval (seconds)"
          value={intervalInput}
          onChange={(e) => setIntervalInput(e.target.value)}
          title="New funding interval in seconds. Must be greater than zero."
        />
        <Button
          size="sm"
          disabled={!parsedInterval || parsedInterval <= 0n || intervalTx.isPending}
          title="Set global funding interval used for GMX setFundingRate calls."
          onClick={() => {
            if (!parsedInterval || parsedInterval <= 0n) return;
            intervalTx.setFundingInterval(parsedInterval);
            showToast("pending", "Updating funding interval...");
          }}
        >
          Set Interval
        </Button>
      </div>

      <p className="mt-5 mb-3 text-sm text-app-muted">
        Current defaults: {base.data !== undefined ? String(base.data) : "--"} /{" "}
        {max.data !== undefined ? String(max.data) : "--"}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Base factor"
          value={baseInput}
          onChange={(e) => setBaseInput(e.target.value)}
          title="Default base funding rate factor."
        />
        <Input
          placeholder="Max factor"
          value={maxInput}
          onChange={(e) => setMaxInput(e.target.value)}
          title="Default max funding rate factor."
        />
      </div>
      <Button
        className="mt-3"
        size="sm"
        disabled={!parsedBase || !parsedMax || defaultsTx.isPending}
        title="Set default base and max funding rate factors."
        onClick={() => {
          if (parsedBase === undefined || parsedMax === undefined) return;
          defaultsTx.setDefaultFunding(parsedBase, parsedMax);
          showToast("pending", "Updating default factors...");
        }}
      >
        Set Default Funding
      </Button>
    </Card>
  );
}

function KeeperRateUpdateCard() {
  const [fundingFactor, setFundingFactor] = useState("");
  const [stableFactor, setStableFactor] = useState("");
  const parsedFunding = parseIntegerInput(fundingFactor);
  const parsedStable = parseIntegerInput(stableFactor);
  const { updateFundingRate, receipt, isPending, error, isError } = useUpdateFundingRate();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Funding rate updated");
    }
  }, [receipt.isSuccess]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Funding rate update failed",
  });

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-base font-semibold text-app-text">
        <InfoLabel label="Keeper Rate Update" tooltipKey="keeperRateUpdate" />
      </h3>
      <div className="grid gap-2">
        <Input
          placeholder="New funding rate factor"
          value={fundingFactor}
          onChange={(e) => setFundingFactor(e.target.value)}
          title="GMX fundingRateFactor argument."
        />
        <Input
          placeholder="New stable funding rate factor"
          value={stableFactor}
          onChange={(e) => setStableFactor(e.target.value)}
          title="GMX stableFundingRateFactor argument."
        />
      </div>
      <Button
        className="mt-3"
        size="sm"
        disabled={!parsedFunding || !parsedStable || isPending}
        title="Call updateFundingRate. Requires owner or authorized keeper."
        onClick={() => {
          if (parsedFunding === undefined || parsedStable === undefined) return;
          updateFundingRate(parsedFunding, parsedStable);
          showToast("pending", "Updating funding rate...");
        }}
      >
        Update Funding Rate
      </Button>
    </Card>
  );
}

function PerAssetFundingCard() {
  const [assetInput, setAssetInput] = useState("");
  const [baseInput, setBaseInput] = useState("");
  const [maxInput, setMaxInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");

  const assetId = useMemo(() => toAssetId(assetInput), [assetInput]);
  const token = useMemo(
    () => (isAddress(tokenInput.trim()) ? (tokenInput.trim() as Address) : undefined),
    [tokenInput]
  );

  const parsedBase = parseIntegerInput(baseInput);
  const parsedMax = parseIntegerInput(maxInput);
  const parsedThreshold = parseIntegerInput(thresholdInput);

  const { data: mappedToken } = useFundingAssetToken(assetId);
  const { data: config } = useFundingConfig(assetId);
  const { data: calculatedFactor } = useCalculatedFundingRateFactor(assetId);
  const configureTx = useConfigureFunding();
  const mapTokenTx = useMapFundingAssetToken();

  useEffect(() => {
    if (configureTx.receipt.isSuccess) {
      showToast("success", "Asset funding config updated");
    }
  }, [configureTx.receipt.isSuccess]);

  useEffect(() => {
    if (mapTokenTx.receipt.isSuccess) {
      showToast("success", "Asset token mapping updated");
    }
  }, [mapTokenTx.receipt.isSuccess]);

  useContractErrorToast({
    writeError: configureTx.error,
    writeIsError: configureTx.isError,
    receiptError: configureTx.receipt.error,
    receiptIsError: configureTx.receipt.isError,
    fallbackMessage: "Asset funding configuration failed",
  });
  useContractErrorToast({
    writeError: mapTokenTx.error,
    writeIsError: mapTokenTx.isError,
    receiptError: mapTokenTx.receipt.error,
    receiptIsError: mapTokenTx.receipt.isError,
    fallbackMessage: "Asset token mapping failed",
  });

  const fundingConfig = config as
    | {
        baseFundingRateFactor: bigint;
        maxFundingRateFactor: bigint;
        imbalanceThresholdBps: bigint;
        configured: boolean;
      }
    | undefined;

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-base font-semibold text-app-text">
        <InfoLabel label="Per-Asset Funding Configuration" tooltipKey="perAssetFundingConfiguration" />
      </h3>
      <Input
        placeholder="Asset ID (e.g. GOLD or 0x... bytes32)"
        value={assetInput}
        onChange={(e) => setAssetInput(e.target.value)}
        title="Asset identifier. Plain text will be encoded to bytes32."
      />
      <p className="mt-2 text-xs text-app-muted break-all">
        Resolved asset ID: {assetId ?? "--"}
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Input
          placeholder="Base factor"
          value={baseInput}
          onChange={(e) => setBaseInput(e.target.value)}
          title="Base funding factor for this asset."
        />
        <Input
          placeholder="Max factor"
          value={maxInput}
          onChange={(e) => setMaxInput(e.target.value)}
          title="Max funding factor for this asset."
        />
        <Input
          placeholder="Imbalance threshold bps"
          value={thresholdInput}
          onChange={(e) => setThresholdInput(e.target.value)}
          title="Imbalance threshold in bps for scaling above base factor."
        />
      </div>

      <Button
        className="mt-3"
        size="sm"
        disabled={
          !assetId ||
          parsedBase === undefined ||
          parsedMax === undefined ||
          parsedThreshold === undefined ||
          configureTx.isPending
        }
        title="Configure per-asset funding curve parameters."
        onClick={() => {
          if (
            !assetId ||
            parsedBase === undefined ||
            parsedMax === undefined ||
            parsedThreshold === undefined
          ) {
            return;
          }
          configureTx.configureFunding(
            assetId,
            parsedBase,
            parsedMax,
            parsedThreshold
          );
          showToast("pending", "Configuring asset funding...");
        }}
      >
        Configure Funding
      </Button>

      <div className="mt-5 flex gap-2">
        <Input
          placeholder="Token address to map"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          title="GMX token address for this asset."
        />
        <Button
          size="sm"
          disabled={!assetId || !token || mapTokenTx.isPending}
          title="Map asset ID to GMX token address."
          onClick={() => {
            if (!assetId || !token) return;
            mapTokenTx.mapAssetToken(assetId, token);
            showToast("pending", "Mapping asset token...");
          }}
        >
          Map Token
        </Button>
      </div>

      <div className="mt-5 rounded-lg bg-app-bg-subtle p-3 text-sm">
        <p className="text-app-muted">
          Mapped token:{" "}
          <span className="font-mono text-app-text break-all">
            {mappedToken ? (mappedToken as string) : "--"}
          </span>
        </p>
        <p className="mt-1 text-app-muted">
          Calculated factor:{" "}
          <span className="font-semibold text-app-text">
            {calculatedFactor !== undefined ? String(calculatedFactor) : "--"}
          </span>
        </p>
        <p className="mt-1 text-app-muted">
          Current config:{" "}
          <span className="text-app-text">
            {fundingConfig?.configured
              ? `${String(fundingConfig.baseFundingRateFactor)} / ${String(
                  fundingConfig.maxFundingRateFactor
                )} / ${String(fundingConfig.imbalanceThresholdBps)}`
              : "Unconfigured"}
          </span>
        </p>
      </div>
    </Card>
  );
}
