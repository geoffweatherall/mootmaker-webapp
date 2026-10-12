import { defineConfig, devices } from '@playwright/test'

// Real browser, real deployed webapp + API + Cognito, no mocking, no hardcoded baseURL. See run.sh.
if (!process.env.WEBAPP_URL) {
  throw new Error(
    'WEBAPP_URL is not set - this suite runs against a real deployed webapp, not a local dev ' +
      'server. Use acceptance/run.sh rather than invoking `playwright test` directly.',
  )
}

// This suite runs in two different contexts: a developer's own machine (disk usage doesn't matter,
// and a human reviewing a run wants to see exactly what a *passing* test did too, not just
// failures) and mootmaker-release's release pipeline (unattended, in GitHub Actions, which sets
// CI=true automatically). Full capture locally can produce ~800MB for a run, so CI gets a lighter
// capture level.
const isCI = !!process.env.CI

// Everything this suite writes at run time - the HTML report (local only), the JSON summary, and
// every trace/screenshot - lands under test-output/, which is git-ignored (see ../.gitignore's
// unscoped `test-output/` entry) so a run's output can never be accidentally committed. `list`
// stays in both contexts, for a live/log view while a run is in progress.
export default defineConfig({
  testDir: './tests',
  // Not fullyParallel: this layer runs deliberately against real infrastructure, not hammered
  // concurrently. Revisit if serial execution becomes the bottleneck.
  fullyParallel: false,
  workers: 1,
  // One retry in CI, none locally: in an unattended release nobody is watching to re-run the way
  // a human would, and every test resets the environment first, so a retry is safe.
  // forgot-password.spec.ts, for instance, makes a fresh Cognito account per attempt and waits on a
  // real SES->SNS->SQS email, which is exactly the kind of genuine transient a retry should absorb.
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
    // built-in reporter.
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
