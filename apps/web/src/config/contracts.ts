import { type Address } from "viem";
import { anvil } from "viem/chains";
import { arbitrum, arbitrumSepolia } from "wagmi/chains";
import localDeployment from "./local-deployment.json";

type ContractAddresses = {
  basketFactory: Address;
  vaultAccounting: Address;
  oracleAdapter: Address;
  perpReader: Address;
  pricingEngine: Address;
  fundingRateManager: Address;
  usdc: Address;
  gmxVault: Address;
};

type LocalDeploymentFile = {
  basketFactory: string;
  vaultAccounting: string;
  oracleAdapter: string;
  perpReader: string;
  pricingEngine: string;
  fundingRateManager: string;
  usdc: string;
  gmxVault: string;
};

const ld = localDeployment as LocalDeploymentFile;

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  [anvil.id]: {
    basketFactory: ld.basketFactory as Address,
    vaultAccounting: ld.vaultAccounting as Address,
    oracleAdapter: ld.oracleAdapter as Address,
    perpReader: ld.perpReader as Address,
    pricingEngine: ld.pricingEngine as Address,
    fundingRateManager: ld.fundingRateManager as Address,
    usdc: ld.usdc as Address,
    gmxVault: ld.gmxVault as Address,
  },
  [arbitrum.id]: {
    basketFactory: "0x0000000000000000000000000000000000000001" as Address,
    vaultAccounting: "0x0000000000000000000000000000000000000002" as Address,
    oracleAdapter: "0x0000000000000000000000000000000000000003" as Address,
    perpReader: "0x0000000000000000000000000000000000000004" as Address,
    pricingEngine: "0x0000000000000000000000000000000000000005" as Address,
    fundingRateManager: "0x0000000000000000000000000000000000000006" as Address,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address,
    gmxVault: "0x0000000000000000000000000000000000000008" as Address,
  },
  [arbitrumSepolia.id]: {
    basketFactory: "0x0000000000000000000000000000000000000001" as Address,
    vaultAccounting: "0x0000000000000000000000000000000000000002" as Address,
    oracleAdapter: "0x0000000000000000000000000000000000000003" as Address,
    perpReader: "0x0000000000000000000000000000000000000004" as Address,
    pricingEngine: "0x0000000000000000000000000000000000000005" as Address,
    fundingRateManager: "0x0000000000000000000000000000000000000006" as Address,
    usdc: "0x0000000000000000000000000000000000000007" as Address,
    gmxVault: "0x0000000000000000000000000000000000000008" as Address,
  },
};

export function getContracts(chainId: number): ContractAddresses {
  return CONTRACT_ADDRESSES[chainId] ?? CONTRACT_ADDRESSES[arbitrumSepolia.id];
}
