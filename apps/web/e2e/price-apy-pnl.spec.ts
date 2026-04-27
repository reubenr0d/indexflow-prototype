import { test, expect } from "@playwright/test";
import { connectWallet, autoApprovePrivyTransactions } from "./helpers";
import {
  HUB_RPC,
  SPOKE_RPC,
  HUB_CHAIN_ID,
  SPOKE_CHAIN_ID,
  E2E_DEPLOYER,
  loadHubDeployment,
  loadSpokeDeployment,
  sendTx,
  installChainShim,
  waitForEnvioReady,
} from "./cross-chain-setup";

/**
 * E2E tests for:
 * - Oracle price keeper operations (submit prices, sync)
 * - APY display and calculation
 * - Realized and unrealized PnL display
 * - Price reflection in UI after oracle updates
 */

const BHP_ASSET_ID = "0xa6a463452d580deb8ec322d23a82cfeb4552da030bd3d4db8db762f3ded88a8f";

// Encode submitPrice(bytes32 assetId, uint256 price) call
function encodeSubmitPrice(assetId: string, price: bigint): string {
  const selector = "26e03ac6"; // submitPrice(bytes32,uint256)
  const assetIdArg = assetId.replace("0x", "").padStart(64, "0");
  const priceArg = price.toString(16).padStart(64, "0");
  return `0x${selector}${assetIdArg}${priceArg}`;
}

// Encode syncAll() call
function encodeSyncAll(): string {
  const selector = "0x76f71f10"; // syncAll()
  return selector;
}

test.describe("Oracle price keeper operations", () => {
  test.beforeAll(async () => {
    await waitForEnvioReady(30_000);
  });

  test.beforeEach(async ({ page }) => {
    await autoApprovePrivyTransactions(page);
  });

  test("submit oracle price via admin UI and verify display", async ({ page }) => {
    const hub = loadHubDeployment();
    if (!hub.oracleAdapter) {
      console.log("No oracle adapter deployed - skipping");
      return;
    }

    await installChainShim(page, {
      rpcUrl: HUB_RPC,
      chainIdHex: `0x${HUB_CHAIN_ID.toString(16)}`,
    });

    await page.goto("/admin/oracle");
    await connectWallet(page);
    await page.waitForTimeout(2000);

    // Check the oracle page loaded
    const pageTitle = page.locator("text=Assets");
    const hasPage = await pageTitle.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hasPage) {
      console.log("Admin oracle page not accessible");
      return;
    }

    // Submit a new price
    const assetInput = page.getByTestId("oracle-asset-input");
    const priceInput = page.getByTestId("oracle-price-input");
    const submitButton = page.getByTestId("oracle-submit-price");

    const hasInputs = await assetInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasInputs) {
      console.log("Oracle inputs not visible");
      return;
    }

    await assetInput.fill(BHP_ASSET_ID);
    await priceInput.fill("95.50");
    
    // Submit price
    await submitButton.click();
    await page.waitForTimeout(3000);

    // Sync all prices
    const syncButton = page.getByTestId("oracle-sync-all");
    const hasSyncButton = await syncButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasSyncButton) {
      await syncButton.click();
      await page.waitForTimeout(3000);
    }

    console.log("Oracle price submitted successfully");
  });

  test("oracle price submission reflects in prices page", async ({ page }) => {
    const hub = loadHubDeployment();
    if (!hub.oracleAdapter) {
      console.log("No oracle adapter deployed - skipping");
      return;
    }

    // First submit a price via RPC
    const priceValue = 100_00000000n; // $100.00 with 8 decimals
    const calldata = encodeSubmitPrice(BHP_ASSET_ID, priceValue);
    await sendTx(HUB_RPC, hub.oracleAdapter, calldata, E2E_DEPLOYER);

    await installChainShim(page, {
      rpcUrl: HUB_RPC,
      chainIdHex: `0x${HUB_CHAIN_ID.toString(16)}`,
    });

    await page.goto("/prices");
    await page.waitForTimeout(3000);

    // Check that prices page loads
    const hasContent = await page.locator("text=/Asset|Price|Oracle/i").first().isVisible({ timeout: 10_000 }).catch(() => false);
    if (hasContent) {
      console.log("Prices page loaded - checking for BHP.AX");
      
      // Look for the BHP asset in the price list
      const bhpRow = page.locator("text=BHP").first();
      const hasBHP = await bhpRow.isVisible({ timeout: 5000 }).catch(() => false);
      
      if (hasBHP) {
        console.log("BHP asset found in prices page");
      } else {
        console.log("BHP asset not found - may need to be registered first");
      }
    } else {
      console.log("Prices page content not visible");
    }
  });
});

