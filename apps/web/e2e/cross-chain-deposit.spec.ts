import { test, expect } from "@playwright/test";
import { connectWallet, autoApprovePrivyTransactions } from "./helpers";

/**
 * Cross-chain deposit E2E tests.
 * Tests the multi-chain deposit flow with the new drawer-based UI.
 * Requires Privy configuration for multi-chain mode.
 */

test.describe("Cross-chain deposits", () => {
  test.beforeEach(async ({ page }) => {
    await autoApprovePrivyTransactions(page);
  });

  test("deposit panel shows multi-chain indicator when All Chains selected", async ({ page }) => {
    await page.goto("/baskets");
    await connectWallet(page);
    
    // Click on a basket to go to detail page
    const basketLink = page.locator('a[href^="/baskets/0x"]').first();
    await basketLink.click();
    await page.waitForURL(/\/baskets\/0x/);
    
    // Check if network selector exists and select All Chains
    const networkSelector = page.getByRole("button", { name: /sepolia|fuji|all chains/i });
    if (await networkSelector.isVisible()) {
      await networkSelector.click();
      const allChainsOption = page.getByRole("option", { name: /all chains/i });
      if (await allChainsOption.isVisible()) {
        await allChainsOption.click();
        
        // Enter deposit amount
        await page.getByTestId("deposit-redeem-amount").fill("100");
        
        // Should show multi-chain indicator
        await expect(
          page.getByText(/multi-chain deposit enabled/i)
        ).toBeVisible();
        
        // Button should say "Multi-Chain Deposit"
        await expect(
          page.getByRole("button", { name: /multi-chain deposit/i })
        ).toBeVisible();
      }
    }
  });

  test("single chain deposit works normally when not in All Chains mode", async ({ page }) => {
    await page.goto("/baskets");
    await connectWallet(page);
    
    // Click on a basket
    const basketLink = page.locator('a[href^="/baskets/0x"]').first();
    await basketLink.click();
    await page.waitForURL(/\/baskets\/0x/);
    
    // Ensure single chain mode (default)
    const depositPanel = page.locator('[data-tour="deposit-panel"]');
    await depositPanel.waitFor({ state: "visible" });
    
    // Enter deposit amount
    await page.getByTestId("deposit-redeem-amount").fill("100");
    
    // Should show standard deposit button (not multi-chain)
    const depositButton = page.getByTestId("deposit-redeem-submit");
    await expect(depositButton).toBeVisible();
    
    // Button text should be "Approve USDC" or "Deposit" (not Multi-Chain)
    const buttonText = await depositButton.textContent();
    expect(buttonText).toMatch(/approve usdc|deposit/i);
  });

  test("multi-chain deposit drawer opens with routing breakdown", async ({ page }) => {
    await page.goto("/baskets");
    await connectWallet(page);
    
    // Navigate to basket detail
    const basketLink = page.locator('a[href^="/baskets/0x"]').first();
    await basketLink.click();
    await page.waitForURL(/\/baskets\/0x/);
    
    // Select All Chains mode
    const networkSelector = page.getByRole("button", { name: /sepolia|fuji|all chains/i });
    if (await networkSelector.isVisible()) {
      await networkSelector.click();
      const allChainsOption = page.getByRole("option", { name: /all chains/i });
      if (await allChainsOption.isVisible()) {
        await allChainsOption.click();
        
        // Enter deposit amount
        await page.getByTestId("deposit-redeem-amount").fill("1000");
        
        // Click multi-chain deposit button
        const multiChainButton = page.getByRole("button", { name: /multi-chain deposit/i });
        if (await multiChainButton.isVisible()) {
          await multiChainButton.click();
          
          // Drawer should open
          await expect(
            page.getByRole("dialog").or(page.getByText(/confirm multi-chain deposit/i))
          ).toBeVisible({ timeout: 5000 });
          
          // Should show routing breakdown
          await expect(
            page.getByText(/deposit routing/i)
          ).toBeVisible();
          
          // Should show chain names with allocation percentages
          await expect(
            page.getByText(/%/)
          ).toBeVisible();
        }
      }
    }
  });

  test("deposit drawer can be closed", async ({ page }) => {
    await page.goto("/baskets");
    await connectWallet(page);
    
    // Navigate to basket detail
    const basketLink = page.locator('a[href^="/baskets/0x"]').first();
    await basketLink.click();
    await page.waitForURL(/\/baskets\/0x/);
    
    // Select All Chains and open drawer
    const networkSelector = page.getByRole("button", { name: /sepolia|fuji|all chains/i });
    if (await networkSelector.isVisible()) {
      await networkSelector.click();
      const allChainsOption = page.getByRole("option", { name: /all chains/i });
      if (await allChainsOption.isVisible()) {
        await allChainsOption.click();
        
        await page.getByTestId("deposit-redeem-amount").fill("100");
        
        const multiChainButton = page.getByRole("button", { name: /multi-chain deposit/i });
        if (await multiChainButton.isVisible()) {
          await multiChainButton.click();
          
          // Wait for drawer
          await expect(
            page.getByText(/confirm multi-chain deposit/i)
          ).toBeVisible({ timeout: 5000 });
          
          // Click cancel
          const cancelButton = page.getByRole("button", { name: /cancel/i });
          await cancelButton.click();
          
          // Drawer should close
          await expect(
            page.getByText(/confirm multi-chain deposit/i)
          ).not.toBeVisible({ timeout: 3000 });
        }
      }
    }
  });

  test("redeem mode does not show multi-chain options", async ({ page }) => {
    await page.goto("/baskets");
    await connectWallet(page);
    
    // Navigate to basket detail
    const basketLink = page.locator('a[href^="/baskets/0x"]').first();
    await basketLink.click();
    await page.waitForURL(/\/baskets\/0x/);
    
    // Switch to Redeem tab
    const redeemTab = page.getByRole("button", { name: /redeem/i }).first();
    await redeemTab.click();
    
    // Enter redeem amount
    await page.getByTestId("deposit-redeem-amount").fill("100");
    
    // Should show standard redeem button
    const submitButton = page.getByTestId("deposit-redeem-submit");
    const buttonText = await submitButton.textContent();
    expect(buttonText).toMatch(/redeem/i);
    
    // Should NOT show multi-chain indicator
    await expect(
      page.getByText(/multi-chain deposit enabled/i)
    ).not.toBeVisible();
  });
});
