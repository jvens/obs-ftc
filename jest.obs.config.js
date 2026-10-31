// The contract tests (*.obs.test.ts) against a real OBS Studio, which the global setup starts (see
// integration/obs/obsStudio.ts). One test at a time: they share the OBS.
import unit from './jest.config.js';

/** @type {import('jest').Config} */
export default {
  ...unit,
  testMatch: ['**/*.obs.test.ts'],
  globalSetup: '<rootDir>/integration/obs/jestGlobalSetup.ts',
  globalTeardown: '<rootDir>/integration/obs/jestGlobalTeardown.ts',
  // Node's builds of packages, so obs-websocket-js reaches OBS through ws; jsdom still provides window.
  testEnvironmentOptions: { customExportConditions: ['node', 'node-addons'] },
  maxWorkers: 1,
  testTimeout: 120_000,
};
