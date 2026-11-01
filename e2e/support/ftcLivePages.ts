// Drives the real FTC Live's web pages the way an event's staff do: the event admin setting up an
// event, the scorekeeper running matches from Match Control, and the referees submitting scores.
import { type Page, expect } from '@playwright/test';

export interface TestEvent {
  eventCode: string;
  name: string;
  fieldCount: number;
  teams: number[];
}

// The default account, which needs no password from this computer.
export const logIn = async (page: Page, url: string) => {
  await page.goto(`${url}/login/`);
  await page.getByLabel('Username:').fill('local');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByText('Hello, local')).toBeVisible();
};

const api = async <T>(url: string, path: string) => {
  const response = await fetch(`${url}/api/v1${path}`);
  return response.ok ? await response.json() as T : undefined;
};

// Event Admin > Setup Event > Offline Setup > Manual Setup, then teams and a qualification schedule.
export const createEvent = async (page: Page, url: string, event: TestEvent) => {
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${url}/create/event/`);
  await page.getByRole('button', { name: 'I understand' }).click();
  const today = new Date().toISOString().slice(0, 10);
  await page.locator('#eventCodeInput').fill(event.eventCode);
  await page.locator('#eventNameInput').fill(event.name);
  await page.locator('#eventRegionInput').selectOption({ label: 'Minnesota' });
  await page.locator('#startDatePicker').fill(today);
  await page.locator('#endDatePicker').fill(today);
  await page.locator('#fieldNumberInput').fill(String(event.fieldCount));
  await page.getByRole('button', { name: 'Create Event' }).click();
  // FTC Live creates the event's database in the background.
  await expect.poll(() => api(url, `/events/${event.eventCode}/`), { timeout: 30_000 }).toBeTruthy();

  await page.goto(`${url}/event/${event.eventCode}/dashboard/teams/`);
  await page.locator('#indTab').click();
  for (const team of event.teams) {
    await page.locator('#teamIn').fill(String(team));
    await page.locator('#indAdd').click();
    await expect.poll(async () => (await api<{ teamNumbers: number[] }>(url, `/events/${event.eventCode}/teams/`))?.teamNumbers)
      .toContain(team);
  }

  await page.goto(`${url}/event/${event.eventCode}/dashboard/schedule/quals/`);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('#runMatchmaker').click();
  await expect(page.getByText('Schedule has been generated')).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Activate Qualification Schedule' }).click();
  await expect.poll(async () => (await api<{ matches: unknown[] }>(url, `/events/${event.eventCode}/matches/`))?.matches.length,
    { timeout: 30_000 }).toBeGreaterThan(0);
};

// The scorekeeper's Match Control page.
export const matchControl = (page: Page, url: string, eventCode: string) => {
  const press = async (name: string) => {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeEnabled();
    await button.click();
  };
  return {
    open: () => page.goto(`${url}/event/${eventCode}/control/`),
    // Loads the next match, unless one is loaded already: FTC Live keeps an aborted match loaded,
    // ready to replay.
    loadMatch: async () => {
      const showPreview = page.getByRole('button', { name: 'Show Preview', exact: true });
      if (!(await showPreview.isEnabled())) await press('Load Next Match');
      await expect(showPreview).toBeEnabled();
    },
    showPreview: () => press('Show Preview'),
    showMatch: () => press('Show Match'),
    startMatch: () => press('Start Match'),
    // FTC Live asks for confirmation in a box of its own.
    abortMatch: async () => {
      await press('Abort Match');
      await press('Abort');
    },
    // A match runs 2:38; afterwards the scorekeeper can discard it or, once both alliances' scores
    // are in, commit it.
    waitForMatchEnd: () => expect(page.getByRole('button', { name: 'Discard Match', exact: true })).toBeEnabled({ timeout: 200_000 }),
    commitAndPost: () => press('Commit & Post Last Match'),
  };
};

// A referee at an alliance's scoring tablet submits the match's scores, all zero, once it has ended.
export const submitScores = async (page: Page, url: string, eventCode: string, field: number, alliance: 'red' | 'blue', match: string) => {
  await page.goto(`${url}/event/${eventCode}/scoring/field/${field}/${alliance}/scoring/`);
  await page.getByRole('button', { name: new RegExp(`^Match ${match}\\b`) }).click();
  for (const step of [/Alliance Ready$/, /^Submit AUTO$/, /^Submit TELEOP$/, /^Submit Final Scores$/]) {
    const button = page.getByRole('button', { name: step });
    await expect(button).toBeEnabled();
    await button.click();
  }
  await expect(page.getByRole('button', { name: /^Submit Final Scores$/ })).toHaveCount(0);
};
