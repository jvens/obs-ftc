// The hosted dashboard is an HTTPS page on the internet, and FTC Live and OBS are plain HTTP and ws://
// on other computers on the event network. These tests serve the site over HTTPS, have Chromium treat
// it as a public site, and point the dashboard and the camera page at this computer's network
// address rather than localhost, so the browsers apply the rules they apply at an event: Chrome and
// Edge ask for local network access, and Firefox blocks the connections.
import { Browser, BrowserContext, Page, test as base, expect } from '@playwright/test';
import { HttpsSite, networkAddress, startHttpsSite } from './support/httpsSite';
import { MockFtcLive, startMockFtcLive } from './support/mockFtcLive';
import { MockObs, startMockObs } from './support/mockObs';
import { showStep, stepArea } from './support/dashboard';

interface Fixtures {
  // This computer's network address, as another computer at the event would reach it.
  lan: string;
  ftcLive: MockFtcLive;
  mockObs: MockObs;
  // Opens a page of the HTTPS site, in a browser that treats it as a public site.
  open: (path: string, options?: { allowLocalNetwork?: boolean }) => Promise<Page>;
}

const test = base.extend<Fixtures, { site: HttpsSite }>({
  site: [async ({}, use) => {
    const site = await startHttpsSite();
    await use(site);
    await site.close();
  }, { scope: 'worker' }],
  lan: async ({}, use) => {
    const lan = networkAddress();
    test.skip(!lan, 'This computer has no network address other than loopback');
    await use(lan!);
  },
  ftcLive: async ({}, use) => {
    const ftcLive = await startMockFtcLive({ listen: '0.0.0.0' });
    await use(ftcLive);
    await ftcLive.close();
  },
  mockObs: async ({}, use) => {
    const obs = await startMockObs({ listen: '0.0.0.0' });
    await use(obs);
    await obs.close();
  },
  open: async ({ browser, browserName, launchOptions, channel, site, lan }, use) => {
    const opened: Browser[] = [];
    await use(async (path, { allowLocalNetwork = false } = {}) => {
      const publicSite = browserName === 'chromium' ? [`--ip-address-space-overrides=127.0.0.1:${site.port}=public`] : [];
      const own = await browser.browserType().launch({ ...launchOptions, channel, args: [...(launchOptions.args ?? []), ...publicSite] });
      opened.push(own);
      const context: BrowserContext = await own.newContext({
        baseURL: site.url,
        ignoreHTTPSErrors: true,
        permissions: allowLocalNetwork ? ['local-network-access'] : [],
      });
      // Offline apart from the site, the mocks on this computer, and its network address.
      await context.route(url => url.protocol.startsWith('http') && !['localhost', '127.0.0.1', lan].includes(url.hostname), route => route.abort());
      // A returning visitor, so the dashboard opens on Setup rather than About.
      await context.addInitScript(() => localStorage.setItem('aboutSeen', 'true'));
      const page = await context.newPage();
      await page.goto(path);
      return page;
    });
    await Promise.all(opened.map(own => own.close()));
  },
});

test.skip(({ browserName }) => browserName === 'webkit', 'Not checked against Safari, which WebKit on Linux and Windows does not match here');

const section = (page: Page, heading: string) =>
  page.locator('.section', { has: page.getByRole('heading', { name: heading, exact: true }) });

const ftcLivePanel = (page: Page) => stepArea(page, 'ftc-live');
const obsPanel = (page: Page) => stepArea(page, 'obs');

// Opens the Connect to OBS Studio step and fills in OBS's address.
const fillObs = async (page: Page, host: string, port: number) => {
  await showStep(page, 'obs');
  await obsPanel(page).getByPlaceholder('Enter OBS Studio IP').fill(host);
  await obsPanel(page).getByPlaceholder('Port').fill(String(port));
};

