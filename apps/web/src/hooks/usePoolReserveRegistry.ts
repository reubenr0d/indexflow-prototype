"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSubgraphClient } from "@/lib/subgraph/client";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
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
  isError: boolean;
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

/**
 * Envio HyperIndex serves every chain from one unified GraphQL endpoint, so
 * `ChainPoolState` already contains rows for all indexed chains keyed by
 * `chainSelector`. Fetch once and transform — the old per-target fan-out
 * produced N duplicate rows per chain and never resolved partial-failure
 * state correctly.
 */
export function usePoolReserveRegistryState(): PoolReserveRegistryView {
  const { isSubgraphEnabled, subgraphUrl } = useDeploymentTarget();
  const client = useMemo(
    () => (isSubgraphEnabled ? getSubgraphClient(subgraphUrl) : null),
    [isSubgraphEnabled, subgraphUrl],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ["subgraph", "chainPoolStates"],
    queryFn: async (): Promise<ChainState[]> => {
      if (!client) return [];
      const result = await client.request<{ chainPoolStates: RawChainPoolState[] }>(
        GET_CHAIN_POOL_STATES,
      );
      return transformChainPoolStates(result.chainPoolStates ?? []);
    },
    enabled: Boolean(client),
    staleTime: 15_000,
    retry: 1,
  });

  const chains = data ?? [];
  return {
    chains,
    isLoading,
    isEmpty: !isLoading && chains.length === 0,
    isError,
  };
}
