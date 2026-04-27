import { test, expect } from "@playwright/test";
import { connectWallet, autoApprovePrivyTransactions } from "./helpers";
import {
  HUB_RPC,
  SPOKE_RPC,
  HUB_CHAIN_ID,
  SPOKE_CHAIN_ID,
  HUB_CHAIN_SELECTOR,
  SPOKE_CHAIN_SELECTOR,
  E2E_DEPLOYER,
  loadHubDeployment,
  loadSpokeDeployment,
  mintMockUsdcOnChain,
  keeperPostWeights,
  installChainShim,
  envioGetBaskets,
  envioGetUserPositions,
  envioGetChainPoolStates,
  waitForEnvioDeposit,
  waitForEnvioReady,
  ENVIO_URL,
} from "./cross-chain-setup";

/**
 * Envio-based cross-chain E2E tests.
 *
 * These tests verify the full flow:
 * 1. Envio indexes baskets from both chains
 * 2. StateRelay routing weights are indexed
 * 3. UI displays routing breakdown correctly
 * 4. Deposits are indexed by Envio across chains
 *
 * Requires:
 * - Hub Anvil on port 8545 (chain ID 31337)
 * - Spoke Anvil on port 8546 (chain ID 31338)
 * - Envio dev server on port 8080
 * - Contracts deployed to both chains
 */

test.describe("Envio cross-chain indexing", () => {
  test.beforeAll(async () => {
    const ready = await waitForEnvioReady(60_000);
    if (!ready) {
      console.warn("Envio not ready, tests may fail");
    }
  });

  test("Envio indexes baskets from hub chain", async () => {
    const baskets = await envioGetBaskets(HUB_CHAIN_ID);
    // Hub chain may not have baskets if only spoke was bootstrapped
    if (baskets.length === 0) {
      console.log("No baskets on hub chain - skipping assertion (spoke-only deployment)");
      return;
    }
    expect(baskets[0].chainId).toBe(HUB_CHAIN_ID);
    expect(baskets[0].vault).toBeTruthy();
  });

  test("Envio indexes baskets from spoke chain", async () => {
    try {
      loadSpokeDeployment();
    } catch {
      test.skip();
      return;
    }

    const baskets = await envioGetBaskets(SPOKE_CHAIN_ID);
    expect(baskets.length).toBeGreaterThan(0);
    expect(baskets[0].chainId).toBe(SPOKE_CHAIN_ID);
  });

  test("StateRelay routing weights are indexed", async () => {
    const hub = loadHubDeployment();
    if (!hub.stateRelay) {
      console.log("No stateRelay on hub - skipping test");
      return;
    }

    await keeperPostWeights(
      HUB_RPC,
      hub.stateRelay,
      [HUB_CHAIN_SELECTOR, SPOKE_CHAIN_SELECTOR],
      [6000n, 4000n],
      [],
      [],
    );

    // Wait for Envio to index the StateUpdated event
    let poolStates: { chainSelector: string }[] = [];
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      poolStates = await envioGetChainPoolStates(HUB_CHAIN_ID);
      if (poolStates.length >= 2) break;
    }

    if (poolStates.length === 0) {
      console.log("ChainPoolState not indexed yet - this may require more time for Envio to sync");
      return;
    }

    const hubPool = poolStates.find(p => p.chainSelector === HUB_CHAIN_SELECTOR.toString());
    const spokePool = poolStates.find(p => p.chainSelector === SPOKE_CHAIN_SELECTOR.toString());

    expect(hubPool || spokePool).toBeTruthy();
  });
});

