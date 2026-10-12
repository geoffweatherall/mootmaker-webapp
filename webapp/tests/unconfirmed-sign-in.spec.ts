import { test, expect } from '@playwright/test'
import { MOCK_VERIFICATION_CODE, UNCONFIRMED_USER } from '../src/auth/cognito.mock'

// Use case 150: someone who left sign-up before entering the code can finish it from sign-in.

test.use({ storageState: { cookies: [], origins: [] } })

test('signing in to an unconfirmed account asks for the code, can resend it, then signs in', async ({ page }) => {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(UNCONFIRMED_USER.email)
  await page.getByLabel('Password').fill(UNCONFIRMED_USER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText("This account hasn't been confirmed yet.")).toBeVisible()
  await page.getByRole('button', { name: 'Send a new code' }).click()
  await expect(page.getByText("We've sent a new code.")).toBeVisible()

  await page.getByLabel('Verification code').fill('000000')
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid verification code' })).toBeVisible()

  await page.getByLabel('Verification code').fill(MOCK_VERIFICATION_CODE)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})
