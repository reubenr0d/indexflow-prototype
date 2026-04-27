"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { parseBigInt } from "@/lib/subgraph/transform";
import { GET_ADMIN_VAULT_STATES } from "@/lib/subgraph/queries";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { useAvailableSubgraph, DEFAULT_PAGE_SIZE, type RawVaultState } from "./useSubgraphShared";

export type AdminVaultState = {
  id: Address;
  registered: boolean;
  paused: boolean;
  depositedCapital: bigint;
  realisedPnl: bigint;
  openInterest: bigint;
  positionCount: bigint;
  collateralLocked: bigint;
  updatedAt: bigint;
  basket: {
    id: Address;
    name: string;
    vault: Address;
    tvlBookUsdc: bigint;
    perpAllocatedUsdc: bigint;
  };
};

export function useVaultStatesQuery(params?: { first?: number; skip?: number }) {
  const { client, isAvailable } = useAvailableSubgraph();
  const { chainId } = useDeploymentTarget();
  const first = params?.first ?? DEFAULT_PAGE_SIZE;
  const skip = params?.skip ?? 0;

  return useQuery({
    queryKey: ["subgraph", "vaultStates", chainId, first, skip],
    queryFn: async () => {
      if (!client) return null;
      const result = await client.request<{ vaultStateCurrents: RawVaultState[] }>(GET_ADMIN_VAULT_STATES, {
        first,
        skip,
        chainId,
      });

      return result.vaultStateCurrents.map((v: RawVaultState) => ({
        id: v.id as Address,
        registered: Boolean(v.registered),
        paused: Boolean(v.paused),
        depositedCapital: parseBigInt(v.depositedCapital),
        realisedPnl: parseBigInt(v.realisedPnl),
        openInterest: parseBigInt(v.openInterest),
        positionCount: parseBigInt(v.positionCount),
        collateralLocked: parseBigInt(v.collateralLocked),
        updatedAt: parseBigInt(v.updatedAt),
        basket: {
          id: v.basket.id as Address,
          name: v.basket.name ?? "",
          vault: (v.basket.vault ?? v.basket.id) as Address,
          tvlBookUsdc: parseBigInt(v.basket.tvlBookUsdc),
          perpAllocatedUsdc: parseBigInt(v.basket.perpAllocatedUsdc),
        },
      })) as AdminVaultState[];
    },
    enabled: isAvailable,
    staleTime: 15_000,
    retry: 1,
  });
}