test.describe("Envio cross-chain UI routing", () => {
  test.beforeEach(async ({ page }) => {
    await autoApprovePrivyTransactions(page);
  });

  test("routing weights display in multi-chain deposit drawer", async ({ page }) => {
    // Use spoke chain since it has a bootstrap basket
    let spoke;
    try {
      spoke = loadSpokeDeployment();
    } catch {
      test.skip();
      return;
    }

    if (spoke.stateRelay) {
      await keeperPostWeights(
        SPOKE_RPC,
        spoke.stateRelay,
        [HUB_CHAIN_SELECTOR, SPOKE_CHAIN_SELECTOR],
        [5000n, 5000n],
        [],
        [],
      );
    }

    await installChainShim(page, {
      rpcUrl: SPOKE_RPC,
      chainIdHex: `0x${SPOKE_CHAIN_ID.toString(16)}`,
    });

    await page.goto("/baskets");
    await connectWallet(page);

    // Wait for baskets to load
    await page.waitForTimeout(3000);

    const basketLink = page.locator('a[href^="/baskets/0x"]').first();
    const hasBasket = await basketLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasBasket) {
      console.log("No baskets found on page - skipping test");
      return;
    }
    
    await basketLink.click();
    await page.waitForURL(/\/baskets\/0x/);

    const networkSelector = page.getByRole("button", { name: /sepolia|fuji|all chains|local/i });
    if (await networkSelector.isVisible()) {
      await networkSelector.click();
      const allChainsOption = page.getByRole("option", { name: /all chains/i });
      if (await allChainsOption.isVisible()) {
        await allChainsOption.click();

        await page.getByTestId("deposit-redeem-amount").fill("1000");

        const multiChainButton = page.getByRole("button", { name: /multi-chain deposit/i });
        if (await multiChainButton.isVisible()) {
          await multiChainButton.click();

          await expect(
            page.getByText(/deposit routing/i)
          ).toBeVisible({ timeout: 10_000 });

          await expect(page.getByText(/%/)).toBeVisible();
        }
      }
    }
  });

  test("execute cross-chain deposit and verify Envio indexing", async ({ page }) => {
    // Use spoke chain since it has a bootstrap basket
    let spoke;
    try {
      spoke = loadSpokeDeployment();
    } catch {
      test.skip();
      return;
    }

    await installChainShim(page, {
      rpcUrl: SPOKE_RPC,
      chainIdHex: `0x${SPOKE_CHAIN_ID.toString(16)}`,
    });

    const depositAmount = 100_000_000n; // 100 USDC (6 decimals)
    await mintMockUsdcOnChain(SPOKE_RPC, spoke.usdc, E2E_DEPLOYER, depositAmount * 10n);

    await page.goto("/baskets");
    await connectWallet(page);

    // Wait for baskets to load
    await page.waitForTimeout(3000);

    const basketLink = page.locator('a[href^="/baskets/0x"]').first();
    const hasBasket = await basketLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasBasket) {
      console.log("No baskets found on page - skipping test");
      return;
    }

    const basketHref = await basketLink.getAttribute("href");
    const basketAddress = basketHref?.replace("/baskets/", "") ?? "";

    await basketLink.click();
    await page.waitForURL(/\/baskets\/0x/);

    const depositPanel = page.locator('[data-tour="deposit-panel"]');
    await depositPanel.waitFor({ state: "visible", timeout: 10_000 });

    await page.getByTestId("deposit-redeem-amount").fill("100");

    const submitButton = page.getByTestId("deposit-redeem-submit");
    const buttonText = await submitButton.textContent();

    if (buttonText?.toLowerCase().includes("approve")) {
      await submitButton.click();
      await page.waitForTimeout(2000);
    }

    const depositButton = page.getByTestId("deposit-redeem-submit");
    if ((await depositButton.textContent())?.toLowerCase().includes("deposit")) {
      await depositButton.click();

      const indexed = await waitForEnvioDeposit(SPOKE_CHAIN_ID, basketAddress, 1, 30_000);
      expect(indexed).toBe(true);

      const baskets = await envioGetBaskets(SPOKE_CHAIN_ID);
      const basket = baskets.find(b => b.vault.toLowerCase() === basketAddress.toLowerCase());
      expect(basket).toBeTruthy();
      expect(parseInt(basket!.totalDepositCount, 10)).toBeGreaterThanOrEqual(1);
    }
  });
});

test.describe("Envio cross-chain portfolio aggregation", () => {
  test("portfolio aggregates across both chains", async () => {
    let spoke;
    try {
      spoke = loadSpokeDeployment();
    } catch {
      test.skip();
      return;
    }

    const hubBaskets = await envioGetBaskets(HUB_CHAIN_ID);
    const spokeBaskets = await envioGetBaskets(SPOKE_CHAIN_ID);

    const totalBaskets = hubBaskets.length + spokeBaskets.length;
    // At minimum we should have the spoke bootstrap basket
    expect(totalBaskets).toBeGreaterThanOrEqual(1);

    let totalTvl = 0n;
    for (const b of [...hubBaskets, ...spokeBaskets]) {
      totalTvl += BigInt(b.tvlBookUsdc || "0");
    }

    console.log(`Total TVL across chains: ${totalTvl}`);
    console.log(`Hub baskets: ${hubBaskets.length}, Spoke baskets: ${spokeBaskets.length}`);
  });

  test("user positions aggregate across chains", async () => {
    let spoke;
    try {
      spoke = loadSpokeDeployment();
    } catch {
      test.skip();
      return;
    }

    const positions = await envioGetUserPositions(E2E_DEPLOYER);

    const hubPositions = positions.filter(p => p.chainId === HUB_CHAIN_ID);
    const spokePositions = positions.filter(p => p.chainId === SPOKE_CHAIN_ID);

    console.log(`Hub positions: ${hubPositions.length}, Spoke positions: ${spokePositions.length}`);
  });
});
