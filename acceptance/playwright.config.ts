import { defineConfig, devices } from '@playwright/test'

// Same shape as ../e2e/playwright.config.ts and the same reasoning: real browser, real deployed
// webapp + API + Cognito, no mocking, no hardcoded baseURL. See run.sh.
if (!process.env.WEBAPP_URL) {
  throw new Error(
    'WEBAPP_URL is not set - this suite runs against a real deployed webapp, not a local dev ' +
      'server. Use acceptance/run.sh rather than invoking `playwright test` directly.',
  )
}

// Everything this suite writes at run time - the HTML report, the JSON summary, and every trace/
// screenshot - lands under test-output/, which is git-ignored (see ../.gitignore's unscoped
// `test-output/` entry) so a run's output can never be accidentally committed. `list` stays too,
// for a live terminal view while a run is in progress.
export default defineConfig({
  testDir: './tests',
  // Not fullyParallel, same reasoning as e2e/playwright.config.ts - this layer is meant to run
  // deliberately against real infrastructure, not hammered concurrently. Revisit once this suite
  // has enough specs that serial execution is the actual bottleneck.
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    // Human-readable: a self-contained, browsable report (`npx playwright show-report
    // acceptance/test-output/html-report`) - every test's steps, attachments, and (since trace is
    // 'on' below, not just on failure) a full Trace Viewer recording even for a passing run.
    ['html', { outputFolder: 'test-output/html-report', open: 'never' }],
    // AI/machine-readable: the same results as structured JSON (pass/fail, timing, error messages,
    // attachment paths) - no extra dependency, this is Playwright's own built-in reporter.
    ['json', { outputFile: 'test-output/results.json' }],
  ],
  // Where traces/screenshots/videos actually get written (the HTML/JSON reporters above just
  // reference files in here) - kept under the same test-output/ umbrella rather than Playwright's
  // default `test-results/` so this suite's entire output lives in one git-ignored place.
  outputDir: 'test-output/test-results',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: process.env.WEBAPP_URL,
    // 'on' rather than 'retain-on-failure'/'only-on-failure': a human (or an AI) reviewing a run
    // later should be able to see exactly what a *passing* test did too, not just failures - the
    // cost is a larger test-output/ per run, which is exactly why it's git-ignored rather than
    // trimmed down.
    trace: 'on',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
})
