"use client";

import { type DeploymentTarget } from "@/lib/deployment";
import { useMultiChainSubgraphQuery } from "@/hooks/useMultiChainSubgraphQuery";
import { GET_CHAIN_POOL_STATES } from "@/lib/subgraph/queries";

export type ChainState = {
  chainSelector: bigint;
  poolDepth: bigint;
  reservedAmount: bigint;
  availableLiquidity: bigint;
  utilizationBps: number;
  routingWeight: number;
  staleness: number;
  timestamp: number;
};

export type RawChainPoolState = {
  id: string;
  chainSelector: string;
  twapPoolAmount: string;
  availableLiquidity: string;
  reservedAmount: string;
  utilizationBps: string;
  snapshotTimestamp: string;
  snapshotCount: string;
  updatedAt: string;
};

export type PoolReserveRegistryView = {
  chains: ChainState[];
  isLoading: boolean;
  isEmpty: boolean;
  failedTargets: DeploymentTarget[];
};

export function transformChainPoolStates(raw: RawChainPoolState[]): ChainState[] {
  const nowSec = Math.floor(Date.now() / 1000);

  let totalPool = 0n;
  const parsed = raw.map((r) => {
    const poolDepth = BigInt(r.twapPoolAmount);
    totalPool += poolDepth;
    return { raw: r, poolDepth };
  });

  return parsed.map(({ raw: r, poolDepth }) => {
    const snapshotTs = Number(r.snapshotTimestamp);
    const weight =
      totalPool > 0n
        ? Number((poolDepth * 10_000n) / totalPool)
        : Math.floor(10_000 / parsed.length);

    return {
      chainSelector: BigInt(r.chainSelector),
      poolDepth,
      reservedAmount: BigInt(r.reservedAmount),
      availableLiquidity: BigInt(r.availableLiquidity),
      utilizationBps: Number(r.utilizationBps),
      routingWeight: weight,
      staleness: Math.max(0, nowSec - snapshotTs),
      timestamp: snapshotTs,
    };
  });
}

export type RawChainPoolStateResult = {
  chainPoolStates: RawChainPoolState[];
};

export function aggregateChainPoolStates(results: Map<DeploymentTarget, RawChainPoolStateResult>): ChainState[] {
  const allRows: RawChainPoolState[] = [];
  for (const result of results.values()) {
    allRows.push(...result.chainPoolStates);
  }
  if (allRows.length === 0) return [];
  return transformChainPoolStates(allRows);
}

export function usePoolReserveRegistryState(): PoolReserveRegistryView {
  const { data, isLoading, failedTargets } = useMultiChainSubgraphQuery<
    RawChainPoolStateResult,
    ChainState[]
  >({
    queryKeyPrefix: ["chainPoolStates"],
    document: GET_CHAIN_POOL_STATES,
    aggregate: aggregateChainPoolStates,
    staleTime: 15_000,
    runInSingleMode: true,
  });

  return {
    chains: data ?? [],
    isLoading,
    isEmpty: !isLoading && (data?.length ?? 0) === 0,
    failedTargets,
  };
}
