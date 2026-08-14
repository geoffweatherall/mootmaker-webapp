import { test as setup, expect } from '@playwright/test'
import { E2E_USER } from '../src/auth/cognito.mock'

const authFile = 'playwright/.auth/user.json'

// Signs in through the real sign-in form as the fixture e2e user (see src/auth/cognito.mock.ts -
// this suite runs entirely against the mocked dev server, `vite --mode mock`, see
// playwright.config.ts) and saves the browser session, so the other tests start already
// authenticated. E2E_USER has no linked Person, matching the real e2e test user's account this
// suite used to sign in as - see README.md's "Organiser/attendee mutual exclusivity" section for
// why that matters to some of the tests that reuse this session.
setup('sign in as the mock e2e test user', async ({ page }) => {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(E2E_USER.email)
  await page.getByLabel('Password').fill(E2E_USER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  await page.context().storageState({ path: authFile })
})
