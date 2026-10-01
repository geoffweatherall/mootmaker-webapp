import { test as base } from '@playwright/test'
import { SetupApi } from './setupApi'
import { resetEnvironment } from './reset'

/**
 * The suite's `test`. Every test that touches the deployed environment imports it from here rather
 * than from '@playwright/test' (mootmaker-webapp#138):
 *
 * - **The environment is reset before each test**, automatically. So a test may run alone, or in
 *   any order, and still pass: it relies on nothing from another test, nothing from demo-data, and
 *   only the reset baseline - no rooms, no meetings, and the demo and fixture users (./accounts.ts).
 * - **`api`** sets up whatever else the test needs, over the API, as the machine-to-machine client
 *   (which has admin scope). Setup goes through the admin UI only when the admin UI is the subject.
 */
export const test = base.extend<{ resetBeforeEach: void; api: SetupApi }>({
  resetBeforeEach: [
    async ({}, use) => {
      await resetEnvironment()
      await use()
    },
    { auto: true },
  ],
  api: async ({ request }, use) => {
    await use(new SetupApi(request))
  },
})

export { expect } from '@playwright/test'
