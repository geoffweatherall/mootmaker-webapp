import { expect, test } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { uniqueTestEmail, waitForVerificationCode } from '../../support/email'
import { freshTestAccount } from '../../support/testAccount'

// mootmaker/use-cases.md, section C (Forgot password), cases 16-20. See e2e/tests/forgot-password.spec.ts
// for the same underlying infrastructure (real Cognito forgot-password flow, real SES->SNS->SQS
// emailed code) proven in isolation - these tests instead prove the *use cases* around it: the
// real success path plus its business-level effect (signed in with the NEW password, old one no
// longer works), the no-account-enumeration behaviour, a wrong code, and a too-weak new password.

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

// Case 16: request a reset code for a valid account, enter the real emailed code with a new
// password, and confirm the *new* password is what actually works afterward - not just that the
// UI navigated away.
test('reset password with a valid account and the real emailed code signs in with the new password', async ({
  page,
}) => {
  const account = freshTestAccount()
  await createConfirmedTestAccount(account)
  const newPassword = `${account.password}-reset`

  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill(account.email)
  await page.getByRole('button', { name: 'Send code' }).click()
  await expect(page.getByLabel('Verification code')).toBeVisible()

  const code = await waitForVerificationCode(account.email)
  await page.getByLabel('Verification code').fill(code)
  await page.getByLabel('New password').fill(newPassword)
  await page.getByRole('button', { name: 'Reset password' }).click()

  await expect(page.getByText('Sign out')).toBeVisible()

  // Prove the password actually changed, not just that the UI navigated away: sign out, the OLD
  // password no longer works, the NEW one does.
  await page.getByText('Sign out').click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

  await page.goto('/signin')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('Sign out')).not.toBeVisible()

  await page.getByLabel('Password').fill(newPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
})

// Case 17: requesting a reset code for an email with no account at all must behave identically to
// a known account - no information leak about account existence (Cognito's
// prevent_user_existence_errors setting, companion to B.10 for sign-in).
test('requesting a reset code for an unknown email behaves identically to a known one', async ({
  page,
}) => {
  const demoEmail = requireEnv('DEMO_USER_EMAIL')
  const unknownEmail = uniqueTestEmail()

  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill(unknownEmail)
  await page.getByRole('button', { name: 'Send code' }).click()

  // Advances to step 2 exactly as a real account would, with no error revealing "no such
  // account".
  await expect(page.getByLabel('Verification code')).toBeVisible()
  await expect(page.getByRole('alert')).not.toBeVisible()

  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByRole('button', { name: 'Send code' }).click()

  await expect(page.getByLabel('Verification code')).toBeVisible()
  await expect(page.getByRole('alert')).not.toBeVisible()
})

// Case 18: a wrong reset code is rejected (Cognito's CodeMismatchException); the account's
// password is unchanged and the user is not signed in.
test('wrong reset code is rejected and the password is unchanged', async ({ page }) => {
  const account = freshTestAccount()
  await createConfirmedTestAccount(account)

  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill(account.email)
  await page.getByRole('button', { name: 'Send code' }).click()
  await expect(page.getByLabel('Verification code')).toBeVisible()

  await page.getByLabel('Verification code').fill('000000')
  await page.getByLabel('New password').fill(`${account.password}-reset`)
  await page.getByRole('button', { name: 'Reset password' }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('Sign out')).not.toBeVisible()

  // Strengthening: the original password still works.
  await page.goto('/signin')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
})

// Case 19: the real code together with a too-weak new password is rejected
// (InvalidPasswordException) - needs the *real* code so the only variable under test is password
// strength, not also an invalid code.
test('new password failing the strength rule is rejected', async ({ page }) => {
  const account = freshTestAccount()
  await createConfirmedTestAccount(account)

  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill(account.email)
  await page.getByRole('button', { name: 'Send code' }).click()
  await expect(page.getByLabel('Verification code')).toBeVisible()

  const code = await waitForVerificationCode(account.email)
  await page.getByLabel('Verification code').fill(code)
  await page.getByLabel('New password').fill('short1')
  await page.getByRole('button', { name: 'Reset password' }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('Sign out')).not.toBeVisible()
})

// Case 20: sign-in <-> forgot-password cross-links - purely navigation, no real Cognito
// interaction needed.
test('sign-in and forgot-password link to each other', async ({ page }) => {
  await page.goto('/signin')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible()

  // Scoped to the main content, not an unqualified getByRole('link', { name: 'Sign in' }) - while
  // signed out, Layout.tsx's own sidebar (MenuContent) always renders its own "Sign in" nav link
  // too, alongside this page's "Remembered it? Sign in" link, so an unscoped query matches both -
  // confirmed against a real run ("strict mode violation ... resolved to 2 elements"). Box
  // component="main" in Layout.tsx gives the page content its own "main" landmark to scope to.
  await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
})
