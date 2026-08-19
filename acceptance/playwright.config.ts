import { defineConfig, devices } from '@playwright/test'

// Same shape as ../e2e/playwright.config.ts and the same reasoning: real browser, real deployed
// webapp + API + Cognito, no mocking, no hardcoded baseURL. See run.sh.
if (!process.env.WEBAPP_URL) {
  throw new Error(
    'WEBAPP_URL is not set - this suite runs against a real deployed webapp, not a local dev ' +
      'server. Use acceptance/run.sh rather than invoking `playwright test` directly.',
  )
}

export default defineConfig({
  testDir: './tests',
  // Not fullyParallel, same reasoning as e2e/playwright.config.ts - this layer is meant to run
  // deliberately against real infrastructure, not hammered concurrently. Revisit once this suite
  // has enough specs that serial execution is the actual bottleneck.
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: process.env.WEBAPP_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
})
