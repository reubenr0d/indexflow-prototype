import { expect, test } from '@playwright/test';
import { autoApprovePrivyTransactions, connectWallet } from './helpers';

test('core ui smoke: landing, nav, theme, wallet connect', async ({ page }) => {
  await autoApprovePrivyTransactions(page);

  await page.goto('/');

  await expect(page.getByText('Deposit into themed baskets backed by a shared trading engine')).toBeVisible();

  await page.getByRole('button', { name: 'Toggle theme' }).click();

  await connectWallet(page);

  await page.getByRole('link', { name: 'Baskets' }).first().click();
  await expect(page.getByRole('heading', { name: 'Baskets' })).toBeVisible();

  await page.goto('/docs');
  await expect(page).toHaveURL(/\/docs/);
});
