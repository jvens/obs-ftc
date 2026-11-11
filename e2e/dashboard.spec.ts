import { expect, test } from './support/fixtures';
import { showStep } from './support/dashboard';

test('the dashboard loads', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', error => errors.push(error));

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'FTC OBS', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Setup steps' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'FTC Live Server' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the dashboard has a view for setting up, running the event, what it saves, and the matches', async ({ page }) => {
  await page.goto('/');
  const views = page.getByRole('navigation', { name: 'Views' });
  await expect(views.getByRole('link', { name: 'Setup' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Match Events' })).toBeHidden();

  await views.getByRole('link', { name: 'Run' }).click();
  await expect(page).toHaveURL(/#run$/);
  await expect(page.getByRole('heading', { name: 'Lower Thirds' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'On the Fields' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Match Events' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'FTC Live Server' })).toBeHidden();

  await views.getByRole('link', { name: 'Matches' }).click();
  await expect(page.getByRole('heading', { name: 'Match Events' })).toBeVisible();

  await views.getByRole('link', { name: 'Outputs' }).click();
  await expect(page.getByRole('heading', { name: 'Match Recording' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'YouTube Chapters' })).toBeVisible();

  // A reload, or a link to a view, opens that view.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Match Recording' })).toBeVisible();
});

test('the header shows whether FTC Live and OBS are connected, on every view', async ({ page, obs }) => {
  await page.goto('/#outputs');
  const status = page.getByRole('group', { name: 'Connection status' });
  await expect(status).toContainText('FTC Live not connected');
  await expect(status).toContainText('OBS not connected');

  await showStep(page, 'obs');
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

test('Setup goes through the steps before going live, with help for each', async ({ page }) => {
  await page.goto('/');
  const steps = page.getByRole('navigation', { name: 'Setup steps' });
  await expect(steps.getByRole('listitem')).toHaveCount(6);
  await expect(page.getByText('Step 1 of 6')).toBeVisible();
  const help = page.getByRole('complementary', { name: 'Help' });
  await expect(help.getByRole('heading', { name: 'Connect to FTC Live' })).toBeVisible();

  await page.getByRole('link', { name: 'Next: Connect to OBS Studio' }).click();
  await expect(page).toHaveURL(/#setup\/obs$/);
  await expect(page.getByRole('heading', { name: 'OBS Studio Connection' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'FTC Live Server' })).toBeHidden();
  await expect(help).toContainText('Tools > WebSocket Server Settings');

  await steps.locator('a[href="#setup/scenes"]').click();
  await expect(page.getByRole('heading', { name: 'Scenes and Cameras', exact: true })).toBeVisible();
  await expect(help).toContainText('Choosing a camera type');

  // The help closes from its own button or the header's, and stays closed after a reload.
  await help.getByRole('button', { name: 'Close help' }).click();
  await expect(help).toBeHidden();
  await page.reload();
  await expect(help).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Scenes and Cameras', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(help).toBeVisible();

  // Setup opens on the last step shown.
  const views = page.getByRole('navigation', { name: 'Views' });
  await views.getByRole('link', { name: 'Run', exact: true }).click();
  await views.getByRole('link', { name: 'Setup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Scenes and Cameras', exact: true })).toBeVisible();
});

test('Setup ticks off a step once it is done', async ({ page, obs }) => {
  await page.goto('/#setup/obs');
  const step = page.getByRole('navigation', { name: 'Setup steps' }).locator('a[href="#setup/obs"]');
  await expect(step).toContainText('Not connected');
  const panel = page.locator('.section', { has: page.getByRole('heading', { name: 'OBS Studio Connection' }) });
  await panel.getByPlaceholder('Port').fill(String(obs.port));
  await panel.getByRole('button', { name: 'Connect' }).click();
  await expect(step.getByLabel('Done')).toBeVisible();
  await expect(step).toContainText(`localhost:${obs.port}`);
});

test('Run puts a scene on the stream with one click', async ({ page, obs }) => {
  await page.goto('/#run');
  const scenes = page.locator('.section', { has: page.getByRole('heading', { name: 'Scenes', exact: true }) });
  await expect(scenes).toContainText('Connect to OBS in Setup to switch scenes here.');

  await showStep(page, 'obs');
  const obsPanel = page.locator('.section', { has: page.getByRole('heading', { name: 'OBS Studio Connection' }) });
  await obsPanel.getByPlaceholder('Port').fill(String(obs.port));
  await obsPanel.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Run', exact: true }).click();

  // Camera scenes only hold a camera; they get no button.
  await expect(scenes.getByRole('button', { name: /^Field 1/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(scenes.getByRole('button', { name: /^Camera/ })).toHaveCount(0);
  // FTC Live is not connected, so nothing switches scenes by itself yet.
  await expect(scenes).toContainText('Automatic switching waits for FTC Live');

  await scenes.getByRole('button', { name: /^Ceremony/ }).click();
  await expect(scenes.getByRole('button', { name: /^Ceremony/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(scenes.getByRole('button', { name: /^Field 1/ })).toHaveAttribute('aria-pressed', 'false');
});
