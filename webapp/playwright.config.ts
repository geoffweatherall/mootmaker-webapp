import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  // These tests hit the real deployed API rather than a mock, and the project deliberately
  // "scales to zero" (each Lambda is left to go idle and cold rather than kept warm, to keep AWS
  // costs near zero between uses) - so a cold start (observed up to ~6s for the Java Lambdas) is
  // expected, normal latency here, not a hang. Playwright's 5000ms default expect timeout is tuned
  // for near-instant mocked backends and is too tight for that, especially with fullyParallel
  // spreading requests across several Lambdas at once (each concurrent invocation beyond the one
  // warm execution environment needs its own cold start).
  expect: {
    timeout: 15_000,
  },
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
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
