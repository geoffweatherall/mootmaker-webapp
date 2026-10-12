import { test as setup, expect } from '@playwright/test'
import { NO_PERSON_USER } from '../src/auth/cognito.mock'

const authFile = 'playwright/.auth/user.json'

// Signs in through the real sign-in form as the fixture e2e user (see src/auth/cognito.mock.ts -
// this suite runs entirely against the mocked dev server, `vite --mode mock`, see
// playwright.config.ts) and saves the browser session, so the other tests start already
// authenticated. NO_PERSON_USER has no linked Person, so the Add Meeting form's organiser default
// never fires for tests that reuse this session.
setup('sign in as the mock no-person user', async ({ page }) => {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(NO_PERSON_USER.email)
  await page.getByLabel('Password').fill(NO_PERSON_USER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  await page.context().storageState({ path: authFile })
})
