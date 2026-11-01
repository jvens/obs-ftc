// Fixtures for testing against the real FTC Live (playwright.ftclive.config.ts): the scoring system
// in Docker with one test event per worker, and its staff's pages. The real OBS fixtures are there
// too, for tests that follow FTC Live into OBS.
import { Page } from '@playwright/test';
import { FtcLive, startFtcLive } from '../../integration/ftcLive/ftcLive';
import { TestEvent, createEvent, logIn, matchControl } from '../support/ftcLivePages';
import { test as base } from '../obs/fixtures';

export { expect } from '../obs/fixtures';

export interface RealFtcLive extends FtcLive {
  event: TestEvent;
}

export const test = base.extend<
  { scorekeeper: ReturnType<typeof matchControl>; referee: Page },
  { ftcLiveServer: FtcLive; realFtcLive: RealFtcLive }
>({
  ftcLiveServer: [async ({}, use) => {
    const server = await startFtcLive();
    await use(server);
    await server.stop();
  }, { scope: 'worker', timeout: 600_000 }],
  // Eight teams on two fields, with the qualification schedule (10 matches) ready to play.
  realFtcLive: [async ({ ftcLiveServer, browser }, use) => {
    const event: TestEvent = {
      eventCode: `obsftc${Date.now().toString(36).slice(-4)}`,
      name: 'OBS FTC Test Event',
      fieldCount: 2,
      teams: [90001, 90002, 90003, 90004, 90005, 90006, 90007, 90008],
    };
    const context = await browser.newContext();
    const page = await context.newPage();
    await logIn(page, ftcLiveServer.url);
    await createEvent(page, ftcLiveServer.url, event);
    await context.close();
    await use({ ...ftcLiveServer, event });
  }, { scope: 'worker', timeout: 300_000 }],
  scorekeeper: async ({ browser, realFtcLive }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());
    await logIn(page, realFtcLive.url);
    const control = matchControl(page, realFtcLive.url, realFtcLive.event.eventCode);
    await control.open();
    await use(control);
    await context.close();
  },
  referee: async ({ browser, realFtcLive }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await logIn(page, realFtcLive.url);
    await use(page);
    await context.close();
  },
});
