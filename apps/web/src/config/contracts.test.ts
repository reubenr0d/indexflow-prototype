import { describe, expect, it } from "vitest";
import { anvil, avalancheFuji } from "viem/chains";
import { sepolia } from "wagmi/chains";
import localDeployment from "./local-deployment.json";
import sepoliaDeployment from "./sepolia-deployment.json";
import fujiDeployment from "./fuji-deployment.json";
import { getContracts, getContractsForDeploymentTarget } from "./contracts";

describe("contract address resolution", () => {
  it("resolves anvil deployment addresses from local deployment config", () => {
    const contracts = getContractsForDeploymentTarget("anvil");
    expect(contracts.basketFactory.toLowerCase()).toBe(localDeployment.basketFactory.toLowerCase());
    expect(contracts.usdc.toLowerCase()).toBe(localDeployment.usdc.toLowerCase());
  });

  it("resolves sepolia deployment addresses from sepolia deployment config", () => {
    const contracts = getContractsForDeploymentTarget("sepolia");
    expect(contracts.basketFactory.toLowerCase()).toBe(sepoliaDeployment.basketFactory.toLowerCase());
    expect(contracts.usdc.toLowerCase()).toBe(sepoliaDeployment.usdc.toLowerCase());
  });

  it("resolves fuji deployment addresses from fuji deployment config", () => {
    const contracts = getContractsForDeploymentTarget("fuji");
    expect(contracts.basketFactory.toLowerCase()).toBe(fujiDeployment.basketFactory.toLowerCase());
    expect(contracts.usdc.toLowerCase()).toBe(fujiDeployment.usdc.toLowerCase());
  });

  it("keeps compatibility chain resolver behavior", () => {
    expect(getContracts(anvil.id).usdc.toLowerCase()).toBe(localDeployment.usdc.toLowerCase());
    expect(getContracts(sepolia.id).usdc.toLowerCase()).toBe(sepoliaDeployment.usdc.toLowerCase());
    expect(getContracts(avalancheFuji.id).usdc.toLowerCase()).toBe(fujiDeployment.usdc.toLowerCase());
  });
});
