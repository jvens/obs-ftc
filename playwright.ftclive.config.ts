import { defineConfig } from '@playwright/test';
import obs from './playwright.obs.config';

// Tests against the real FTC Live (e2e/ftclive), which they start in Docker: see
// integration/ftcLive/ftcLive.ts. Tests that follow FTC Live into OBS start the real OBS too.
// One test at a time: they share FTC Live's event and play its matches in turn. A full match takes
// 2:38. `npm run test:e2e:ftclive`.
export default defineConfig({
  ...obs,
  testMatch: 'ftclive/**/*.spec.ts',
  fullyParallel: false,
  timeout: 360_000,
  outputDir: 'test-results/ftclive',
  projects: [{ ...obs.projects![0], name: 'ftc-live' }],
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report/ftclive' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/ftclive' }]],
});