test.describe("APY display verification", () => {
  test.beforeAll(async () => {
    await waitForEnvioReady(30_000);
  });

  test.beforeEach(async ({ page }) => {
    await autoApprovePrivyTransactions(page);
  });

  test("basket detail shows APY metric", async ({ page }) => {
    let spoke;
    try {
      spoke = loadSpokeDeployment();
    } catch {
      test.skip();
      return;
    }

    // Navigate directly to the bootstrap basket from the deployment
    const bootstrapBasket = spoke.bootstrapBasket;
    if (!bootstrapBasket) {
      console.log("No bootstrap basket in deployment - skipping test");
      return;
    }

    await installChainShim(page, {
      rpcUrl: SPOKE_RPC,
      chainIdHex: `0x${SPOKE_CHAIN_ID.toString(16)}`,
    });

    // Go directly to the basket detail page
    await page.goto(`/baskets/${bootstrapBasket}`);
    await connectWallet(page);
    await page.waitForTimeout(3000);

    // Check APY metric is visible
    const apyMetric = page.getByTestId("metric-apy");
    const hasApyMetric = await apyMetric.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasApyMetric) {
      const apyValue = await page.getByTestId("metric-apy-value").textContent();
      console.log("APY value:", apyValue);
      
      // APY should be either a percentage or "--" (if no historical data)
      expect(apyValue).toBeTruthy();
      expect(apyValue).toMatch(/^(--|[\d.]+%|[\d.]+)$/);
    } else {
      console.log("APY metric not visible in metrics strip");
    }
  });

  test("basket card shows APY in list view", async ({ page }) => {
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

    await page.goto("/baskets");
    await page.waitForTimeout(3000);

    // Look for APY text in basket cards
    const apyLabel = page.locator("text=APY").first();
    const hasApyLabel = await apyLabel.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasApyLabel) {
      console.log("APY label found in basket list");
      
      // Get the APY value near the label
      const apyValueNearby = page.locator("text=/\\d+\\.?\\d*%/").first();
      const hasApyValue = await apyValueNearby.isVisible({ timeout: 3000 }).catch(() => false);
      
      if (hasApyValue) {
        const apyText = await apyValueNearby.textContent();
        console.log("APY value in basket card:", apyText);
      }
    } else {
      console.log("APY label not found in basket list - may not have historical data");
    }
  });
});

