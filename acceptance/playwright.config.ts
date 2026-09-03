import { defineConfig, devices } from '@playwright/test'

// Same shape as ../e2e/playwright.config.ts and the same reasoning: real browser, real deployed
// webapp + API + Cognito, no mocking, no hardcoded baseURL. See run.sh.
if (!process.env.WEBAPP_URL) {
  throw new Error(
    'WEBAPP_URL is not set - this suite runs against a real deployed webapp, not a local dev ' +
      'server. Use acceptance/run.sh rather than invoking `playwright test` directly.',
  )
}

// This suite now runs in two genuinely different contexts (mootmaker-webapp#19): a developer's
// own machine (disk usage doesn't matter, and a human reviewing a run wants to see exactly what a
// *passing* test did too, not just failures) and mootmaker-release's release pipeline
// (mootmaker/designs/ci-cd-pipeline.md Decision 7 - unattended, once per release attempt, in
// GitHub Actions, which sets CI=true automatically - no manual wiring needed here). Full capture
// on a local machine has produced ~800MB for a run; the same thing unconditionally in CI is a
// different cost story even on a free-tier runner. Branching here keeps local behaviour completely
// unchanged and gives CI a deliberately lighter capture level instead of turning the suite down
// globally.
const isCI = !!process.env.CI

// Everything this suite writes at run time - the HTML report (local only), the JSON summary, and
// every trace/screenshot - lands under test-output/, which is git-ignored (see ../.gitignore's
// unscoped `test-output/` entry) so a run's output can never be accidentally committed. `list`
// stays in both contexts, for a live/log view while a run is in progress.
export default defineConfig({
  testDir: './tests',
  // Not fullyParallel, same reasoning as e2e/playwright.config.ts - this layer is meant to run
  // deliberately against real infrastructure, not hammered concurrently. Revisit once this suite
  // has enough specs that serial execution is the actual bottleneck.
  fullyParallel: false,
  workers: 1,
  // In CI, one retry smooths over transient real-AWS flakiness during an unattended run - nobody
  // is watching to just re-run manually the way a human would locally, where retries stay 0 so a
  // real bug doesn't quietly pass on the second attempt.
  retries: isCI ? 1 : 0,
  reporter: [
    ['list'],
    // Human-readable, local only: a self-contained, browsable report (`npx playwright show-report
    // acceptance/test-output/html-report`) - every test's steps, attachments, and (since trace is
    // 'on' below in that context) a full Trace Viewer recording even for a passing run. Skipped in
    // CI - the html reporter bundles every attachment into the report itself, the single biggest
    // contributor to the ~800MB a local run can produce, and nothing in CI ever browses this
    // report interactively anyway.
    ...(isCI ? [] : [['html', { outputFolder: 'test-output/html-report', open: 'never' }] as const]),
    // AI/machine-readable in both contexts: the same results as structured JSON (pass/fail,
    // timing, error messages, attachment *paths* - not embedded content, so this stays small
    // regardless of the trace/screenshot level below). No extra dependency, Playwright's own
    // built-in reporter. This is what a CI shipping step forwards to CloudWatch per
    // ci-cd-pipeline.md Decision 11.
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
    // Local: 'on' rather than 'retain-on-failure'/'only-on-failure' - a human (or an AI) reviewing
    // a run later should be able to see exactly what a *passing* test did too, not just failures.
    // CI: only on failure - near-zero on the overwhelmingly common happy path, still something to
    // look at if a release's own acceptance run genuinely fails.
    trace: isCI ? 'retain-on-failure' : 'on',
    screenshot: isCI ? 'only-on-failure' : 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
})
