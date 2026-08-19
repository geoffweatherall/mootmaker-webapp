import { expect, test } from '@playwright/test'
import { waitForVerificationCode } from '../../support/email'
import { freshTestAccount } from '../../support/testAccount'

// mootmaker/use-cases.md, section A (Sign up), case 1 - plus a touch of case 5. Unlike
// e2e/sign-up.spec.ts (which only proves the real Cognito + SES infrastructure wiring works),
// this test's job is proving the *use case* is satisfied: not just that the account got
// confirmed, but that its business-level effects are correct - a linked Person auto-created with
// the name actually entered at sign-up, visible back on Settings.
test('sign up with a valid name, email, and password auto-creates a linked Person with that name', async ({
  page,
}) => {
  const account = freshTestAccount()

  await page.goto('/signup')
  await page.getByLabel('Name').fill(account.name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign up' }).click()

  await expect(page.getByLabel('Verification code')).toBeVisible()

  const code = await waitForVerificationCode(account.email)

  await page.getByLabel('Verification code').fill(code)
  await page.getByRole('button', { name: 'Confirm' }).click()

  // Correct code confirms and signs the user in automatically.
  await expect(page.getByText('Sign out')).toBeVisible()

  // Case 5: the linked Person was auto-created with the name actually entered, not left blank or
  // defaulted from the email address.
  await page.goto('/settings')
  await expect(page.getByLabel('Name')).toHaveValue(account.name)
})
