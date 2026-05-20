import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("envio indexer URL helpers", () => {
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

  it("returns the Envio URL for any deployment target when set", async () => {
    process.env.NEXT_PUBLIC_ENVIO_URL = "https://envio.example/v1/graphql";
    const mod = await import("./subgraphs");
    expect(mod.ENVIO_UNIFIED_URL).toBe("https://envio.example/v1/graphql");
    expect(mod.getConfiguredSubgraphUrlForTarget("sepolia")).toBe(
      "https://envio.example/v1/graphql"
    );
    expect(mod.getConfiguredSubgraphUrlForTarget("fuji")).toBe(
      "https://envio.example/v1/graphql"
    );
    expect(mod.getConfiguredSubgraphUrlForTarget("arbitrum-sepolia")).toBe(
      "https://envio.example/v1/graphql"
    );
  });

  it("returns null when NEXT_PUBLIC_ENVIO_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_ENVIO_URL;
    const mod = await import("./subgraphs");
    expect(mod.ENVIO_UNIFIED_URL).toBe("");
    expect(mod.getConfiguredSubgraphUrlForTarget("sepolia")).toBeNull();
    expect(mod.getConfiguredSubgraphUrlForTarget("fuji")).toBeNull();
  });

  it("treats whitespace-only env values as unset", async () => {
    process.env.NEXT_PUBLIC_ENVIO_URL = "   ";
    const mod = await import("./subgraphs");
    expect(mod.ENVIO_UNIFIED_URL).toBe("");
    expect(mod.getConfiguredSubgraphUrlForTarget("sepolia")).toBeNull();
  });
});
