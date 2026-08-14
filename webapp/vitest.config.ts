import { defineConfig } from 'vitest/config'

// Unit tests for the webapp's actual logic (see testing-strategy.md's "Unit tests" layer) - pure
// functions only, no browser/DOM and no network, so `node` is enough and keeps this layer fast.
// Playwright's tests/*.spec.ts (a real browser against a mocked API) are a separate layer/runner -
// see playwright.config.ts - not covered by this config.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
