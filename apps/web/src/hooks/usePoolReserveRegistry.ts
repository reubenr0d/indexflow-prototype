"use client";

import { useQuery } from "@tanstack/react-query";
import { useAvailableSubgraph } from "@/hooks/subgraph/useSubgraphShared";
import { GET_CHAIN_POOL_STATES } from "@/lib/subgraph/queries";
import { USDC_PRECISION } from "@/lib/constants";

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

type RawChainPoolState = {
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

const MOCK_CHAINS: ChainState[] = [
  {
    chainSelector: 42161n,
    poolDepth: 18_200_000n * USDC_PRECISION,
    reservedAmount: 6_100_000n * USDC_PRECISION,
    availableLiquidity: 12_100_000n * USDC_PRECISION,
    utilizationBps: 3352,
    routingWeight: 4200,
    staleness: 8,
    timestamp: Math.floor(Date.now() / 1000) - 8,
  },
  {
    chainSelector: 8453n,
    poolDepth: 14_800_000n * USDC_PRECISION,
    reservedAmount: 4_200_000n * USDC_PRECISION,
    availableLiquidity: 10_600_000n * USDC_PRECISION,
    utilizationBps: 2838,
    routingWeight: 3400,
    staleness: 14,
    timestamp: Math.floor(Date.now() / 1000) - 14,
  },
  {
    chainSelector: 10n,
    poolDepth: 9_400_000n * USDC_PRECISION,
    reservedAmount: 3_800_000n * USDC_PRECISION,
    availableLiquidity: 5_600_000n * USDC_PRECISION,
    utilizationBps: 4043,
    routingWeight: 2400,
    staleness: 22,
    timestamp: Math.floor(Date.now() / 1000) - 22,
  },
];

export type PoolReserveRegistryView = {
  chains: ChainState[];
  isLoading: boolean;
  isPlaceholder: boolean;
};

function transformChainPoolStates(raw: RawChainPoolState[]): ChainState[] {
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

export function usePoolReserveRegistryState(): PoolReserveRegistryView {
  const { client, isAvailable } = useAvailableSubgraph();

  const { data, isLoading } = useQuery({
    queryKey: ["subgraph", "chainPoolStates"],
    queryFn: async () => {
      if (!client) return null;
      const result = await client.request<{
        chainPoolStates: RawChainPoolState[];
      }>(GET_CHAIN_POOL_STATES);
      return result.chainPoolStates;
    },
    enabled: isAvailable,
    staleTime: 15_000,
    retry: 1,
  });

  if (data && data.length > 0) {
    return {
      chains: transformChainPoolStates(data),
      isLoading: false,
      isPlaceholder: false,
    };
  }

  return {
    chains: MOCK_CHAINS,
    isLoading: isAvailable && isLoading,
    isPlaceholder: true,
  };
}