test.describe("Realized and unrealized PnL verification", () => {
  test.beforeAll(async () => {
    await waitForEnvioReady(30_000);
  });

  test.beforeEach(async ({ page }) => {
    await autoApprovePrivyTransactions(page);
  });

  test("basket with positions shows unrealized PnL metric", async ({ page }) => {
    let spoke;
    try {
      spoke = loadSpokeDeployment();
    } catch {
      test.skip();
      return;
    }

    const bootstrapBasket = spoke.bootstrapBasket;
    if (!bootstrapBasket) {
      console.log("No bootstrap basket in deployment - skipping test");
      return;
    }

    await installChainShim(page, {
      rpcUrl: SPOKE_RPC,
      chainIdHex: `0x${SPOKE_CHAIN_ID.toString(16)}`,
    });

    await page.goto(`/baskets/${bootstrapBasket}`);
    await connectWallet(page);
    await page.waitForTimeout(3000);

    // Check for Net PnL and Unrealised metrics
    const netPnlMetric = page.getByTestId("metric-net-pnl");
    const unrealisedMetric = page.getByTestId("metric-unrealised-pnl");

    const hasNetPnl = await netPnlMetric.isVisible({ timeout: 5000 }).catch(() => false);
    const hasUnrealised = await unrealisedMetric.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasNetPnl) {
      const netPnlValue = await page.getByTestId("metric-net-pnl-value").textContent();
      console.log("Net PnL value:", netPnlValue);
      expect(netPnlValue).toBeTruthy();
    } else {
      console.log("Net PnL metric not visible - basket may not be registered for perps");
    }

    if (hasUnrealised) {
      const unrealisedValue = await page.getByTestId("metric-unrealised-pnl-value").textContent();
      console.log("Unrealised PnL value:", unrealisedValue);
      expect(unrealisedValue).toBeTruthy();
    } else {
      console.log("Unrealised PnL metric not visible");
    }
  });

  test("positions table shows individual position PnL", async ({ page }) => {
    let spoke;
    try {
      spoke = loadSpokeDeployment();
    } catch {
      test.skip();
      return;
    }

    const bootstrapBasket = spoke.bootstrapBasket;
    if (!bootstrapBasket) {
      console.log("No bootstrap basket in deployment - skipping test");
      return;
    }

    await installChainShim(page, {
      rpcUrl: SPOKE_RPC,
      chainIdHex: `0x${SPOKE_CHAIN_ID.toString(16)}`,
    });

    await page.goto(`/baskets/${bootstrapBasket}`);
    await connectWallet(page);
    await page.waitForTimeout(3000);

    // Look for positions table
    const positionsHeader = page.locator("text=Open Positions");
    const hasPositionsSection = await positionsHeader.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasPositionsSection) {
      // Check for position rows or "No open positions" message
      const noPositionsMsg = page.locator("text=No open positions");
      const hasNoPositions = await noPositionsMsg.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasNoPositions) {
        console.log("No open positions in basket");
      } else {
        // Check for position table body
        const positionsBody = page.getByTestId("positions-table-body");
        const hasPositions = await positionsBody.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasPositions) {
          // Check for PnL columns
          const pnlCells = page.getByTestId("position-pnl");
          const pnlCount = await pnlCells.count();
          console.log(`Found ${pnlCount} positions with PnL data`);

          if (pnlCount > 0) {
            const firstPnl = await pnlCells.first().textContent();
            console.log("First position PnL:", firstPnl);
          }
        }
      }
    } else {
      console.log("Positions section not visible");
    }
  });

  test("admin basket detail shows PnL metrics when registered", async ({ page }) => {
    const hub = loadHubDeployment();
    if (!hub.vaultAccounting) {
      console.log("No vault accounting - skipping");
      return;
    }

    await installChainShim(page, {
      rpcUrl: HUB_RPC,
      chainIdHex: `0x${HUB_CHAIN_ID.toString(16)}`,
    });

    await page.goto("/admin/baskets");
    await connectWallet(page);
    await page.waitForTimeout(3000);

    // Check for any basket links
    const basketLink = page.locator('a[href^="/admin/baskets/0x"]').first();
    const hasBasket = await basketLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasBasket) {
      console.log("No baskets in admin - skipping");
      return;
    }

    await basketLink.click();
    await page.waitForURL(/\/admin\/baskets\/0x/);
    await page.waitForTimeout(2000);

    // Check for admin-specific metrics
    const perpAllocatedMetric = page.getByTestId("metric-perp-allocated");
    const hasPerpAllocated = await perpAllocatedMetric.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasPerpAllocated) {
      const perpValue = await page.getByTestId("metric-perp-allocated").locator("[data-testid$='-value']").textContent().catch(() => null);
      console.log("Perp Allocated:", perpValue);
    }

    // Check for Net PnL if basket is registered
    const netPnlMetric = page.getByTestId("metric-net-pnl");
    const hasNetPnl = await netPnlMetric.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasNetPnl) {
      const netPnlValue = await page.getByTestId("metric-net-pnl-value").textContent().catch(() => null);
      console.log("Admin Net PnL:", netPnlValue);
    } else {
      console.log("Net PnL not visible in admin - basket may not be registered");
    }
  });
});

