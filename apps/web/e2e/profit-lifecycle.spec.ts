import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  E2E_ACCOUNT,
  BHP_ASSET_ID,
  autoApprovePrivyTransactions,
  connectWallet,
  dismissPrivyDialogs,
  getE2EWalletAddress,
  getERC20Balance,
  getTransactionCount,
  mintMockUsdc,
  navTo,
  parseBasketAddressFromHref,
  waitForERC20Balance,
  waitForNextTransaction,
} from './helpers';

const deployment = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/config/local-deployment.json'), 'utf8')
) as { usdc: string };

test('user lifecycle: deposit -> profitable perp -> redeem net profit, with admin flows', async ({ page }) => {
  test.setTimeout(600_000);
  const basketName = `E2E Profit ${Date.now()}`;

  const wallet = getE2EWalletAddress();

  await autoApprovePrivyTransactions(page);

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[page error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.log(`[page crash] ${err.message}`));

  await page.goto('/');
  await connectWallet(page);

  await mintMockUsdc(deployment.usdc, wallet, 10_000n * 1_000_000n);

  const initialBalance = await getERC20Balance(deployment.usdc, wallet);

  // --- Create basket ---
  await navTo(page, '/admin/baskets');
  let txCount = await getTransactionCount(wallet);
  await page.getByTestId('admin-create-basket-toggle').click();
  await page.getByTestId('admin-create-basket-name').fill(basketName);
  await page.getByTestId('admin-create-basket-deposit-fee').fill('0');
  await page.getByTestId('admin-create-basket-redeem-fee').fill('0');
  await page.getByTestId('admin-create-basket-submit').click();
  await waitForNextTransaction(wallet, txCount);
  await dismissPrivyDialogs(page);
  await navTo(page, '/admin/baskets');

  const createdLink = page.locator('a[href^="/admin/baskets/0x"]').first();
  await expect(createdLink).toBeVisible({ timeout: 30_000 });
  const basketAddress = parseBasketAddressFromHref(await createdLink.getAttribute('href'));

  // --- Register for risk ---
  await navTo(page, '/admin/risk');
  const registerButton = page.getByTestId(`risk-register-${basketAddress.toLowerCase()}`);
  if (await registerButton.isVisible()) {
    txCount = await getTransactionCount(wallet);
    await registerButton.click();
    await waitForNextTransaction(wallet, txCount);
    await dismissPrivyDialogs(page);
  }

  // --- Set assets ---
  await navTo(page, '/admin/basket-detail', basketAddress);
  await expandOperations(page);
  const setAssetsInput = page.getByTestId('set-assets-input-0');
  await setAssetsInput.waitFor({ state: 'visible', timeout: 15_000 });
  await setAssetsInput.click();
  const registeredOption = page.locator('button:has(span:text("On-chain"))').first();
  await expect(registeredOption).toBeVisible({ timeout: 30_000 });
  await registeredOption.click();
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('set-assets-submit').click();
  await waitForNextTransaction(wallet, txCount);
  await dismissPrivyDialogs(page);

  // --- Oracle price ---
  await navTo(page, '/admin/oracle');
  await page.getByTestId('oracle-asset-input').fill(BHP_ASSET_ID);
  await page.getByTestId('oracle-price-input').fill('80');
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('oracle-submit-price').click();
  await waitForNextTransaction(wallet, txCount);
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('oracle-sync-all').click();
  await waitForNextTransaction(wallet, txCount);
  await dismissPrivyDialogs(page);

  // --- Deposit ---
  await navTo(page, '/basket-detail', basketAddress);
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
  await dismissPrivyDialogs(page);

  // --- Perp allocation & position ---
  await navTo(page, '/admin/basket-detail', basketAddress);
  await expandOperations(page);
  await page.getByTestId('perp-allocation-amount').waitFor({ state: 'visible', timeout: 15_000 });
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
  await dismissPrivyDialogs(page);

  // --- Price increase (10% gain) ---
  await navTo(page, '/admin/oracle');
  await page.getByTestId('oracle-asset-input').fill(BHP_ASSET_ID);
  await page.getByTestId('oracle-price-input').fill('88');
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('oracle-submit-price').click();
  await waitForNextTransaction(wallet, txCount);
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('oracle-sync-all').click();
  await waitForNextTransaction(wallet, txCount);
  await dismissPrivyDialogs(page);

  // --- Close position ---
  await navTo(page, '/admin/basket-detail', basketAddress);
  await page.getByTestId('close-position-size').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('close-position-size').fill('2000');
  await page.getByTestId('close-position-collateral').fill('0');
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('close-position-submit').click();
  await expect(page.getByTestId('close-position-submit')).toContainText('Confirm');
  await page.getByTestId('close-position-submit').click();
  await waitForNextTransaction(wallet, txCount);
  await expect(page.getByText('Realised P&L')).toBeVisible();

  // --- Withdraw perp allocation ---
  await expandOperations(page);
  await page.getByTestId('perp-allocation-amount').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('perp-allocation-amount').fill('1200');
  txCount = await getTransactionCount(wallet);
  await page.getByTestId('perp-withdraw-submit').click();
  await waitForNextTransaction(wallet, txCount);
  await dismissPrivyDialogs(page);

  // --- Redeem ---
  await navTo(page, '/basket-detail', basketAddress);
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
  await navTo(page, '/admin/pool');
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

async function expandOperations(page: import('@playwright/test').Page) {
  const opsBtn = page.getByRole('button', { name: 'Operations' });
  await opsBtn.scrollIntoViewIfNeeded();
  await opsBtn.click();
  await page.waitForTimeout(1_000);
}
