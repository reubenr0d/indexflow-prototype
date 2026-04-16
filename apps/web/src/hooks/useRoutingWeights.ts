"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { type DeploymentTarget, CHAIN_REGISTRY } from "@/lib/deployment";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { StateRelayABI } from "@/abi/contracts";

export interface ChainWeight {
  chainSelector: bigint;
  chainName: string;
  weightBps: number;
}

/**
 * Reads StateRelay.getRoutingWeights() from any chain (data is the same everywhere)
 * and returns a list of chain weights. Used by the deposit panel to show which
 * chains are accepting deposits and compute deposit splits.
 */
export function useRoutingWeights(stateRelayAddress?: `0x${string}`) {
  const client = usePublicClient();
  const { target } = useDeploymentTarget();

  return useQuery({
    queryKey: ["routing-weights", target, stateRelayAddress],
    queryFn: async (): Promise<ChainWeight[]> => {
      if (!client || !stateRelayAddress) return [];

      const result = await client.readContract({
        address: stateRelayAddress,
        abi: StateRelayABI,
        functionName: "getRoutingWeights",
      });

      const [chainSelectors, weights] = result as [bigint[], bigint[], bigint[]];

      const selectorToName = new Map<string, string>();
      for (const [name, cfg] of Object.entries(CHAIN_REGISTRY)) {
        selectorToName.set(cfg.ccipChainSelector, name);
      }

      return chainSelectors.map((sel, i) => ({
        chainSelector: sel,
        chainName: selectorToName.get(sel.toString()) ?? `Chain ${sel}`,
        weightBps: Number(weights[i]),
      }));
    },
    enabled: !!client && !!stateRelayAddress,
    staleTime: 15_000,
  });
}
