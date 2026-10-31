// Unit tests: src/**/*.test.ts(x), compiled by SWC (tsc in `npm run build` type-checks them). The
// browser APIs the app uses (window.location, localStorage, the DOM) come from jsdom.
/** @type {import('jest').Config} */
export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', { jsc: { transform: { react: { runtime: 'automatic' } } } }],
  },
  moduleNameMapper: {
    '\\.(css|svg|png)$': '<rootDir>/src/test/fileStub.ts',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/test/**', '!src/**/*.d.ts'],
};
