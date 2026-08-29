import { expect, test } from '@playwright/test'
import { uniqueTestEmail } from '../../support/email'

// mootmaker/docs/reference/use-cases.md, section B (Sign in / sign out), cases 7-15. See
// acceptance/test-cases/b-sign-in-sign-out.md for the full Given/When/Then/Steps/Assertions this
// file was generated from.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

const demoEmail = requireEnv('DEMO_USER_EMAIL')
const demoPassword = requireEnv('DEMO_USER_PASSWORD')

// B.7 - sign in with correct credentials from /signin lands back on "/" (no RequireAuth redirect
// was in play, since /signin was reached directly).
test('B.7: sign in with correct credentials from /signin', async ({ page }) => {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText('Sign out')).toBeVisible()
  await expect(page).toHaveURL('/')
})

// B.8 - the SignInForm embedded on the signed-out home page signs in with a client-side content
// swap, not a full navigation - same URL ("/") before and after.
test('B.8: sign in via the embedded form on the signed-out home page', async ({ page }) => {
  await page.goto('/')

  const tryItNow = page
    .getByRole('heading', { name: 'Try it now — no account needed' })
    .locator('..')
  await tryItNow.getByLabel('Email').fill(demoEmail)
  await tryItNow.getByLabel('Password').fill(demoPassword)
  await tryItNow.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText('Sign out')).toBeVisible()
  // Add Meeting is a MUI Button rendered as component={Link} - a real <a>, so its accessible role
  // is "link", not "button".
  await expect(page.getByRole('link', { name: 'Add Meeting' })).toBeVisible()
  await expect(page).toHaveURL('/')
})

// B.9 - a valid email with the wrong password shows an error and leaves the visitor signed out.
test('B.9: wrong password shows an error, does not sign in', async ({ page }) => {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill('definitely-the-wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('Sign out')).not.toBeVisible()
  await expect(page).toHaveURL('/signin')
})

// B.10 - an email with no account at all should error the same way as a wrong password, per
// use-cases.md's own "check whether it distinguishes 'no such user'" framing. If this ever finds
// the two messages differ, that's a real finding against mootmaker-api's Cognito pool's
// prevent_user_existence_errors setting, not a bug in this test (see the catalog's Notes on B.10).
test('B.10: unknown email shows the same error as a wrong password', async ({ page }) => {
  const unknownEmail = uniqueTestEmail()

  await page.goto('/signin')
  await page.getByLabel('Email').fill(unknownEmail)
  await page.getByLabel('Password').fill('whatever-password-123')
  await page.getByRole('button', { name: 'Sign in' }).click()

  const unknownEmailError = await page.getByRole('alert').innerText()
  await expect(page.getByText('Sign out')).not.toBeVisible()

  // Repeat B.9 (wrong password, known-good email) in the same test to capture its message too.
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill('definitely-the-wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  const wrongPasswordError = await page.getByRole('alert').innerText()
  await expect(page.getByText('Sign out')).not.toBeVisible()

  expect(unknownEmailError).toEqual(wrongPasswordError)
})

// B.11 - the demo user's credentials are shown as plain text on the signed-out home page AND
// pre-fill the embedded form, so signing in needs zero typing. Reads the displayed values off the
// rendered page (not this process's own DEMO_USER_EMAIL/PASSWORD env vars) so the test actually
// proves the pre-fill works end to end, rather than just that two copies of the same env var match.
test('B.11: sign in via the demo user credentials pre-filled on the home page', async ({ page }) => {
  await page.goto('/')

  const tryItNow = page
    .getByRole('heading', { name: 'Try it now — no account needed' })
    .locator('..')

  const displayedEmail = await tryItNow.getByText(demoEmail, { exact: true }).innerText()
  const displayedPassword = await tryItNow.getByText(demoPassword, { exact: true }).innerText()
  expect(displayedEmail).toEqual(demoEmail)
  expect(displayedPassword).toEqual(demoPassword)

  const emailField = tryItNow.getByLabel('Email')
  const passwordField = tryItNow.getByLabel('Password')
  await expect(emailField).toHaveValue(demoEmail)
  await expect(passwordField).toHaveValue(demoPassword)

  // Zero typing - just click Sign in with the pre-filled values as-is.
  await tryItNow.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByText('Sign out')).toBeVisible()
  await expect(page.getByText('Demo Strater')).toBeVisible()
})

// B.12 - a hard reload (not a client-side route change) must still show the session as signed in,
// proving persistence actually comes from localStorage rather than in-memory auth state.
test('B.12: session persists across a page reload', async ({ page }) => {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()

  await page.goto('/settings')
  await expect(page.getByLabel('Name')).toBeVisible()

  await page.reload()

  await expect(page).toHaveURL('/settings')
  await expect(page.getByText('Sign out')).toBeVisible()
  await expect(page.getByLabel('Name')).not.toHaveValue('')
})

// B.13 - signing out immediately flips the nav to signed-out state, and a fresh navigation to a
// protected route afterward redirects to /signin instead of loading.
test('B.13: sign out clears the session and locks the app down again', async ({ page }) => {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(page.getByText('Sign out')).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()

  await page.goto('/settings')
  await expect(page).toHaveURL('/signin')
})

// B.14 - RequireAuth remembers the original destination via location state, and SignInPage reads
// it back to navigate there (not "/") once sign-in succeeds.
test('B.14: protected route redirects to sign-in and returns you after signing in', async ({ page }) => {
  await page.goto('/settings')
  await expect(page).toHaveURL('/signin')

  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL('/settings')
  await expect(page.getByText('Sign out')).toBeVisible()
})

// B.15 - every public route loads its own content directly while signed out, with no redirect to
// /signin. A single test iterating all five is fine here: each iteration is an independent
// goto + heading check with no shared mutable state (see the catalog's Notes on B.15).
test('B.15: public pages work while signed out, with no redirect', async ({ page }) => {
  const publicRoutes: Array<{ path: string; heading: string }> = [
    { path: '/', heading: 'Welcome to Mootmaker' },
    { path: '/signin', heading: 'Sign In' },
    { path: '/signup', heading: 'Sign Up' },
    { path: '/forgot-password', heading: 'Reset Password' },
    { path: '/about', heading: 'About' },
  ]

  for (const { path, heading } of publicRoutes) {
    await page.goto(path)
    await expect(page).toHaveURL(path)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
  }
})
