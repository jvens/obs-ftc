// The Run view while an event is live: lower thirds, what each field is doing, and warnings. FTC Live
// and OBS are mocks.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { showStep, showView, stepArea } from './support/dashboard';
import { MockFtcLive, startMockFtcLive } from './support/mockFtcLive';

const section = (page: Page, heading: string) =>
  page.locator('.section', { has: page.getByRole('heading', { name: heading, exact: true }) });

const connectObs = async (page: Page, port: number) => {
  await showStep(page, 'obs');
  const panel = stepArea(page, 'obs');
  await panel.getByPlaceholder('Port').fill(String(port));
  await panel.getByRole('button', { name: 'Connect' }).click();
  await expect(panel.getByText('Connected', { exact: true })).toBeVisible();
};

const connectFtcLive = async (page: Page, ftcLive: MockFtcLive) => {
  await showStep(page, 'ftc-live');
  const panel = stepArea(page, 'ftc-live');
  await panel.getByPlaceholder('Enter server IP').fill(ftcLive.host);
  await panel.getByRole('button', { name: 'Get Event Codes' }).click();
  await panel.getByRole('combobox').selectOption(ftcLive.event.eventCode);
  await panel.getByRole('button', { name: 'Connect' }).click();
  await expect(panel.getByText('Connected', { exact: true })).toBeVisible();
  await ftcLive.connected();
};

test('lower thirds: fill the list, then show and hide them while live', async ({ page, obs }) => {
  await page.goto('/');
  await connectObs(page, obs.port);
  await showView(page, 'Run');
  const lowerThirds = section(page, 'Lower Thirds');
  await expect(lowerThirds).toContainText('No lower thirds yet');

  await lowerThirds.getByRole('button', { name: 'Edit list' }).click();
  await lowerThirds.getByLabel('Lower thirds to import').fill('Jamie Smith, Head Referee\nTeam 12345 Robo Rangers, Inspire Award');
  await lowerThirds.getByRole('button', { name: 'Add to List' }).click();
  await expect(lowerThirds.getByLabel('Name')).toHaveCount(2);
  await lowerThirds.getByRole('button', { name: 'Done editing' }).click();

  const referee = lowerThirds.getByRole('listitem').filter({ hasText: 'Jamie Smith' });
  await expect(referee).toContainText('Head Referee');
  await expect(lowerThirds).toContainText('Nothing on stream');
  await referee.getByRole('button', { name: 'Show' }).click();
  await expect(lowerThirds).toContainText('On stream: Jamie Smith');

  await referee.getByRole('button', { name: 'Hide' }).click();
  await expect(lowerThirds).toContainText('Nothing on stream');
  // The list is kept for the next visit.
  await page.reload();
  await expect(section(page, 'Lower Thirds').getByRole('listitem')).toHaveCount(2);
});

test('shows what each field is doing as FTC Live runs matches', async ({ page }) => {
  const ftcLive = await startMockFtcLive();
  try {
    await page.goto('/');
    await connectFtcLive(page, ftcLive);
    await showView(page, 'Run');
    const fields = section(page, 'On the Fields');
    await expect(fields.getByRole('listitem')).toHaveText([/Field 1\s*No match yet/, /Field 2\s*No match yet/]);

    ftcLive.send('MATCH_LOAD', { number: 1, field: 2 });
    ftcLive.send('MATCH_START', { number: 1, field: 2 });
    ftcLive.send('MATCH_LOAD', { number: 2, field: 1 });

    const field2 = fields.getByRole('listitem').filter({ hasText: 'Field 2' });
    await expect(field2).toContainText('Match running');
    // The teams come from FTC Live.
    await expect(field2).toContainText('Q1 · Red 1001, 2001 · Blue 3001, 4001');
    await expect(fields.getByRole('listitem').filter({ hasText: 'Field 1' })).toContainText('Q2');
    await expect(fields.getByRole('listitem').filter({ hasText: 'Field 1' })).toContainText('Loaded');

    ftcLive.send('MATCH_POST', { number: 1, field: 2 });
    await expect(field2).toContainText('Results posted');
  } finally {
    await ftcLive.close();
  }
});

test('warns on every view when the connection to FTC Live is lost', async ({ page }) => {
  const ftcLive = await startMockFtcLive();
  await page.goto('/');
  await connectFtcLive(page, ftcLive);
  await showView(page, 'Outputs');
  await expect(page.getByRole('alert').filter({ hasText: 'Lost the connection to FTC Live' })).toHaveCount(0);

  await ftcLive.close();
  const warning = page.getByRole('alert').filter({ hasText: 'Lost the connection to FTC Live' });
  await expect(warning).toBeVisible();
  await showView(page, 'Run');
  await expect(warning).toBeVisible();

  await warning.getByRole('button', { name: 'Dismiss' }).click();
  await expect(warning).toHaveCount(0);
});