test.describe('Chrome and Edge', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-based browsers only');

  test('connect to FTC Live and OBS on another computer once local network access is allowed', async ({ open, lan, ftcLive, mockObs }) => {
    const page = await open('/', { allowLocalNetwork: true });

    await ftcLivePanel(page).getByPlaceholder('Enter server IP').fill(`${lan}:${ftcLive.port}`);
    await ftcLivePanel(page).getByRole('button', { name: 'Get Event Codes' }).click();
    await ftcLivePanel(page).getByRole('combobox').selectOption(ftcLive.event.eventCode);
    await ftcLivePanel(page).getByRole('button', { name: 'Connect' }).click();
    await expect(ftcLivePanel(page).getByText('Connected', { exact: true })).toBeVisible();

    await fillObs(page, lan, mockObs.port);
    await obsPanel(page).getByRole('button', { name: 'Connect' }).click();
    await expect(obsPanel(page).getByText('Connected', { exact: true })).toBeVisible();

    await expect(page.getByRole('note')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('show how to allow local network access once a connection is blocked', async ({ open, lan, ftcLive, mockObs }) => {
    const page = await open('/');

    await ftcLivePanel(page).getByPlaceholder('Enter server IP').fill(`${lan}:${ftcLive.port}`);
    // Nothing until a connection fails.
    await expect(page.getByRole('note')).toHaveCount(0);

    await ftcLivePanel(page).getByRole('button', { name: 'Get Event Codes' }).click();
    const ftcHelp = ftcLivePanel(page).getByRole('note');
    await expect(ftcHelp).toContainText('The browser may have blocked the connection to FTC Live');
    await expect(ftcHelp).toContainText('Set "Local network access" to "Allow"');
    await expect(ftcHelp).not.toContainText('Insecure content');

    await fillObs(page, lan, mockObs.port);
    await expect(obsPanel(page).getByRole('note')).toHaveCount(0);
    await obsPanel(page).getByRole('button', { name: 'Connect' }).click();
    const obsHelp = obsPanel(page).getByRole('note');
    await expect(obsHelp).toContainText('The browser may have blocked the connection to OBS');
    await expect(obsPanel(page).getByText('Connected', { exact: true })).toHaveCount(0);
  });

  test('also ask for insecure content for a host name', async ({ open }) => {
    const page = await open('/');
    await ftcLivePanel(page).getByPlaceholder('Enter server IP').fill('scoring.example');
    await ftcLivePanel(page).getByRole('button', { name: 'Get Event Codes' }).click();
    await expect(ftcLivePanel(page).getByRole('note')).toContainText('Set "Insecure content" to "Allow"');
  });

  test('the camera page shows how to allow local network access once OBS is blocked', async ({ open, lan, mockObs }) => {
    const page = await open('/camera');
    await page.getByLabel('OBS computer:').fill(lan);
    await page.getByLabel('Port:').fill(String(mockObs.port));
    await expect(page.getByRole('note')).toHaveCount(0);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByRole('note')).toContainText('The browser may have blocked the connection to OBS');
  });
});

test.describe('Firefox', () => {
  test.skip(({ browserName }) => browserName !== 'firefox', 'Firefox only');

  test('warns before connecting to another computer, which it blocks', async ({ open, lan, ftcLive, mockObs }) => {
    const page = await open('/');

    await ftcLivePanel(page).getByPlaceholder('Enter server IP').fill(`${lan}:${ftcLive.port}`);
    await expect(ftcLivePanel(page).getByRole('alert')).toContainText('Firefox will not connect to FTC Live on another computer');
    await ftcLivePanel(page).getByRole('button', { name: 'Get Event Codes' }).click();
    // The request is blocked, so no events arrive.
    await expect(ftcLivePanel(page).getByRole('option')).toHaveText(['Select an event']);

    await fillObs(page, lan, mockObs.port);
    await expect(obsPanel(page).getByRole('alert')).toContainText('Firefox will not connect to OBS on another computer');
    await obsPanel(page).getByRole('button', { name: 'Connect' }).click();
    await expect(obsPanel(page).getByText(/Unable to connect/)).toBeVisible();
    await expect(obsPanel(page).getByText('Connected', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('note')).toHaveCount(0);
  });

  test('connects to this computer without a warning', async ({ open, ftcLive, mockObs }) => {
    const page = await open('/');

    await ftcLivePanel(page).getByPlaceholder('Enter server IP').fill(ftcLive.host);
    await ftcLivePanel(page).getByRole('button', { name: 'Get Event Codes' }).click();
    await ftcLivePanel(page).getByRole('combobox').selectOption(ftcLive.event.eventCode);

    await fillObs(page, 'localhost', mockObs.port);
    await obsPanel(page).getByRole('button', { name: 'Connect' }).click();
    await expect(obsPanel(page).getByText('Connected', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('the camera page warns before connecting to another computer', async ({ open, lan }) => {
    const page = await open('/camera');
    await page.getByLabel('OBS computer:').fill(lan);
    await expect(page.getByRole('alert')).toContainText('Firefox will not connect to OBS on another computer');
  });
});
