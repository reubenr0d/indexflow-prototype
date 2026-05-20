import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("deployment target helpers", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("defaults to sepolia", async () => {
    const mod = await import("./deployment");
    expect(mod.DEFAULT_DEPLOYMENT_TARGET).toBe("sepolia");
  });

  it("parses supported targets", async () => {
    const { parseDeploymentTarget } = await import("./deployment");
    expect(parseDeploymentTarget("sepolia")).toBe("sepolia");
    expect(parseDeploymentTarget("fuji")).toBe("fuji");
    expect(parseDeploymentTarget("mainnet")).toBeNull();
  });

  it("returns expected chain ids", async () => {
    const { chainIdForDeploymentTarget } = await import("./deployment");
    expect(chainIdForDeploymentTarget("sepolia")).toBe(11155111);
    expect(chainIdForDeploymentTarget("fuji")).toBe(43113);
  });

  it("returns 0 for unknown targets", async () => {
    const { chainIdForDeploymentTarget } = await import("./deployment");
    expect(chainIdForDeploymentTarget("unknown-chain")).toBe(0);
  });
});

describe("getSubgraphUrlForTarget (Envio-only)", () => {
  const originalEnvioUrl = process.env.NEXT_PUBLIC_ENVIO_URL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnvioUrl === undefined) {
      delete process.env.NEXT_PUBLIC_ENVIO_URL;
    } else {
      process.env.NEXT_PUBLIC_ENVIO_URL = originalEnvioUrl;
    }
  });

  it("returns the Envio URL for every configured target when set", async () => {
    process.env.NEXT_PUBLIC_ENVIO_URL = "https://envio.example/v1/graphql";
    const { getSubgraphUrlForTarget } = await import("./deployment");
    expect(getSubgraphUrlForTarget("sepolia")).toBe(
      "https://envio.example/v1/graphql"
    );
    expect(getSubgraphUrlForTarget("fuji")).toBe(
      "https://envio.example/v1/graphql"
    );
    expect(getSubgraphUrlForTarget("arbitrum-sepolia")).toBe(
      "https://envio.example/v1/graphql"
    );
  });

  it("returns null when NEXT_PUBLIC_ENVIO_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_ENVIO_URL;
    const { getSubgraphUrlForTarget } = await import("./deployment");
    expect(getSubgraphUrlForTarget("sepolia")).toBeNull();
    expect(getSubgraphUrlForTarget("fuji")).toBeNull();
    expect(getSubgraphUrlForTarget("arbitrum-sepolia")).toBeNull();
  });
});

describe("chain registry", () => {
  it("includes all testnet chains", async () => {
    const { CHAIN_REGISTRY } = await import("./deployment");
    expect(CHAIN_REGISTRY.sepolia).toBeDefined();
    expect(CHAIN_REGISTRY.fuji).toBeDefined();
    expect(CHAIN_REGISTRY["arbitrum-sepolia"]).toBeDefined();
  });

  it("identifies hub and spoke chains correctly", async () => {
    const { isHubChain, isSpokeChain } = await import("./deployment");
    expect(isHubChain("sepolia")).toBe(true);
    expect(isSpokeChain("fuji")).toBe(true);
    expect(isSpokeChain("arbitrum-sepolia")).toBe(true);
    expect(isHubChain("fuji")).toBe(false);
    expect(isSpokeChain("sepolia")).toBe(false);
  });

  it("returns false for unknown chain roles", async () => {
    const { isHubChain, isSpokeChain } = await import("./deployment");
    expect(isHubChain("nonexistent")).toBe(false);
    expect(isSpokeChain("nonexistent")).toBe(false);
  });
});
