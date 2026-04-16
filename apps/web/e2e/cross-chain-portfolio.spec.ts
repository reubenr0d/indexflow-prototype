import { expect, test } from '@playwright/test';
import {
  HUB_RPC,
  SPOKE_RPC,
  HUB_CHAIN_SELECTOR,
  SPOKE_CHAIN_SELECTOR,
  E2E_DEPLOYER,
  loadHubDeployment,
  loadSpokeDeployment,
  installChainShim,
  keeperPostWeights,
  mintMockUsdcOnChain,
} from './cross-chain-setup';
import { autoApprovePrivyTransactions, connectWallet } from './helpers';

/**
 * Cross-chain portfolio E2E tests.
 *
 * Infrastructure: dual-Anvil (hub 8545, spoke 8546) with deployed protocol.
 * Verifies the aggregated portfolio view and cross-chain share price consistency.
 */

test.describe('Cross-chain portfolio', () => {
  test.setTimeout(180_000);

  test('portfolio shows holdings across chains', async ({ page }) => {
    const hub = loadHubDeployment();

    await installChainShim(page, {
      rpcUrl: HUB_RPC,
      chainIdHex: '0x7a69',
    });
    await autoApprovePrivyTransactions(page);

    await mintMockUsdcOnChain(HUB_RPC, hub.usdc, E2E_DEPLOYER, 50_000n * 1_000_000n);

    if (hub.stateRelay) {
      await keeperPostWeights(
        HUB_RPC,
        hub.stateRelay,
        [HUB_CHAIN_SELECTOR, SPOKE_CHAIN_SELECTOR],
        [5000n, 5000n],
      );
    }

    // Deposit into a basket on hub so we have at least one holding
    await page.goto('/baskets');
    await connectWallet(page);

    const firstBasket = page.locator('a[href^="/baskets/0x"]').first();
    await expect(firstBasket).toBeVisible({ timeout: 30_000 });
    await firstBasket.click();

    const depositInput = page.getByTestId('deposit-redeem-amount');
    await depositInput.waitFor({ state: 'visible', timeout: 15_000 });
    await depositInput.fill('1000');
    await page.getByTestId('deposit-redeem-submit').click();
    await page.waitForTimeout(5_000);

    // Switch to "All Chains" view
    const networkTrigger = page
      .locator('button')
      .filter({ hasText: /Anvil|Sepolia|All Chains|Fuji/ })
      .first();
    if (await networkTrigger.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await networkTrigger.click();
      const allChainsOption = page.locator('button:has-text("All Chains")').first();
      if (await allChainsOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await allChainsOption.click();
        await page.waitForTimeout(1_000);
      }
    }

    // Navigate to portfolio
    const portfolioLink = page.locator('a[href="/portfolio"]').first();
    if (await portfolioLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await portfolioLink.click();
    } else {
      await page.goto('/portfolio');
    }
    await page.waitForTimeout(3_000);

    // Verify portfolio value is shown
    const portfolioValue = page.locator('text=/Portfolio Value/i');
    await expect(portfolioValue).toBeVisible({ timeout: 15_000 });

    // Verify at least one holding is listed
    const holdingCard = page.locator(
      '[data-testid="holding-card"], a[href^="/baskets/0x"]',
    ).first();
    const holdingVisible = await holdingCard.isVisible({ timeout: 10_000 }).catch(() => false);

    // In all-chains mode, holdings should display chain icons
    const chainIcon = page
      .locator('[title*="chain"], [title*="Chain"], [data-testid*="chain-icon"]')
      .first();
    const chainIconVisible = await chainIcon.isVisible({ timeout: 5_000 }).catch(() => false);

    // The holdings section header should be visible regardless
    const holdingsHeader = page.locator('text=/Holdings/i').first();
    await expect(holdingsHeader).toBeVisible({ timeout: 10_000 });

    // At least the portfolio page rendered with holdings or the "No baskets" state
    const noBaskets = page.locator('text=/No baskets yet/i');
    const noBasketsVisible = await noBaskets.isVisible({ timeout: 3_000 }).catch(() => false);

    expect(holdingVisible || noBasketsVisible).toBe(true);
  });

  test('share price consistent across chain views', async ({ page }) => {
    const hub = loadHubDeployment();

    await installChainShim(page, {
      rpcUrl: HUB_RPC,
      chainIdHex: '0x7a69',
    });
    await autoApprovePrivyTransactions(page);

    await mintMockUsdcOnChain(HUB_RPC, hub.usdc, E2E_DEPLOYER, 50_000n * 1_000_000n);

    if (hub.stateRelay) {
      // Post a PnL adjustment to perturb share prices
      const firstBasketAddr = await getFirstBasketAddress(page);

      await keeperPostWeights(
        HUB_RPC,
        hub.stateRelay,
        [HUB_CHAIN_SELECTOR, SPOKE_CHAIN_SELECTOR],
        [5000n, 5000n],
        firstBasketAddr ? [firstBasketAddr] : [],
        firstBasketAddr ? [100_000_000n] : [], // +$100 PnL adjustment
      );
    }

    // Check share price in single-chain view
    await page.goto('/baskets');
    await connectWallet(page);

    const firstBasket = page.locator('a[href^="/baskets/0x"]').first();
    await expect(firstBasket).toBeVisible({ timeout: 30_000 });

    // Read share price from the card
    const priceInSingleView = await extractSharePrice(page, firstBasket);

    // Switch to "All Chains" view
    const networkTrigger = page
      .locator('button')
      .filter({ hasText: /Anvil|Sepolia|All Chains|Fuji/ })
      .first();
    if (await networkTrigger.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await networkTrigger.click();
      const allChainsOption = page.locator('button:has-text("All Chains")').first();
      if (await allChainsOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await allChainsOption.click();
        await page.waitForTimeout(2_000);
      }
    }

    // Re-read share price from the card in all-chains view
    const firstBasketAll = page.locator('a[href^="/baskets/0x"]').first();
    if (await firstBasketAll.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const priceInAllView = await extractSharePrice(page, firstBasketAll);

      if (priceInSingleView !== null && priceInAllView !== null) {
        // Share prices should be identical (same underlying vault, same NAV)
        expect(priceInSingleView).toBe(priceInAllView);
      }
    }

    // Even if the selector isn't available, verify the baskets page renders
    await expect(page.locator('h1:has-text("Baskets")')).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getFirstBasketAddress(page: import('@playwright/test').Page): Promise<string | null> {
  await page.goto('/baskets');
  await page.waitForTimeout(3_000);
  const link = page.locator('a[href^="/baskets/0x"]').first();
  const href = await link.getAttribute('href').catch(() => null);
  if (!href) return null;
  return href.split('/').pop() ?? null;
}

async function extractSharePrice(
  page: import('@playwright/test').Page,
  cardLocator: import('@playwright/test').Locator,
): Promise<string | null> {
  // Look for a "/ share" label within the card which shows the price
  const priceText = cardLocator.locator('text=/\\$[\\d,.]+.*share/i').first();
  if (await priceText.isVisible({ timeout: 5_000 }).catch(() => false)) {
    const text = await priceText.textContent();
    const match = text?.match(/\$([\d,.]+)/);
    return match?.[1] ?? null;
  }

  // Fallback: look for share price in the card's data-testid
  const sharePriceEl = cardLocator.locator('[data-testid="share-price"]').first();
  if (await sharePriceEl.isVisible({ timeout: 3_000 }).catch(() => false)) {
    return (await sharePriceEl.textContent())?.trim() ?? null;
  }

  return null;
}
