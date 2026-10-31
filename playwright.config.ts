import { defineConfig, devices } from '@playwright/test';

// End-to-end tests in real browsers against the production build, with a mock OBS (`npm run build`
// first; `npm run test:e2e` does both). One project per browser: pick with --project, e.g. --project=firefox.
// chromium, firefox and webkit are Playwright's own builds (npx playwright install <name>); the
// others are the installed Chrome and Edge releases (npx playwright install chrome).

const PORT = 4174;

// Chromium-based browsers: a fake webcam and microphone, with no permission prompt.
const chromiumMedia = {
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
};

export default defineConfig({
  testDir: 'e2e',
  // The tests against a real OBS Studio run on their own: playwright.obs.config.ts.
  testIgnore: 'obs/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Each LAN camera test encodes 1080p video in two or three browsers at once; CI runners have too
  // few cores to run more than one such test at a time reliably.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: chromiumMedia } },
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', launchOptions: chromiumMedia } },
    { name: 'chrome-beta', use: { ...devices['Desktop Chrome'], channel: 'chrome-beta', launchOptions: chromiumMedia } },
    { name: 'msedge', use: { ...devices['Desktop Edge'], channel: 'msedge', launchOptions: chromiumMedia } },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'media.navigator.streams.fake': true,
            'media.navigator.permission.disabled': true,
            'media.autoplay.default': 0,
          },
        },
      },
    },
    // WebKit has mock devices built in, but asks before using them. Its video encoding is much
    // heavier than the other browsers', so LAN camera tests stall with more than two at once.
    { name: 'webkit', workers: 2, use: { ...devices['Desktop Safari'], permissions: ['camera', 'microphone'] } },
  ],
});
