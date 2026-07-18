import { test as setup, expect } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

// Signs in through the real sign-in form as the pre-confirmed e2e test user
// (created by the API project's Terraform) and saves the browser session, so
// the other tests start already authenticated.
setup('sign in as the e2e test user', async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL
  const password = process.env.E2E_USER_PASSWORD
  if (!email || !password) {
    throw new Error(
      'E2E_USER_EMAIL and E2E_USER_PASSWORD are required to run the e2e tests. ' +
        'Export them from the deployed API with `source ../../mootmaker-api/authenticate.sh`.',
    )
  }

  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  await page.context().storageState({ path: authFile })
})
