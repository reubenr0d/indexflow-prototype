import { type Address } from "viem";

export type AdminPortfolioBasketRow = {
  vault: Address;
  name: string;
  perpAllocated: bigint;
  availableForPerp: bigint;
  currentSplitBps: bigint;
  targetSplitBps: bigint;
  proposedTopUp: bigint;
};

export type BatchTopUpStatus = {
  vault: Address;
  amount: bigint;
  status: "idle" | "pending" | "success" | "failed";
  txHash?: `0x${string}`;
  error?: string;
};
