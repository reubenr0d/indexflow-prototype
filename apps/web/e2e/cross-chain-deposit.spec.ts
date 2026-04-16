import { test, expect } from "@playwright/test";

/**
 * Cross-chain deposit E2E tests.
 * Requires dual-Anvil setup (hub on 8545, spoke on 8546).
 * See cross-chain-setup.ts for infrastructure helpers.
 */

test.describe("Cross-chain deposits", () => {
  test("single chain deposit on open chain", async ({ page }) => {
    await page.goto("/baskets");
    // Select spoke chain from chain selector
    await page.getByTestId("chain-selector").click();
    await page.getByRole("option", { name: /fuji/i }).click();
    // Enter deposit amount
    await page.getByTestId("deposit-amount").fill("100");
    await page.getByTestId("deposit-button").click();
    // Verify success state
    await expect(page.getByText(/deposited/i)).toBeVisible({ timeout: 30_000 });
  });

  test("single chain deposit blocked shows switch prompt", async ({ page }) => {
    await page.goto("/baskets");
    // Select a chain with weight = 0 (keeper has blocked it)
    await page.getByTestId("chain-selector").click();
    await page.getByRole("option", { name: /arbitrum/i }).click();
    await page.getByTestId("deposit-amount").fill("100");
    // Should show "not accepting deposits" prompt
    await expect(
      page.getByText(/not accepting deposits|switch to all chains/i),
    ).toBeVisible();
  });

  test("all chains deposit shows split breakdown", async ({ page }) => {
    await page.goto("/baskets");
    await page.getByTestId("chain-selector").click();
    await page.getByRole("option", { name: /all chains/i }).click();
    await page.getByTestId("deposit-amount").fill("1000");
    // Should show per-chain split
    await expect(page.getByTestId("deposit-split")).toBeVisible();
    await expect(page.getByText(/%/)).toBeVisible();
  });

  test("deposit stepper completes all chains", async ({ page }) => {
    await page.goto("/baskets");
    await page.getByTestId("chain-selector").click();
    await page.getByRole("option", { name: /all chains/i }).click();
    await page.getByTestId("deposit-amount").fill("1000");
    await page.getByTestId("deposit-button").click();
    // Stepper should show progress
    await expect(page.getByText(/1 of/i)).toBeVisible({ timeout: 30_000 });
    // Wait for completion
    await expect(page.getByText(/complete/i)).toBeVisible({ timeout: 60_000 });
  });

  test("chain selector shows weight badges", async ({ page }) => {
    await page.goto("/baskets");
    await page.getByTestId("chain-selector").click();
    // Each chain option should show weight percentage or "Closed"
    const options = page.getByTestId("chain-option");
    const count = await options.count();
    expect(count).toBeGreaterThan(0);
    // At least one should show a percentage
    await expect(page.getByText(/%|closed/i)).toBeVisible();
  });
});
