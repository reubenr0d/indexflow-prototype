import type { Abi } from "viem";
import { BasketVaultABI } from "./BasketVault";
import { BasketFactoryABI } from "./BasketFactory";
import { BasketShareTokenABI } from "./BasketShareToken";
import { VaultAccountingABI } from "./VaultAccounting";
import { OracleAdapterABI } from "./OracleAdapter";
import { PricingEngineABI } from "./PricingEngine";
import { FundingRateManagerABI } from "./FundingRateManager";

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
