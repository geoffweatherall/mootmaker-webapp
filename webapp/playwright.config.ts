import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
  },
  projects: [
    // Signs in as the e2e test user once and saves the session for the main project.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    // Not the app's normal `npm run dev` - this suite needs no live AWS environment, deployed
    // API, or real Cognito user (see testing-strategy.md): `vite --mode mock` swaps in the
    // MSW-mocked GraphQL API and the fixture-backed auth double (see vite.config.ts, main.tsx,
    // src/auth/cognito.mock.ts, src/testSupport/mocks/).
    command: 'npm run dev:mock -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
