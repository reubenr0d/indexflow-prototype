"use client";

import { useMemo, useState } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { UtilizationRing } from "@/components/ui/utilization-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { usePoolUtilization } from "@/hooks/usePerpReader";
import { usePostTxRefresh } from "@/hooks/usePostTxRefresh";
import { getContractErrorMessage } from "@/hooks/useContractErrorToast";
import {
  useAccount,  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { formatAddress, formatTokenAmount, formatUSDC, formatUsd1e30, parseTokenAmountInput } from "@/lib/format";
import { motion } from "framer-motion";
import { PerpReaderABI } from "@/abi/contracts";
import { type Address, zeroAddress } from "viem";

const GMX_VAULT_READ_ABI = [
  {
    type: "function",
    name: "allWhitelistedTokensLength",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allWhitelistedTokens",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "bufferAmounts",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "gov",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const GMX_VAULT_WRITE_ABI = [
  {
    type: "function",
    name: "setBufferAmount",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "_token" },
      { type: "uint256", name: "_amount" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "directPoolDeposit",
    stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "_token" }],
    outputs: [],
  },
] as const;

const ERC20_METADATA_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address", name: "owner" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "to" },
      { type: "uint256", name: "value" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

type TokenRowData = {
  token: Address;
  symbol: string;
  decimals: number;
  balance: bigint;
  poolAmount: bigint;
  utilizationBps: bigint;
  bufferAmount: bigint;
};

export default function AdminPoolPage() {
  const { chainId } = useDeploymentTarget();
  const { address } = useAccount();
  const { usdc, gmxVault, perpReader } = getContracts(chainId);
  const { data, isLoading } = usePoolUtilization(usdc);
  const { data: tokenCount } = useReadContract({
    address: gmxVault,
    abi: GMX_VAULT_READ_ABI,
    functionName: "allWhitelistedTokensLength",
  });
  const { data: govAddress } = useReadContract({
    address: gmxVault,
    abi: GMX_VAULT_READ_ABI,
    functionName: "gov",
  });

  const count = tokenCount ? Number(tokenCount) : 0;
  const indices = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const { data: tokenListData, isLoading: tokenListLoading } = useReadContracts({
    contracts: indices.map((i) => ({
      address: gmxVault,
      abi: GMX_VAULT_READ_ABI,
      functionName: "allWhitelistedTokens" as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: count > 0 },
  });
  const tokens = useMemo(
    () =>
      (tokenListData ?? [])
        .map((entry) => entry.result as Address | undefined)
        .filter((token): token is Address => Boolean(token)),
    [tokenListData]
  );

  const { data: utilData, isLoading: utilLoading } = useReadContracts({
    contracts: tokens.map((token) => ({
      address: perpReader,
      abi: PerpReaderABI,
      functionName: "getPoolUtilization" as const,
      args: [token] as const,
    })),
    query: { enabled: tokens.length > 0 },
  });
  const { data: bufferData, isLoading: bufferLoading } = useReadContracts({
    contracts: tokens.map((token) => ({
      address: gmxVault,
      abi: GMX_VAULT_READ_ABI,
      functionName: "bufferAmounts" as const,
      args: [token] as const,
    })),
    query: { enabled: tokens.length > 0 },
  });
  const { data: metadataData, isLoading: metadataLoading } = useReadContracts({
    contracts: tokens.flatMap((token) => [
      {
        address: token,
        abi: ERC20_METADATA_ABI,
        functionName: "symbol" as const,
      },
      {
        address: token,
        abi: ERC20_METADATA_ABI,
        functionName: "decimals" as const,
      },
    ]),
    query: { enabled: tokens.length > 0 },
  });
  const { data: balanceData, isLoading: balanceLoading } = useReadContracts({
    contracts: tokens.map((token) => ({
      address: token,
      abi: ERC20_METADATA_ABI,
      functionName: "balanceOf" as const,
      args: [(address ?? zeroAddress) as Address] as const,
    })),
    query: { enabled: tokens.length > 0 && Boolean(address) },
  });

  const pool = data as
    | {
        token: string;
        poolAmount: bigint;
        reservedAmount: bigint;
        globalShortSize: bigint;
        guaranteedUsd: bigint;
        utilizationBps: bigint;
      }
    | undefined;

  const tokenRows = useMemo<TokenRowData[]>(
    () =>
      tokens.map((token, i) => {
        const util = utilData?.[i]?.result as
          | {
              poolAmount: bigint;
              utilizationBps: bigint;
            }
          | undefined;
        const bufferAmount = (bufferData?.[i]?.result as bigint | undefined) ?? 0n;
        const symbol = (metadataData?.[i * 2]?.result as string | undefined) ?? formatAddress(token);
        const decimalsRaw = (metadataData?.[i * 2 + 1]?.result as number | undefined) ?? 18;
        const balance = (balanceData?.[i]?.result as bigint | undefined) ?? 0n;

        return {
          token,
          symbol,
          decimals: Number(decimalsRaw),
          balance,
          poolAmount: util?.poolAmount ?? 0n,
          utilizationBps: util?.utilizationBps ?? 0n,
          bufferAmount,
        };
      }),
    [tokens, utilData, bufferData, metadataData, balanceData]
  );

  const utilizationPct = pool ? Number(pool.utilizationBps) / 100 : 0;
  const isGov = Boolean(
    address && govAddress && address.toLowerCase() === (govAddress as Address).toLowerCase()
  );

  return (
    <PageWrapper>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight text-app-text">Pool Health</h1>
      <p className="mb-8 text-sm text-app-muted">
        GMX gov: {govAddress ? formatAddress(govAddress as Address) : "--"} · Connected role:{" "}
        {isGov ? "Gov" : "Operator"}
      </p>

      <div className="mb-10 flex justify-center">
        {isLoading ? (
          <Skeleton className="h-32 w-32 rounded-full" />
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="relative"
          >
            <UtilizationRing percentage={utilizationPct} size={160} strokeWidth={14} label="Utilization" />
          </motion.div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pool Amount"
          value={pool ? formatUSDC(pool.poolAmount) : "--"}
          isLoading={isLoading}
          tooltipKey="poolAmount"
        />
        <StatCard
          label="Reserved Amount"
          value={pool ? formatUSDC(pool.reservedAmount) : "--"}
          isLoading={isLoading}
          tooltipKey="reservedAmount"
        />
        <StatCard
          label="Global Short Size"
          value={pool ? formatUsd1e30(pool.globalShortSize) : "--"}
          isLoading={isLoading}
          tooltipKey="globalShortSize"
        />
        <StatCard
          label="Guaranteed USD"
          value={pool ? formatUsd1e30(pool.guaranteedUsd) : "--"}
          isLoading={isLoading}
          tooltipKey="guaranteedUsd"
        />
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-app-text">
          <InfoLabel label="Pool Details" tooltipKey="poolDetails" />
        </h2>
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-app-muted">Utilization Rate</span>
              <span className="font-medium text-app-text">{utilizationPct.toFixed(2)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-app-bg-subtle">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  utilizationPct < 50 ? "bg-app-success" : utilizationPct < 80 ? "bg-app-warning" : "bg-app-danger"
                }`}
                style={{ width: `${Math.min(utilizationPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-app-muted">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-10">
        <h2 className="mb-2 text-lg font-semibold text-app-text">
          <InfoLabel label="Pool Controls" tooltipKey="poolControls" />
        </h2>
        <p className="mb-4 text-sm text-app-muted">
          Direct pool deposits are non-dilutive and consume wallet token balance. `Set Buffer` requires the connected
          wallet to be GMX `gov`.
        </p>
        <Card className="divide-y divide-app-border">
          {(tokenListLoading || utilLoading || bufferLoading || metadataLoading || balanceLoading) && (
            <div className="px-6 py-4 text-sm text-app-muted">Loading token controls...</div>
          )}
          {!tokenListLoading && tokens.length === 0 && (
            <div className="px-6 py-4 text-sm text-app-muted">No whitelisted tokens found.</div>
          )}
          {tokenRows.map((row) => (
            <PoolTokenControlsRow
              key={row.token}
              row={row}
              gmxVault={gmxVault}
              canSetBuffer={isGov}
              walletConnected={Boolean(address)}
            />
          ))}
        </Card>
      </div>
    </PageWrapper>
  );
}

function PoolTokenControlsRow({
  row,
  gmxVault,
  canSetBuffer,
  walletConnected,
}: {
  row: TokenRowData;
  gmxVault: Address;
  canSetBuffer: boolean;
  walletConnected: boolean;
}) {
  const { chainId } = useDeploymentTarget();
  const publicClient = usePublicClient({ chainId });
  const refreshAfterTx = usePostTxRefresh();
  const { writeContractAsync, isPending } = useWriteContract();
  const [bufferInput, setBufferInput] = useState("");
  const [depositInput, setDepositInput] = useState("");
  const [isSettingBuffer, setIsSettingBuffer] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);

  const parsedBuffer = useMemo(
    () => parseTokenAmountInput(bufferInput, row.decimals),
    [bufferInput, row.decimals]
  );
  const parsedDeposit = useMemo(
    () => parseTokenAmountInput(depositInput, row.decimals),
    [depositInput, row.decimals]
  );
  const isBusy = isPending || isSettingBuffer || isDepositing;

  const canSubmitBuffer =
    canSetBuffer && Boolean(publicClient) && Boolean(parsedBuffer && parsedBuffer >= 0n) && !isBusy;
  const canSubmitDeposit =
    walletConnected &&
    Boolean(publicClient) &&
    Boolean(parsedDeposit && parsedDeposit > 0n) &&
    (parsedDeposit ?? 0n) <= row.balance &&
    !isBusy;

  const handleSetBuffer = async () => {
    if (!publicClient || parsedBuffer === undefined) return;
    setIsSettingBuffer(true);
    showToast("pending", `Setting ${row.symbol} buffer...`);
    try {
      const hash = await writeContractAsync({
        address: gmxVault,
        abi: GMX_VAULT_WRITE_ABI,
        functionName: "setBufferAmount",
        args: [row.token, parsedBuffer],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      showToast("success", `${row.symbol} buffer updated`);
      setBufferInput("");
      await refreshAfterTx();
    } catch (error) {
      showToast("error", getContractErrorMessage(error, "Buffer update failed"));
    } finally {
      setIsSettingBuffer(false);
    }
  };

  const handleDirectDeposit = async () => {
    if (!publicClient || !parsedDeposit || parsedDeposit <= 0n) return;
    setIsDepositing(true);
    try {
      showToast("pending", `Transferring ${row.symbol} to pool...`);
      const transferHash = await writeContractAsync({
        address: row.token,
        abi: ERC20_METADATA_ABI,
        functionName: "transfer",
        args: [gmxVault, parsedDeposit],
      });
      await publicClient.waitForTransactionReceipt({ hash: transferHash });

      showToast("pending", `Depositing ${row.symbol} into pool...`);
      const depositHash = await writeContractAsync({
        address: gmxVault,
        abi: GMX_VAULT_WRITE_ABI,
        functionName: "directPoolDeposit",
        args: [row.token],
      });
      await publicClient.waitForTransactionReceipt({ hash: depositHash });

      showToast("success", `${row.symbol} deposited into pool`);
      setDepositInput("");
      await refreshAfterTx();
    } catch (error) {
      showToast("error", getContractErrorMessage(error, "Direct pool deposit failed"));
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <div className="space-y-4 px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-app-text">{row.symbol}</p>
          <p className="font-mono text-xs text-app-muted">{formatAddress(row.token)}</p>
        </div>
        <div className="text-right text-xs text-app-muted">
          <p>Pool: {formatTokenAmount(row.poolAmount, row.decimals)} {row.symbol}</p>
          <p>Buffer: {formatTokenAmount(row.bufferAmount, row.decimals)} {row.symbol}</p>
          <p>Utilization: {(Number(row.utilizationBps) / 100).toFixed(2)}%</p>
          <p>Wallet: {formatTokenAmount(row.balance, row.decimals)} {row.symbol}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-app-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-muted">
            <InfoLabel label="Set Buffer Amount" tooltipKey="setBufferAmount" />
          </p>
          <Input
            type="text"
            inputMode="decimal"
            placeholder={`Amount (${row.symbol})`}
            value={bufferInput}
            onChange={(e) => setBufferInput(e.target.value)}
            data-testid={`pool-buffer-input-${row.symbol.toLowerCase()}`}
            className="mb-2"
          />
          {!canSetBuffer && (
            <p className="mb-2 text-xs text-app-warning">Only GMX gov can set buffer amounts.</p>
          )}
          <Button
            size="sm"
            disabled={!canSubmitBuffer}
            onClick={handleSetBuffer}
            data-testid={`pool-buffer-submit-${row.symbol.toLowerCase()}`}
          >
            Set Buffer
          </Button>
        </div>

        <div className="rounded-md border border-app-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-muted">
            <InfoLabel label="Direct Pool Deposit" tooltipKey="directPoolDeposit" />
          </p>
          <Input
            type="text"
            inputMode="decimal"
            placeholder={`Amount (${row.symbol})`}
            value={depositInput}
            onChange={(e) => setDepositInput(e.target.value)}
            data-testid={`pool-deposit-input-${row.symbol.toLowerCase()}`}
            className="mb-2"
          />
          {parsedDeposit !== undefined && parsedDeposit > row.balance && (
            <p className="mb-2 text-xs text-app-warning">Insufficient wallet balance for this deposit.</p>
          )}
          <Button
            size="sm"
            disabled={!canSubmitDeposit}
            onClick={handleDirectDeposit}
            data-testid={`pool-deposit-submit-${row.symbol.toLowerCase()}`}
          >
            Deposit To Pool
          </Button>
        </div>
      </div>
    </div>
  );
}
