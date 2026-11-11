import { expect, test } from './support/fixtures';
import { showStep, stepArea } from './support/dashboard';

test('the dashboard loads', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', error => errors.push(error));

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'FTC OBS', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Setup steps' })).toBeVisible();
  await expect(stepArea(page, 'ftc-live')).toBeVisible();
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
  await expect(stepArea(page, 'ftc-live')).toBeHidden();

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
  const obsPanel = stepArea(page, 'obs');
  await obsPanel.getByPlaceholder('Enter OBS Studio IP').fill('localhost');
  await obsPanel.getByPlaceholder('Port').fill(String(obs.port));
  await obsPanel.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('link', { name: 'Run' }).click();
  await expect(status.getByText('OBS', { exact: true })).toBeVisible();
  await expect(status).toContainText('Not recording');
});

test('the dashboard links to the LAN camera page', async ({ page }) => {
  await page.goto('/#setup');
  await page.getByRole('banner').getByRole('link', { name: 'Create LAN Camera' }).click();
  await expect(page.getByRole('heading', { name: 'FTC LAN Camera' })).toBeVisible();
});

test('a first visit, as on a camera computer, offers the LAN camera page on About', async ({ browser, baseURL }) => {
  // A camera computer has never opened the dashboard, so it lands on About.
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('/');
  const callout = page.getByRole('complementary', { name: 'Camera computers' });
  await callout.getByRole('link', { name: 'Create LAN Camera' }).click();
  await expect(page.getByRole('heading', { name: 'FTC LAN Camera' })).toBeVisible();
  await context.close();
});

test('opened as an OBS browser source, the dashboard shows a warning instead', async ({ page }) => {
  await page.addInitScript(() => { (window as { obsstudio?: object }).obsstudio = {}; });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Open this page in Chrome, not in OBS' })).toBeVisible();
  await expect(page.getByPlaceholder('Enter server IP')).toHaveCount(0);
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
  await expect(stepArea(page, 'obs')).toBeVisible();
  await expect(stepArea(page, 'ftc-live')).toBeHidden();
  await expect(help).toContainText('Tools > WebSocket Server Settings');

  await steps.locator('a[href="#setup/scenes"]').click();
  await expect(stepArea(page, 'scenes')).toBeVisible();
  await expect(help).toContainText('Choosing a camera type');

  // The help closes from its own button or the header's, and stays closed after a reload.
  await help.getByRole('button', { name: 'Close help' }).click();
  await expect(help).toBeHidden();
  await page.reload();
  await expect(help).toBeHidden();
  await expect(stepArea(page, 'scenes')).toBeVisible();
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(help).toBeVisible();

  // Setup opens on the last step shown.
  const views = page.getByRole('navigation', { name: 'Views' });
  await views.getByRole('link', { name: 'Run', exact: true }).click();
  await views.getByRole('link', { name: 'Setup', exact: true }).click();
  await expect(stepArea(page, 'scenes')).toBeVisible();
});

test('Setup ticks off a step once it is done', async ({ page, obs }) => {
  await page.goto('/#setup/obs');
  const step = page.getByRole('navigation', { name: 'Setup steps' }).locator('a[href="#setup/obs"]');
  await expect(step).toContainText('Not connected');
  const panel = stepArea(page, 'obs');
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
  const obsPanel = stepArea(page, 'obs');
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

test('custom cameras are kept in a list until OBS is there to build them', async ({ page }) => {
  await page.goto('/#setup/scenes');
  const custom = page.locator('.custom-cameras');
  await custom.getByLabel('New camera name').fill('Pit Camera');
  await custom.getByRole('button', { name: 'Add camera' }).click();
  await expect(custom.getByRole('listitem')).toHaveText([/Pit Camera/]);
  await expect(custom).toContainText('Its scenes are built the next time you set up OBS.');

  // A name setup already uses is refused.
  await custom.getByLabel('New camera name').fill('pit display');
  await custom.getByRole('button', { name: 'Add camera' }).click();
  await expect(custom).toContainText('"pit display" is already used.');

  const row = custom.getByRole('listitem').filter({ hasText: 'Pit Camera' });
  await expect(row.getByLabel('FTC Live overlay')).toBeChecked();
  await row.getByLabel('FTC Live overlay').uncheck();
  await page.reload();
  await expect(custom.getByRole('listitem').filter({ hasText: 'Pit Camera' }).getByLabel('FTC Live overlay')).not.toBeChecked();

  page.once('dialog', dialog => dialog.accept());
  await custom.getByRole('listitem').filter({ hasText: 'Pit Camera' }).getByRole('button', { name: 'Remove' }).click();
  await expect(custom.getByRole('listitem')).toHaveCount(0);
});

test('dark mode is a setting in the header, kept for the dashboard and the camera page', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const darkMode = page.getByRole('button', { name: 'Dark mode' });
  await expect(html).not.toHaveAttribute('data-theme');
  await expect(darkMode).toHaveAttribute('aria-pressed', 'false');

  await darkMode.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(15, 18, 22)');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(darkMode).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/camera');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.goto('/');
  await darkMode.click();
  await expect(html).not.toHaveAttribute('data-theme');
});

test('a first visit opens About, which leads on to Setup', async ({ browser, baseURL }) => {
  // A browser that has never opened the dashboard.
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('/');
  const views = page.getByRole('navigation', { name: 'Views' });
  await expect(views.getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Stream your FTC event, and let the matches run the camera.' })).toBeVisible();

  // The section list jumps to a section and marks it.
  const sections = page.getByRole('navigation', { name: 'About pages' });
  await sections.getByRole('link', { name: 'What you need' }).click();
  await expect(page).toHaveURL(/#about\/needs$/);
  await expect(page.getByRole('heading', { name: 'What you need' })).toBeInViewport();
  await expect(sections.getByRole('link', { name: 'What you need' })).toHaveAttribute('aria-current', 'location');

  await sections.getByRole('link', { name: 'Start Setup' }).click();
  await expect(page.getByText('Step 1 of 6')).toBeVisible();

  // After that, the dashboard opens on Setup.
  await page.goto('/');
  await expect(views.getByRole('link', { name: 'Setup' })).toHaveAttribute('aria-current', 'page');
  await context.close();
});

test('About has guides beneath the overview, each a page of its own', async ({ page }) => {
  await page.goto('/#about');
  const sidebar = page.getByRole('navigation', { name: 'About pages' });

  await sidebar.getByRole('link', { name: 'Webcams on any computer' }).click();
  await expect(page).toHaveURL(/#about\/lan-cameras$/);
  await expect(page.getByRole('heading', { name: 'Webcams on any computer', level: 2 })).toBeVisible();
  await expect(page.getByText('The field display computer')).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Webcams on any computer' })).toHaveAttribute('aria-current', 'page');
  // The overview is not shown alongside a guide.
  await expect(page.getByRole('heading', { name: 'How it fits together' })).toHaveCount(0);

  // The overview links into the guides too.
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.getByRole('link', { name: 'NDI', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'NDI cameras', level: 2 })).toBeVisible();
  await expect(page.getByText('winget install --exact --id DistroAV.DistroAV')).toBeVisible();

  await sidebar.getByRole('link', { name: 'Where to put the cameras' }).click();
  await expect(page.getByText('Coming soon.')).toBeVisible();
});
