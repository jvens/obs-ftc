import { expect, test } from './support/fixtures';

test('the dashboard loads', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', error => errors.push(error));

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'FTC OBS WebSocket Client' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'FTC Live Server' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'OBS Studio Connection' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the dashboard links to the LAN camera page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Create LAN Camera' }).click();
  await expect(page.getByRole('heading', { name: 'FTC LAN Camera' })).toBeVisible();
});

test('opened as an OBS browser source, the dashboard shows a warning instead', async ({ page }) => {
  await page.addInitScript(() => { (window as { obsstudio?: object }).obsstudio = {}; });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Open this page in Chrome, not in OBS' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'FTC Live Server' })).toHaveCount(0);
});
