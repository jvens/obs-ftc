// The dashboard's connection to a real OBS Studio.
import { connectObs, expect, section, showStep, test } from './fixtures';

test('connects to OBS and lists its scenes', async ({ page, realObs }) => {
  await realObs.control.call('CreateScene', { sceneName: 'Interview' });
  await page.goto('/');

  const panel = await connectObs(page, realObs);

  await expect(panel.getByText('Connected', { exact: true })).toBeVisible();
  // Scene Switching Settings offers OBS's scenes for each field.
  await showStep(page, 'switching');
  await expect(section(page, 'Scene Switching Settings').getByRole('option', { name: 'Interview' }).first()).toBeAttached();
});

test('follows scenes added in OBS while connected', async ({ page, realObs }) => {
  await page.goto('/');
  await expect((await connectObs(page, realObs)).getByText('Connected', { exact: true })).toBeVisible();

  await realObs.control.call('CreateScene', { sceneName: 'Added Later' });

  await showStep(page, 'switching');
  await expect(section(page, 'Scene Switching Settings').getByRole('option', { name: 'Added Later' }).first()).toBeAttached();
});

test('explains a wrong password', async ({ page, realObs }) => {
  await page.goto('/');

  const panel = await connectObs(page, { ...realObs, password: 'wrong' });

  await expect(panel.getByText('Unable to connect. Check the OBS Websocket password.')).toBeVisible();
  await expect(panel.getByText('Disconnected', { exact: true })).toBeVisible();
});

test('reconnects by itself when OBS restarts', async ({ page, realObs }) => {
  test.skip(!realObs.studio.restart, 'Needs an OBS the tests started');
  await page.goto('/');
  const panel = await connectObs(page, realObs);
  await expect(panel.getByText('Connected', { exact: true })).toBeVisible();

  await realObs.studio.restart!();

  // OBS takes a few seconds to come back, and the dashboard tries every 10 s.
  await expect(panel.getByText('Connected', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(panel.locator('.error-message')).toHaveCount(0);
});
