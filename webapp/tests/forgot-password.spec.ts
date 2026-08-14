import { test, expect } from '@playwright/test'
import { DEMO_USER, MOCK_VERIFICATION_CODE } from '../src/auth/cognito.mock'

// Run these tests signed out; password reset is a public flow.
test.use({ storageState: { cookies: [], origins: [] } })

// The mock's forgotPassword() always resolves regardless of whether this email matches a known
// account (see cognito.mock.ts), mirroring Cognito's own *prevent user existence errors* setting -
// so, like the real flow it stands in for, this needs no real account and reveals nothing about
// whether one exists.
const unknownEmail = () => `e2e-reset-${Date.now()}@example.com`

test.describe('Forgot password', () => {
  test('sign-in page links to the reset form', async ({ page }) => {
    await page.goto('/signin')

    await page.getByRole('link', { name: 'Forgot password?' }).click()

    await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible()
    await expect(page).toHaveURL('/forgot-password')
  })

  test('requesting a code advances to the reset step and a wrong code is rejected', async ({
    page,
  }) => {
    await page.goto('/forgot-password')

    await page.getByLabel('Email').fill(unknownEmail())
    await page.getByRole('button', { name: 'Send code' }).click()

    // Step 2: code + new password.
    await expect(page.getByLabel('Verification code')).toBeVisible()

    await page.getByLabel('Verification code').fill('000000')
    await page.getByLabel('New password').fill('Valid-password-1!')
    await page.getByRole('button', { name: 'Reset password' }).click()

    // The bogus code is rejected and the user stays on the reset form.
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL('/forgot-password')
    await expect(page.getByLabel('Verification code')).toBeVisible()
  })

  // Previously impossible to automate without reading a real inbox (see README.md's Tests
  // section, before this suite moved onto mocked auth) - now that the verification code is a
  // fixed, known mock value (MOCK_VERIFICATION_CODE), the full success path is cheap and
  // deterministic to cover too.
  test('the correct code resets the password and signs the user in automatically', async ({
    page,
  }) => {
    await page.goto('/forgot-password')

    await page.getByLabel('Email').fill(DEMO_USER.email)
    await page.getByRole('button', { name: 'Send code' }).click()
    await expect(page.getByLabel('Verification code')).toBeVisible()

    await page.getByLabel('Verification code').fill(MOCK_VERIFICATION_CODE)
    await page.getByLabel('New password').fill('New-password-2!')
    await page.getByRole('button', { name: 'Reset password' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })
})
