"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useAccount } from "wagmi";

const PENDING_REDEMPTION_ABI = [
  {
    inputs: [{ name: "id", type: "uint256" }],
    name: "pendingRedemptions",
    outputs: [
      { name: "user", type: "address" },
      { name: "sharesLocked", type: "uint256" },
      { name: "usdcOwed", type: "uint256" },
      { name: "timestamp", type: "uint48" },
      { name: "completed", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "pendingRedemptionCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface PendingRedemption {
  id: number;
  user: string;
  sharesLocked: bigint;
  usdcOwed: bigint;
  timestamp: number;
  completed: boolean;
}

/**
 * Polls pendingRedemptions on a BasketVault for the connected user's
 * active redemptions. Shows pending/processing/completed state.
 */
export function useRedemptionStatus(vaultAddress?: `0x${string}`) {
  const client = usePublicClient();
  const { address: userAddress } = useAccount();

  return useQuery({
    queryKey: ["redemption-status", vaultAddress, userAddress],
    queryFn: async (): Promise<PendingRedemption[]> => {
      if (!client || !vaultAddress || !userAddress) return [];

      const count = await client.readContract({
        address: vaultAddress,
        abi: PENDING_REDEMPTION_ABI,
        functionName: "pendingRedemptionCount",
      });

      const total = Number(count);
      if (total === 0) return [];

      const results: PendingRedemption[] = [];

      // Scan recent redemptions for the user (check last 50 max)
      const start = Math.max(0, total - 50);
      for (let i = start; i < total; i++) {
        const data = await client.readContract({
          address: vaultAddress,
          abi: PENDING_REDEMPTION_ABI,
          functionName: "pendingRedemptions",
          args: [BigInt(i)],
        });

        const [user, sharesLocked, usdcOwed, timestamp, completed] = data as [
          string, bigint, bigint, number, boolean,
        ];

        if (user.toLowerCase() === userAddress.toLowerCase()) {
          results.push({
            id: i,
            user,
            sharesLocked,
            usdcOwed,
            timestamp: Number(timestamp),
            completed,
          });
        }
      }

      return results;
    },
    enabled: !!client && !!vaultAddress && !!userAddress,
    refetchInterval: 10_000,
  });
}
