import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// The dashboard against a real OBS Studio (e2e/obs), which the tests start: see
// integration/obs/obsStudio.ts for the OBS_VERSION, OBS_PORT and OBS_URL settings. Chromium only,
// one test at a time against one OBS. `npm run test:e2e:obs`.
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: 'obs/**/*.spec.ts',
  timeout: 120_000,
  workers: 1,
  outputDir: 'test-results/obs',
  reporter: process.env.CI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report/obs' }]] : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/obs' }]],
  projects: [
    {
      name: 'obs-studio',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
        },
      },
    },
  ],
});
