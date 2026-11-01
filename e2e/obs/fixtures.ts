// Fixtures for testing the dashboard against a real OBS Studio (playwright.obs.config.ts).
import OBSWebSocket from 'obs-websocket-js';
import { Page } from '@playwright/test';
import { ObsStudio, startObsStudio } from '../../integration/obs/obsStudio';
import { MockFtcLive, startMockFtcLive } from '../support/mockFtcLive';
import { expect, test as base } from '../support/fixtures';

export { expect };

export interface RealObs {
  studio: ObsStudio;
  host: string;
  port: number;
  password: string;
  // The test's own connection, for setting OBS up and checking what the dashboard did.
  control: OBSWebSocket;
}

let collections = 0;
let events = 0;

export const test = base.extend<{ realObs: RealObs; ftcLive: MockFtcLive }, { obsStudio: ObsStudio }>({
  // One OBS for all the tests in a worker; starting it takes a few seconds.
  obsStudio: [async ({}, use) => {
    const studio = await startObsStudio();
    await use(studio);
    await studio.stop();
  }, { scope: 'worker', timeout: 300_000 }],
  // Each test starts in a new, empty scene collection.
  realObs: async ({ obsStudio }, use, testInfo) => {
    const name = `E2E ${process.pid} ${++collections}`;
    const connect = async () => {
      const control = new OBSWebSocket();
      await control.connect(obsStudio.url, obsStudio.password);
      return control;
    };
    const switchToNewCollection = (control: OBSWebSocket) => expect(async () => {
      if (!(await control.call('GetSceneCollectionList')).sceneCollections.includes(name))
        await control.call('CreateSceneCollection', { sceneCollectionName: name });
      expect((await control.call('GetSceneCollectionList')).currentSceneCollectionName).toBe(name);
    }).toPass({ timeout: 30_000 });
    let control = await connect();
    try {
      await switchToNewCollection(control);
    } catch (error) {
      // Now and then (about one full run in four), OBS keeps answering "not ready" (207) after
      // switching scene collection, with "Not all sources were cleared" in its log. Not yet
      // explained; restart OBS so the remaining tests can run, and say so in the report.
      if (!obsStudio.restart) throw error;
      testInfo.annotations.push({ type: 'warning', description: `OBS stayed "not ready" after a scene collection switch and was restarted: ${error}` });
      await control.disconnect().catch(() => undefined);
      await obsStudio.restart();
      control = await connect();
      await switchToNewCollection(control);
    }
    const { hostname, port } = new URL(obsStudio.url);
    await use({ studio: obsStudio, host: hostname, port: Number(port), password: obsStudio.password, control });
    // A test may leave OBS recording (the dashboard records each match), which would stop the next
    // test from setting OBS up.
    if (control.identified) {
      await control.call('StopRecord').catch(() => undefined);
      await control.call('StopReplayBuffer').catch(() => undefined);
      await expect.poll(async () => (await control.call('GetRecordStatus')).outputActive).toBe(false);
    }
    await control.disconnect().catch(() => undefined);
  },
  ftcLive: async ({}, use, testInfo) => {
    // An event code per test keeps the scene collections setup creates apart.
    const ftcLive = await startMockFtcLive({ eventCode: `e2e${testInfo.workerIndex}n${++events}` });
    await use(ftcLive);
    await ftcLive.close();
  },
});

// SetRecordDirectory (obs-websocket 5.3) is missing from obs-websocket-js's request types.
export const setRecordDirectory = (control: OBSWebSocket, recordDirectory: string) =>
  (control.call as unknown as (type: string, data: object) => Promise<unknown>)('SetRecordDirectory', { recordDirectory });

export const section = (page: Page, heading: string) =>
  page.locator('.section', { has: page.getByRole('heading', { name: heading, exact: true }) });

// Connects the dashboard to OBS the way a volunteer does.
export const connectObs = async (page: Page, obs: Pick<RealObs, 'host' | 'port' | 'password'>) => {
  const panel = section(page, 'OBS Studio Connection');
  await panel.getByPlaceholder('Enter OBS Studio IP').fill(obs.host);
  await panel.getByPlaceholder('Port').fill(String(obs.port));
  await panel.getByPlaceholder('OBS Websocket Password').fill(obs.password);
  await panel.getByRole('button', { name: 'Connect' }).click();
  return panel;
};

// An FTC Live server with an event: the mock, or the real one (e2e/ftclive).
export interface FtcLiveWithEvent {
  host: string;
  event: { eventCode: string };
  // Resolves once a dashboard is listening to the match event stream (the mock knows).
  connected?: () => Promise<void>;
}

// Picks the event on FTC Live and, with `listen`, follows its match events.
export const connectFtcLive = async (page: Page, ftcLive: FtcLiveWithEvent, { listen = false } = {}) => {
  const panel = section(page, 'FTC Live Server');
  await panel.getByPlaceholder('Enter server IP').fill(ftcLive.host);
  await panel.getByRole('button', { name: 'Get Event Codes' }).click();
  await panel.getByRole('combobox').selectOption(ftcLive.event.eventCode);
  if (listen) {
    await panel.getByRole('button', { name: 'Connect' }).click();
    await expect(panel.getByText('Connected', { exact: true })).toBeVisible();
    await ftcLive.connected?.();
  }
};

// Builds the event's scenes with "Set up in a new scene collection" and waits for it to finish.
export const setUpObs = async (page: Page, ftcLive: FtcLiveWithEvent) => {
  const panel = section(page, 'Configure OBS Studio');
  await panel.getByRole('button', { name: 'Set up in a new scene collection' }).click();
  // "FTC <code>", or "FTC <code> (2)" and so on when an earlier test set the same event up.
  await expect(panel.getByText(new RegExp(`Scene collection: FTC ${ftcLive.event.eventCode}( \\(\\d+\\))?(?!\\w)`))).toBeVisible({ timeout: 60_000 });
  return panel;
};
