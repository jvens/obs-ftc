import { expect, test } from './support/fixtures';

test('the dashboard loads', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', error => errors.push(error));

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'FTC OBS', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'FTC Live Server' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'OBS Studio Connection' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the dashboard has a view for setting up, running the event, and what it saves', async ({ page }) => {
  await page.goto('/');
  const views = page.getByRole('navigation', { name: 'Views' });
  await expect(views.getByRole('link', { name: 'Setup' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Match Events' })).toBeHidden();

  await views.getByRole('link', { name: 'Run' }).click();
  await expect(page).toHaveURL(/#run$/);
  await expect(page.getByRole('heading', { name: 'Match Events' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lower Thirds' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'FTC Live Server' })).toBeHidden();

  await views.getByRole('link', { name: 'Outputs' }).click();
  await expect(page.getByRole('heading', { name: 'Match Record Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'YouTube Video Chapters' })).toBeVisible();

  // A reload, or a link to a view, opens that view.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Match Record Settings' })).toBeVisible();
});

test('the header shows whether FTC Live and OBS are connected, on every view', async ({ page, obs }) => {
  await page.goto('/#outputs');
  const status = page.getByRole('group', { name: 'Connection status' });
  await expect(status).toContainText('FTC Live not connected');
  await expect(status).toContainText('OBS not connected');

  await page.getByRole('link', { name: 'Setup' }).click();
  const obsPanel = page.locator('.section', { has: page.getByRole('heading', { name: 'OBS Studio Connection' }) });
  await obsPanel.getByPlaceholder('Enter OBS Studio IP').fill('localhost');
  await obsPanel.getByPlaceholder('Port').fill(String(obs.port));
  await obsPanel.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('link', { name: 'Run' }).click();
  await expect(status.getByText('OBS', { exact: true })).toBeVisible();
  await expect(status).toContainText('Not recording');
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
