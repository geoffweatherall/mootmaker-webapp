import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.probe\.ts/,
  workers: 1,
  retries: 0,
  timeout: 30 * 60_000,
  reporter: [['list']],
  outputDir: './test-output/test-results',
  use: {
    baseURL: process.env.WEBAPP_URL,
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    viewport: { width: 1400, height: 900 },
    trace: 'off',
  },
})
