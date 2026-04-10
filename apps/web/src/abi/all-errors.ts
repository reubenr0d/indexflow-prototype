import type { Abi } from "viem";
import {
  BasketVaultABI,
  BasketFactoryABI,
  BasketShareTokenABI,
  VaultAccountingABI,
  OracleAdapterABI,
  PricingEngineABI,
  FundingRateManagerABI,
} from "./contracts";

const ALL_ABIS: readonly Abi[] = [
  BasketVaultABI as unknown as Abi,
  BasketFactoryABI as unknown as Abi,
  BasketShareTokenABI as unknown as Abi,
  VaultAccountingABI as unknown as Abi,
  OracleAdapterABI as unknown as Abi,
  PricingEngineABI as unknown as Abi,
  FundingRateManagerABI as unknown as Abi,
];

function collectErrors(abis: readonly Abi[]): Abi {
  const seen = new Set<string>();
  const errors: Abi[number][] = [];
  for (const abi of abis) {
    for (const item of abi) {
      if (!("type" in item) || item.type !== "error") continue;
      const key = `${item.name}(${item.inputs.map((i) => i.type).join(",")})`;
      if (seen.has(key)) continue;
      seen.add(key);
      errors.push(item);
    }
  }
  return errors;
}

export const ALL_ERRORS_ABI = collectErrors(ALL_ABIS);
