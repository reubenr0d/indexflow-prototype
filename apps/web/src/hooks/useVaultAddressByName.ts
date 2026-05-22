"use client";

import { useQuery } from "@tanstack/react-query";
import { useConfig } from "wagmi";
import { getPublicClient } from "@wagmi/core";
import { type Address, type Abi } from "viem";
import { BasketFactoryABI, BasketVaultABI } from "@/abi/contracts";
import {
  CONFIGURED_DEPLOYMENT_TARGETS,
  getContractsForDeploymentTarget,
} from "@/config/contracts";
import { CHAIN_REGISTRY, type DeploymentTarget } from "@/lib/deployment";

export interface ChainVaultMatch {
  target: DeploymentTarget;
  chainId: number;
  vaultAddress: Address | null;
  matchedByName: boolean;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/**
 * Cross-chain lookup: given a basket `vaultName`, returns the deployed vault address on
 * every configured deployment target whose `BasketFactory` lists a vault with the same
 * (case-insensitive, whitespace-trimmed) name.
 *
 * The current chain's address is always pinned to `referenceVaultAddress` to avoid the
 * race where the indexer or factory enumeration lags a fresh `createBasket`.
 *
 * Chains with no matching basket return `vaultAddress: null` so callers can clearly
 * surface "this basket is only deployed on chain X" in the UI rather than silently
 * forwarding the reference address to a chain where it doesn't exist (the historical
 * bug that broke the multi-chain deposit drawer).
 */
export function useVaultAddressByName(
  vaultName: string | undefined,
  referenceChainId: number | undefined,
  referenceVaultAddress: Address | undefined,
) {
  const wagmiConfig = useConfig();

  return useQuery({
    queryKey: [
      "vault-address-by-name",
      vaultName?.trim().toLowerCase() ?? "",
      referenceChainId ?? 0,
      referenceVaultAddress?.toLowerCase() ?? "",
    ],
    enabled: Boolean(vaultName && referenceVaultAddress),
    staleTime: 30_000,
    queryFn: async (): Promise<ChainVaultMatch[]> => {
      if (!vaultName || !referenceVaultAddress) return [];
      const normalized = vaultName.trim().toLowerCase();

      const matches = await Promise.all(
        CONFIGURED_DEPLOYMENT_TARGETS.map(async (target): Promise<ChainVaultMatch | null> => {
          const chainId = CHAIN_REGISTRY[target]?.chainId;
          if (!chainId) return null;

          const miss: ChainVaultMatch = {
            target,
            chainId,
            vaultAddress: null,
            matchedByName: false,
          };

          if (referenceChainId && chainId === referenceChainId) {
            return {
              target,
              chainId,
              vaultAddress: referenceVaultAddress,
              matchedByName: false,
            };
          }

          const contracts = getContractsForDeploymentTarget(target);
          if (
            !contracts.basketFactory ||
            contracts.basketFactory === ZERO_ADDRESS
          ) {
            return miss;
          }

          let client: ReturnType<typeof getPublicClient>;
          try {
            client = getPublicClient(wagmiConfig, { chainId });
          } catch {
            return miss;
          }
          if (!client) return miss;

          try {
            const vaults = (await client.readContract({
              address: contracts.basketFactory as Address,
              abi: BasketFactoryABI as Abi,
              functionName: "getAllBaskets",
            })) as readonly Address[];

            if (!vaults || vaults.length === 0) return miss;

            const names = await client.multicall({
              allowFailure: true,
              contracts: vaults.map((addr) => ({
                address: addr,
                abi: BasketVaultABI as Abi,
                functionName: "name",
              })),
            });

            for (let i = 0; i < vaults.length; i++) {
              const result = names[i];
              if (result.status !== "success") continue;
              const rawName = result.result as unknown;
              if (typeof rawName !== "string") continue;
              if (rawName.trim().toLowerCase() === normalized) {
                return {
                  target,
                  chainId,
                  vaultAddress: vaults[i],
                  matchedByName: true,
                };
              }
            }
          } catch {
            return miss;
          }

          return miss;
        }),
      );

      return matches.filter((m): m is ChainVaultMatch => m !== null);
    },
  });
}