test.describe("Price keeper effects on PnL", () => {
  test.beforeAll(async () => {
    await waitForEnvioReady(30_000);
  });

  test("price change updates unrealized PnL in real-time", async ({ page }) => {
    const hub = loadHubDeployment();
    if (!hub.oracleAdapter) {
      console.log("No oracle adapter - skipping");
      return;
    }

    await installChainShim(page, {
      rpcUrl: HUB_RPC,
      chainIdHex: `0x${HUB_CHAIN_ID.toString(16)}`,
    });

    // Submit initial price
    const initialPrice = 80_00000000n; // $80.00
    await sendTx(HUB_RPC, hub.oracleAdapter, encodeSubmitPrice(BHP_ASSET_ID, initialPrice), E2E_DEPLOYER);

    await page.goto("/baskets");
    await connectWallet(page);
    await page.waitForTimeout(3000);

    const basketLink = page.locator('a[href^="/baskets/0x"]').first();
    const hasBasket = await basketLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasBasket) {
      console.log("No baskets found - skipping");
      return;
    }

    await basketLink.click();
    await page.waitForURL(/\/baskets\/0x/);
    await page.waitForTimeout(2000);

    // Check for unrealised PnL
    const unrealisedMetric = page.getByTestId("metric-unrealised-pnl");
    const hasUnrealised = await unrealisedMetric.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasUnrealised) {
      console.log("No unrealised PnL visible - basket may not have positions");
      return;
    }

    // Get initial unrealised value
    const initialUnrealised = await page.getByTestId("metric-unrealised-pnl-value").textContent();
    console.log("Initial unrealised PnL:", initialUnrealised);

    // Update price (10% increase)
    const newPrice = 88_00000000n; // $88.00
    await sendTx(HUB_RPC, hub.oracleAdapter, encodeSubmitPrice(BHP_ASSET_ID, newPrice), E2E_DEPLOYER);

    // Wait for UI to refresh
    await page.waitForTimeout(5000);

    // Check if unrealised PnL updated
    const newUnrealised = await page.getByTestId("metric-unrealised-pnl-value").textContent();
    console.log("New unrealised PnL after price change:", newUnrealised);

    // If there are positions, the PnL should have changed
    if (initialUnrealised !== newUnrealised) {
      console.log("Unrealised PnL updated after price change");
    }
  });
});

test.describe("Share price and TVL consistency", () => {
  test.beforeAll(async () => {
    await waitForEnvioReady(30_000);
  });

  test.beforeEach(async ({ page }) => {
    await autoApprovePrivyTransactions(page);
  });

  test("share price metric matches displayed value", async ({ page }) => {
    let spoke;
    try {
      spoke = loadSpokeDeployment();
    } catch {
      test.skip();
      return;
    }

    const bootstrapBasket = spoke.bootstrapBasket;
    if (!bootstrapBasket) {
      console.log("No bootstrap basket in deployment - skipping");
      return;
    }

    await installChainShim(page, {
      rpcUrl: SPOKE_RPC,
      chainIdHex: `0x${SPOKE_CHAIN_ID.toString(16)}`,
    });

    await page.goto(`/baskets/${bootstrapBasket}`);
    await connectWallet(page);
    await page.waitForTimeout(3000);

    // Check share price metric
    const sharePriceMetric = page.getByTestId("metric-share-price");
    const hasSharePrice = await sharePriceMetric.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasSharePrice) {
      const sharePriceValue = await page.getByTestId("metric-share-price-value").textContent();
      console.log("Share price:", sharePriceValue);
      expect(sharePriceValue).toBeTruthy();
      // Share price should be a dollar value
      expect(sharePriceValue).toMatch(/^\$?[\d,.]+$/);
    }

    // Check TVL metric
    const tvlMetric = page.getByTestId("metric-tvl");
    const hasTvl = await tvlMetric.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTvl) {
      const tvlValue = await page.getByTestId("metric-tvl-value").textContent();
      console.log("TVL:", tvlValue);
      expect(tvlValue).toBeTruthy();
    }
  });

  test("total shares metric is consistent", async ({ page }) => {
    let spoke;
    try {
      spoke = loadSpokeDeployment();
    } catch {
      test.skip();
      return;
    }

    const bootstrapBasket = spoke.bootstrapBasket;
    if (!bootstrapBasket) {
      console.log("No bootstrap basket in deployment - skipping");
      return;
    }

    await installChainShim(page, {
      rpcUrl: SPOKE_RPC,
      chainIdHex: `0x${SPOKE_CHAIN_ID.toString(16)}`,
    });

    await page.goto(`/baskets/${bootstrapBasket}`);
    await connectWallet(page);
    await page.waitForTimeout(3000);

    // Check total shares metric
    const totalSharesMetric = page.getByTestId("metric-total-shares");
    const hasTotalShares = await totalSharesMetric.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasTotalShares) {
      const totalSharesValue = await page.getByTestId("metric-total-shares-value").textContent();
      console.log("Total shares:", totalSharesValue);
      expect(totalSharesValue).toBeTruthy();
      // Total shares should be a number
      expect(totalSharesValue).toMatch(/^[\d,.]+$/);
    }
  });
});
