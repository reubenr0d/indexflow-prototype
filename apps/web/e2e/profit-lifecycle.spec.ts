import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  E2E_ACCOUNT,
  BHP_ASSET_ID,
  autoApprovePrivyTransactions,
  connectWallet,
  getE2EWalletAddress,
  getERC20Balance,
  getTransactionCount,
  mintMockUsdc,
  parseBasketAddressFromHref,
  waitForERC20Balance,
  waitForNextTransaction,
} from './helpers';

const deployment = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/config/local-deployment.json'), 'utf8')
) as { usdc: string };

test('user lifecycle: deposit -> profitable perp -> redeem net profit, with admin flows', async ({ page }) => {
  test.setTimeout(420_000);
  const basketName = `E2E Profit ${Date.now()}`;

  // The wallet used for UI tx — Privy embedded wallet if configured, else Anvil deployer.
  const wallet = getE2EWalletAddress();

  // Auto-click Privy "Approve" dialog on every transaction (must be before first goto)
  await autoApprovePrivyTransactions(page);

  await page.goto('/');
  await connectWallet(page);

  await mintMockUsdc(deployment.usdc, wallet, 10_000n * 1_000_000n);

  const initialBalance = await getERC20Balance(deployment.usdc, wallet);

  // --- Create basket ---
  await page.goto('/admin/baskets');
  let txCount = await getTransactionCount(wallet);
  await page.getByTestId('admin-create-basket-toggle').click();
  await page.getByTestId('admin-create-basket-name').fill(basketName);
  await page.getByTestId('admin-create-basket-deposit-fee').fill('0');
  await page.getByTestId('admin-create-basket-redeem-fee').fill('0');
  await page.getByTestId('admin-create-basket-submit').click();
  await waitForNextTransaction(wallet, txCount);
  await page.goto('/admin/baskets');

  const createdLink = page.locator('a[href^="/admin/baskets/0x"]').first();
  await expect(createdLink).toBeVisible({ timeout: 30_000 });
  const basketAddress = parseBasketAddressFromHref(await createdLink.getAttribute('href'));

  // --- Register for risk ---
  await page.goto('/admin/risk');
  const registerButton = page.getByTestId(`risk-register-${basketAddress.toLowerCase()}`);
  if (await registerButton.isVisible()) {
    txCount = await getTransactionCount(wallet);
    await registerButton.click();
    await waitForNextTransaction(wallet, txCount);
  }

  // --- Set assets ---
  await page.goto(`/admin/baskets/${basketAddress}`);
  // Expand the collapsible "Operations" section to access the Set Assets card
  const operationsBtn = page.getByRole('button', { name: 'Operations' });
  await operationsBtn.scrollIntoViewIfNeeded();
  await operationsBtn.click();
  await page.waitForTimeout(1_000);
  const setAssetsInput = page.getByTestId('set-assets-input-0');
  await setAssetsInput.waitFor({ state: 'visible', timeout: 15_000 });
  await setAssetsInput.click();
  const registeredOption = page.locator('button:has(span:text("On-chain"))').first();
  await expect(registeredOption).toBeVisible({ timeout: 30_000 });
  await registeredOption.click();
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('set-assets-submit').click();
  await waitForNextTransaction(wallet, txCount);

  // --- Oracle price (use value near the seed price to stay within deviation limits) ---
  await page.goto('/admin/oracle');
  await page.getByTestId('oracle-asset-input').fill(BHP_ASSET_ID);
  await page.getByTestId('oracle-price-input').fill('80');
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('oracle-submit-price').click();
  await waitForNextTransaction(wallet, txCount);
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('oracle-sync-all').click();
  await waitForNextTransaction(wallet, txCount);

  // --- Deposit ---
  await page.goto(`/baskets/${basketAddress}`);
  await page.getByTestId('deposit-redeem-amount').fill('2000');
  const balanceBeforeDeposit = await getERC20Balance(deployment.usdc, wallet);
  await page.getByTestId('deposit-redeem-submit').click();
  let deposited = false;
  try {
    await waitForERC20Balance(
      deployment.usdc,
      wallet,
      (balance) => balance < balanceBeforeDeposit,
      20_000
    );
    deposited = true;
  } catch {
    // First click may only approve USDC; click again to execute deposit.
    await page.getByTestId('deposit-redeem-submit').click();
    await waitForERC20Balance(
      deployment.usdc,
      wallet,
      (balance) => balance < balanceBeforeDeposit,
      60_000
    );
    deposited = true;
  }
  expect(deposited).toBeTruthy();

  // --- Perp allocation & position ---
  await page.goto(`/admin/baskets/${basketAddress}`);
  await page.getByTestId('perp-allocation-amount').fill('1000');
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('perp-allocate-submit').click();
  await waitForNextTransaction(wallet, txCount);

  await page.getByTestId('open-position-filter').fill('BHP');
  await page.getByTestId('open-position-size').fill('2000');
  await page.getByTestId('open-position-collateral').fill('500');
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('open-position-submit').click();
  await waitForNextTransaction(wallet, txCount);

  // --- Price increase (10% gain) ---
  await page.goto('/admin/oracle');
  await page.getByTestId('oracle-asset-input').fill(BHP_ASSET_ID);
  await page.getByTestId('oracle-price-input').fill('88');
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('oracle-submit-price').click();
  await waitForNextTransaction(wallet, txCount);
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('oracle-sync-all').click();
  await waitForNextTransaction(wallet, txCount);

  // --- Close position ---
  await page.goto(`/admin/baskets/${basketAddress}`);
  await page.getByTestId('close-position-size').fill('2000');
  await page.getByTestId('close-position-collateral').fill('0');
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('close-position-submit').click();
  await expect(page.getByTestId('close-position-submit')).toContainText('Confirm');
  await page.getByTestId('close-position-submit').click();
  await waitForNextTransaction(wallet, txCount);
  await expect(page.getByText('Realised P&L')).toBeVisible();

  // --- Withdraw perp allocation ---
  await page.getByTestId('perp-allocation-amount').fill('1200');
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('perp-withdraw-submit').click();
  await waitForNextTransaction(wallet, txCount);

  // --- Redeem ---
  await page.goto(`/baskets/${basketAddress}`);
  await page.getByRole('tab', { name: 'Redeem' }).click();
  await page.getByText(/^Max:/).first().click();
  const balanceBeforeRedeem = await getERC20Balance(deployment.usdc, wallet);
  await page.getByTestId('deposit-redeem-submit').click();
  await waitForERC20Balance(
    deployment.usdc,
    wallet,
    (balance) => balance > balanceBeforeRedeem,
    60_000
  );

  const finalBalance = await getERC20Balance(deployment.usdc, wallet);
  expect(finalBalance).toBeGreaterThan(initialBalance);

  // --- Pool operations ---
  await page.goto('/admin/pool');
  const poolBufferInput = page.getByTestId('pool-buffer-input-usdc');
  await poolBufferInput.fill('150000');
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('pool-buffer-submit-usdc').click();
  await waitForNextTransaction(wallet, txCount);

  const poolDepositInput = page.getByTestId('pool-deposit-input-usdc');
  await poolDepositInput.fill('100');
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('pool-deposit-submit-usdc').click();
  await waitForNextTransaction(wallet, txCount);
});
