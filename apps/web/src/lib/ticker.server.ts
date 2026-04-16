import "server-only";

import { createPublicClient, http, type Address, type Chain } from "viem";
import { avalancheFuji, sepolia } from "viem/chains";
import { OracleAdapterABI } from "@/abi/OracleAdapter";
import {
  getContractsForDeploymentTarget,
  isDeploymentConfigured,
} from "@/config/contracts";
import { DEFAULT_DEPLOYMENT_TARGET, type DeploymentTarget } from "@/lib/deployment";
import { formatAssetId } from "@/lib/format";

const CHAIN_BY_TARGET: Partial<Record<DeploymentTarget, Chain>> = {
  sepolia,
  fuji: avalancheFuji,
};

const MAX_TICKER_ASSETS = 8;

export type TickerAsset = {
  assetId: `0x${string}`;
  label: string;
  /** Bigint serialized as string for RSC transport */
  price: string;
  priceTimestamp: string;
};

const TICKER_FETCH_TIMEOUT_MS = 10_000;

export async function fetchTickerData(): Promise<TickerAsset[]> {
  const target = isDeploymentConfigured(DEFAULT_DEPLOYMENT_TARGET)
    ? DEFAULT_DEPLOYMENT_TARGET
    : "sepolia";
  const { oracleAdapter } = getContractsForDeploymentTarget(target);

  const chain = CHAIN_BY_TARGET[target] ?? sepolia;
  const client = createPublicClient({
    chain,
    transport: http(undefined, { timeout: TICKER_FETCH_TIMEOUT_MS }),
  });

  const assetCount = await client.readContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getAssetCount",
  });

  const count = Math.min(Number(assetCount), 50);
  if (count === 0) return [];

  const idResults = await client.multicall({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: oracleAdapter as Address,
      abi: OracleAdapterABI,
      functionName: "assetList" as const,
      args: [BigInt(i)] as const,
    })),
  });

  const ids = idResults
    .map((r) => (r.status === "success" ? (r.result as `0x${string}`) : null))
    .filter((id): id is `0x${string}` => id !== null);

  if (ids.length === 0) return [];

  const [activeResults, symbolResults, prices] = await Promise.all([
    client.multicall({
      contracts: ids.map((id) => ({
        address: oracleAdapter as Address,
        abi: OracleAdapterABI,
        functionName: "isAssetActive" as const,
        args: [id] as const,
      })),
    }),
    client.multicall({
      contracts: ids.map((id) => ({
        address: oracleAdapter as Address,
        abi: OracleAdapterABI,
        functionName: "assetSymbols" as const,
        args: [id] as const,
      })),
    }),
    client.readContract({
      address: oracleAdapter,
      abi: OracleAdapterABI,
      functionName: "getPrices",
      args: [ids],
    }),
  ]);

  const priceData = prices as ReadonlyArray<{
    price: bigint;
    timestamp: bigint;
  }>;

  const assets: TickerAsset[] = [];
  for (let i = 0; i < ids.length && assets.length < MAX_TICKER_ASSETS; i++) {
    const active =
      activeResults[i].status === "success" &&
      activeResults[i].result === true;
    if (!active) continue;

    const price = priceData[i]?.price ?? 0n;
    if (price === 0n) continue;

    const symbol =
      symbolResults[i].status === "success"
        ? (symbolResults[i].result as string)
        : "";
    const label = symbol || formatAssetId(ids[i]);

    assets.push({
      assetId: ids[i],
      label,
      price: price.toString(),
      priceTimestamp: (priceData[i]?.timestamp ?? 0n).toString(),
    });
  }

  return assets;
}
