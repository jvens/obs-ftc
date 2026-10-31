import { Browser, BrowserContext, Page, test as base, expect } from '@playwright/test';
import { MockObs, startMockObs } from './mockObs';

export { expect };

// Pages may only reach the site under test and OBS: anything else (analytics, fonts, the safe
// background image) is blocked so the tests run offline.
const offline = (context: BrowserContext, baseURL: string) => {
  const site = new URL(baseURL).origin;
  return context.route(url => url.origin !== site && url.protocol.startsWith('http'), route => route.abort());
};

export interface Fixtures {
  // Every test gets its own mock OBS.
  obs: MockObs;
  // A page in an OBS browser source. OBS shows browser sources in Chromium (CEF) whichever browser
  // the project tests, with autoplay allowed.
  obsBrowserSource: Page;
  // Another computer on the event network: a browser of its own, of the type under test.
  otherComputer: BrowserContext;
}

export const test = base.extend<Fixtures, { obsBrowser: Browser }>({
  obs: async ({}, use) => {
    const obs = await startMockObs();
    await use(obs);
    await obs.close();
  },
  context: async ({ context, baseURL }, use) => {
    await offline(context, baseURL!);
    await use(context);
  },
  otherComputer: async ({ browser, launchOptions, channel, permissions, baseURL }, use) => {
    const other = await browser.browserType().launch({ ...launchOptions, channel });
    const context = await other.newContext({ baseURL, permissions });
    await offline(context, baseURL!);
    await use(context);
    await other.close();
  },
  obsBrowser: [async ({ playwright }, use) => {
    const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    await use(browser);
    await browser.close();
  }, { scope: 'worker' }],
  obsBrowserSource: async ({ obsBrowser, baseURL }, use) => {
    const context = await obsBrowser.newContext({ baseURL, viewport: { width: 1920, height: 1080 } });
    await offline(context, baseURL!);
    await use(await context.newPage());
    await context.close();
  },
});
