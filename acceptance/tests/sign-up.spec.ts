import { expect, test } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { waitForVerificationCode } from '../../support/email'
import { freshTestAccount } from '../../support/testAccount'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

// mootmaker/docs/reference/use-cases.md, section A (Sign up), case 1 - plus a touch of case 5. Unlike
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

  // Case 5 (sidebar half): the linked Person's name is also visible in the sidebar's account row
  // (AccountBox), not just readable back from Settings - checked here, before navigating away,
  // while it's the only element on the page carrying this exact text.
  await expect(page.getByText(account.name, { exact: true })).toBeVisible()

  // Case 5 (Settings half): the linked Person was auto-created with the name actually entered,
  // not left blank or defaulted from the email address.
  await page.goto('/settings')
  await expect(page.getByLabel('Name')).toHaveValue(account.name)

  // Case 5 (standard class): a freshly signed-up account is `standard`, not `admin` - no
  // admin-only sections (Rooms, People) are rendered on Settings for it.
  await expect(page.getByRole('heading', { name: 'Rooms' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'People' })).toHaveCount(0)
})

// Case 2: no client-side password-strength check exists in SignUpPage.tsx (the helper text is a
// hint only, see this catalog entry's Notes) - a too-short password is submitted for real and
// rejected by Cognito itself, never reaching the verification-code step.
test('password below the minimum strength is rejected before the account is created', async ({
  page,
}) => {
  const account = freshTestAccount()

  await page.goto('/signup')
  await page.getByLabel('Name').fill(account.name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill('short1')
  await page.getByRole('button', { name: 'Sign up' }).click()

  // Cognito's own InvalidPasswordException message - content isn't this app's copy, so only
  // presence is asserted.
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Verification code')).not.toBeVisible()
  await expect(page).toHaveURL(/\/signup$/)
})

// Case 3: signing up again with an email that already has a confirmed account is rejected by
// Cognito's UsernameExistsException, never reaching the verification-code step.
test('signing up with an email that already has an account is rejected', async ({ page }) => {
  const existingAccount = freshTestAccount()
  await createConfirmedTestAccount(existingAccount)

  await page.goto('/signup')
  await page.getByLabel('Name').fill('Someone Else')
  await page.getByLabel('Email').fill(existingAccount.email)
  await page.getByLabel('Password').fill(freshTestAccount().password)
  await page.getByRole('button', { name: 'Sign up' }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Verification code')).not.toBeVisible()
})

// Case 4: a wrong verification code is rejected (Cognito's CodeMismatchException) and the user
// stays on the confirm step; the real code afterward still succeeds.
test('wrong verification code is rejected; correct code afterward still succeeds', async ({
  page,
}) => {
  const account = freshTestAccount()

  await page.goto('/signup')
  await page.getByLabel('Name').fill(account.name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByLabel('Verification code')).toBeVisible()

  // Fetched up front - waitForVerificationCode's long-poll adds real latency, so this avoids
  // stacking that wait after an already-rejected wrong attempt.
  const code = await waitForVerificationCode(account.email)

  const wrongDigit = code.at(-1) === '9' ? '0' : String(Number(code.at(-1)) + 1)
  const wrongCode = code.slice(0, -1) + wrongDigit

  await page.getByLabel('Verification code').fill(wrongCode)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('Sign out')).not.toBeVisible()
  await expect(page.getByLabel('Verification code')).toBeVisible()

  await page.getByLabel('Verification code').fill('')
  await page.getByLabel('Verification code').fill(code)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
})

// Case 6: a freshly signed-up user can go straight to Add Meeting without visiting Settings
// first, and the Organiser field is already defaulted to their own Person. Needs an existing room
// (created by the demo user first, since a freshly signed-up standard user can't create one).
test('can immediately schedule a meeting as themselves right after signing up', async ({
  page,
}) => {
  const demoEmail = requireEnv('DEMO_USER_EMAIL')
  const demoPassword = requireEnv('DEMO_USER_PASSWORD')
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const roomName = `Acceptance Test Room A6 ${runId}`
  const subject = `Acceptance test meeting A6 ${runId}`

  // Precondition: a room to book, created by the demo user (admin). A freshly signed-up standard
  // user can't create rooms themselves (Settings' Rooms section is admin-only).
  await page.goto('/signin')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add room' }).click()
  const addRoomDialog = page.getByRole('dialog')
  await addRoomDialog.getByLabel('Name').fill(roomName)
  await addRoomDialog.getByLabel('Capacity').fill('4')
  await addRoomDialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(roomName)).toBeVisible()

  await page.getByText('Sign out').click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

  // The actual use case: sign up fresh, then go straight to Add Meeting.
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
  await expect(page.getByText('Sign out')).toBeVisible()

  // AddMeetingPage's start-time default (next 15-minute boundary from now) needs to land inside
  // RoomAvailabilityPage's business-hours grid (08:00-17:00) for the meeting to be visibly
  // asserted afterward - same reasoning as add-meeting.spec.ts.
  await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))

  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()

  // Organiser is already pre-filled with the freshly-signed-up user's own name, before any
  // interaction with that field.
  await expect(page.getByRole('combobox', { name: 'Organiser' })).toHaveValue(account.name)

  await page.getByLabel('Subject').fill(subject)
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: roomName, exact: false }).click()
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
  await expect(page.getByText('Meeting was successfully scheduled.')).toBeVisible()
  await expect(page.getByText(subject)).toBeVisible()

  // Organiser is this user, not blank - checked on the Meeting Details page reached from the
  // grid.
  await page.getByText(subject).click()
  await expect(page.getByText(account.name)).toBeVisible()
})
