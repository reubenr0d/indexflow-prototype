import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  E2E_ACCOUNT,
  XAU_ASSET_ID,
  connectWallet,
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

  await page.goto('/');
  await connectWallet(page);

  await mintMockUsdc(deployment.usdc, E2E_ACCOUNT, 10_000n * 1_000_000n);

  const initialBalance = await getERC20Balance(deployment.usdc, E2E_ACCOUNT);

  await page.goto('/admin/baskets');
  let txCount = await getTransactionCount(E2E_ACCOUNT);
  await page.getByTestId('admin-create-basket-toggle').click();
  await page.getByTestId('admin-create-basket-name').fill(basketName);
  await page.getByTestId('admin-create-basket-deposit-fee').fill('0');
  await page.getByTestId('admin-create-basket-redeem-fee').fill('0');
  await page.getByTestId('admin-create-basket-submit').click();
  await waitForNextTransaction(E2E_ACCOUNT, txCount);
  await page.goto('/admin/baskets');

  const createdLink = page.locator('a[href^="/admin/baskets/0x"]').first();
  await expect(createdLink).toBeVisible({ timeout: 30_000 });
  const basketAddress = parseBasketAddressFromHref(await createdLink.getAttribute('href'));

  await page.goto('/admin/risk');
  const registerButton = page.getByTestId(`risk-register-${basketAddress.toLowerCase()}`);
  if (await registerButton.isVisible()) {
    txCount = await getTransactionCount(E2E_ACCOUNT);
    await registerButton.click();
    await waitForNextTransaction(E2E_ACCOUNT, txCount);
  }

  await page.goto(`/admin/baskets/${basketAddress}`);
  const firstAssetOption = page.locator('datalist[id="set-assets-0"] option').first();
  await expect(firstAssetOption).toHaveCount(1, { timeout: 30_000 });
  const assetLabel = await firstAssetOption.getAttribute('value');
  if (!assetLabel) throw new Error('No supported asset options loaded for Set Assets');
  await page.getByTestId('set-assets-input-0').fill(assetLabel);
  txCount = await getTransactionCount(E2E_ACCOUNT);
  await page.getByTestId('set-assets-submit').click();
  await waitForNextTransaction(E2E_ACCOUNT, txCount);

  await page.goto('/admin/oracle');
  await page.getByTestId('oracle-asset-input').fill(XAU_ASSET_ID);
  await page.getByTestId('oracle-price-input').fill('2000');
  txCount = await getTransactionCount(E2E_ACCOUNT);
  await page.getByTestId('oracle-submit-price').click();
  await waitForNextTransaction(E2E_ACCOUNT, txCount);
  txCount = await getTransactionCount(E2E_ACCOUNT);
  await page.getByTestId('oracle-sync-all').click();
  await waitForNextTransaction(E2E_ACCOUNT, txCount);

  await page.goto(`/baskets/${basketAddress}`);
  await page.getByTestId('deposit-redeem-amount').fill('2000');
  const balanceBeforeDeposit = await getERC20Balance(deployment.usdc, E2E_ACCOUNT);
  await page.getByTestId('deposit-redeem-submit').click();
  let deposited = false;
  try {
    await waitForERC20Balance(
      deployment.usdc,
      E2E_ACCOUNT,
      (balance) => balance < balanceBeforeDeposit,
      20_000
    );
    deposited = true;
  } catch {
    // First click may only approve USDC; click again to execute deposit.
    await page.getByTestId('deposit-redeem-submit').click();
    await waitForERC20Balance(
      deployment.usdc,
      E2E_ACCOUNT,
      (balance) => balance < balanceBeforeDeposit,
      60_000
    );
    deposited = true;
  }
  expect(deposited).toBeTruthy();

  await page.goto(`/admin/baskets/${basketAddress}`);
  await page.getByTestId('perp-allocation-amount').fill('1000');
  txCount = await getTransactionCount(E2E_ACCOUNT);
  await page.getByTestId('perp-allocate-submit').click();
  await waitForNextTransaction(E2E_ACCOUNT, txCount);

  await page.getByTestId('open-position-filter').fill('XAU');
  await page.getByTestId('open-position-size').fill('2000');
  await page.getByTestId('open-position-collateral').fill('500');
  txCount = await getTransactionCount(E2E_ACCOUNT);
  await page.getByTestId('open-position-submit').click();
  await waitForNextTransaction(E2E_ACCOUNT, txCount);

  await page.goto('/admin/oracle');
  await page.getByTestId('oracle-asset-input').fill(XAU_ASSET_ID);
  await page.getByTestId('oracle-price-input').fill('2200');
  txCount = await getTransactionCount(E2E_ACCOUNT);
  await page.getByTestId('oracle-submit-price').click();
  await waitForNextTransaction(E2E_ACCOUNT, txCount);
  txCount = await getTransactionCount(E2E_ACCOUNT);
  await page.getByTestId('oracle-sync-all').click();
  await waitForNextTransaction(E2E_ACCOUNT, txCount);

  await page.goto(`/admin/baskets/${basketAddress}`);
  await page.getByTestId('close-position-size').fill('2000');
  await page.getByTestId('close-position-collateral').fill('0');
  txCount = await getTransactionCount(E2E_ACCOUNT);
  await page.getByTestId('close-position-submit').click();
  await waitForNextTransaction(E2E_ACCOUNT, txCount);
  await expect(page.getByText('Realised PnL')).toBeVisible();

  await page.getByTestId('perp-allocation-amount').fill('1200');
  txCount = await getTransactionCount(E2E_ACCOUNT);
  await page.getByTestId('perp-withdraw-submit').click();
  await waitForNextTransaction(E2E_ACCOUNT, txCount);

  await page.goto(`/baskets/${basketAddress}`);
  await page.getByRole('tab', { name: 'Redeem' }).click();
  await page.getByText(/^Max:/).first().click();
  const balanceBeforeRedeem = await getERC20Balance(deployment.usdc, E2E_ACCOUNT);
  await page.getByTestId('deposit-redeem-submit').click();
  await waitForERC20Balance(
    deployment.usdc,
    E2E_ACCOUNT,
    (balance) => balance > balanceBeforeRedeem,
    60_000
  );

  const finalBalance = await getERC20Balance(deployment.usdc, E2E_ACCOUNT);
  expect(finalBalance).toBeGreaterThan(initialBalance);

  await page.goto('/admin/pool');
  const poolBufferInput = page.getByTestId('pool-buffer-input-usdc');
  await poolBufferInput.fill('150000');
  txCount = await getTransactionCount(E2E_ACCOUNT);
  await page.getByTestId('pool-buffer-submit-usdc').click();
  await waitForNextTransaction(E2E_ACCOUNT, txCount);

  const poolDepositInput = page.getByTestId('pool-deposit-input-usdc');
  await poolDepositInput.fill('100');
  txCount = await getTransactionCount(E2E_ACCOUNT);
  await page.getByTestId('pool-deposit-submit-usdc').click();
  await waitForNextTransaction(E2E_ACCOUNT, txCount);
});
