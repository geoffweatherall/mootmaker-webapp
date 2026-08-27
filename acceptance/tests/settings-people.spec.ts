import { expect, test, type Page } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount } from '../../support/testAccount'

// mootmaker/use-cases.md, section K (Settings - People, admin only), cases 84-88. See
// acceptance/test-cases/k-settings-people.md for the full per-case Given/When/Then/Steps/Assertions
// this file implements one at a time. Every case except K.84 (standard user) signs in as the demo
// user, matching this catalog's general "which account to sign in as" convention (see
// acceptance/README.md). K.87 additionally needs a real, Cognito-linked standard test account
// (createConfirmedTestAccount) as the Person being renamed, so the "if linked to a Cognito
// account" half of that use case is actually exercised.

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

// Unique per test run (and per concurrently-running agent against this same shared environment),
// same pattern as add-meeting.spec.ts's roomName - real Date.now(), read before any clock pinning
// below, so repeated runs stay unique even against a pinned clock value.
function uniqueId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
}

async function signInAsDemo(page: Page) {
  await signIn(page, requireEnv('DEMO_USER_EMAIL'), requireEnv('DEMO_USER_PASSWORD'))
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
}

/** The Rooms/People list's <li> row for a given name - scopes assertions past collisions with
 * other rooms/people concurrently-running agents may have created in this same shared environment. */
function listRow(page: Page, name: string) {
  return page.getByRole('listitem').filter({ hasText: name })
}

/** Creates a room via the real Settings UI - there's no data-seeding bypass (see README.md). */
async function createRoom(page: Page, name: string, capacity: string) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add room' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Capacity').fill(capacity)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

/** Creates a guest person (no Cognito account) via the real Settings UI. */
async function createPerson(page: Page, name: string) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add person' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

interface CreateMeetingOptions {
  subject: string
  roomName: string
  attendeeNames?: string[]
}

/**
 * Creates a meeting via the real Add Meeting UI (organiser left on its default - the signed-in
 * user's own Person), then clicks through from the Room Availability grid it lands on to that
 * meeting's own Details page, returning its id parsed off the resulting URL. Requires the caller
 * to have pinned the clock inside business hours first (see add-meeting.spec.ts's own comment) -
 * RoomAvailabilityPage only ever renders meetings within that window, so the grid block this
 * clicks through wouldn't exist otherwise.
 */
async function createMeetingAndOpenDetails(page: Page, { subject, roomName, attendeeNames = [] }: CreateMeetingOptions): Promise<string> {
  await page.goto('/meetings/add')
  await page.getByLabel('Subject').fill(subject)
  for (const attendeeName of attendeeNames) {
    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await page.getByRole('option', { name: attendeeName, exact: true }).click()
    await page.keyboard.press('Escape')
  }
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: roomName, exact: false }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
  await expect(page.getByText(subject)).toBeVisible()

  await page.getByText(subject).click()
  await expect(page).toHaveURL(/\/meetings\/.+/)
  const match = page.url().match(/\/meetings\/([^/?#]+)/)
  if (!match) throw new Error(`Could not extract a meeting id from URL ${page.url()}`)
  return match[1]
}

test.describe('K. Settings - People (admin only)', () => {
  test('K.84 - standard user does not see the People section', async ({ page }) => {
    await signIn(page, requireEnv('E2E_USER_EMAIL'), requireEnv('E2E_USER_PASSWORD'))

    await page.goto('/settings')

    // The page rendered at all (proving the absence below isn't just "the page is broken") - same
    // mechanism as J.77 (isAdmin && <PeopleSection />), kept as its own case per this catalog's
    // 1:1 default while tracking both use-case numbers.
    await expect(page.getByRole('heading', { name: 'Your name' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'People' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add person' })).toHaveCount(0)
  })

  test('K.85 - admin adds a guest person; usable as organiser/attendee/calendar subject', async ({ page }) => {
    const runId = uniqueId()
    const personName = `K85 Guest ${runId}`

    await signInAsDemo(page)
    await createPerson(page, personName)

    await page.goto('/meetings/add')
    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await expect(page.getByRole('option', { name: personName, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await expect(page.getByRole('option', { name: personName, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    // Own Calendar's Person selector - navigated via the persistent sidebar link (a real
    // client-side route change, not a fresh page load) so this is genuinely "no reload in
    // between" for this last check.
    await page.getByRole('link', { name: 'Calendar' }).click()
    await expect(page).toHaveURL(/\/persons\/.+\/calendar/)
    await page.getByRole('combobox', { name: 'Person' }).click()
    await expect(page.getByRole('option', { name: personName, exact: true })).toBeVisible()
  })

  test('K.86 - blank person name is rejected', async ({ page }) => {
    await signInAsDemo(page)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Add person' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(dialog.getByText('Name must not be blank.')).toBeVisible()
    // Dialog remains open on failure, not dismissed.
    await expect(dialog).toBeVisible()
  })

  test('K.87 - admin renames a Cognito-linked person: propagates to their sidebar, calendar, and meetings', async ({ page }) => {
    const runId = uniqueId()
    // A real, confirmed standard test account - not a bare admin-created guest - so the "if
    // linked to a Cognito account" half of this use case is actually exercised, not skipped (see
    // this catalog's Notes for why K.88 is the deliberate no-Cognito contrast case instead).
    const account = { ...freshTestAccount(), name: `K87 Person ${runId}` }
    await createConfirmedTestAccount(account)

    const roomName = `K87 Room ${runId}`
    const subject = `K87 Meeting ${runId}`
    const newName = `K87 Renamed ${runId}`
    await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))

    await signInAsDemo(page)
    await createRoom(page, roomName, '4')
    const meetingId = await createMeetingAndOpenDetails(page, { subject, roomName, attendeeNames: [account.name] })

    await page.goto('/settings')
    await page.getByLabel(`Edit ${account.name}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(listRow(page, newName)).toBeVisible()

    await signOut(page)
    await signIn(page, account.email, account.password)

    // AccountBox's sidebar name reflects myPerson (the DynamoDB Person.name, the actual source of
    // truth) immediately - not just other people's view of this account.
    await expect(page.getByText(newName)).toBeVisible()

    await page.goto(`/meetings/${meetingId}`)
    await expect(page.getByText(newName, { exact: false })).toBeVisible()
  })

  test('K.88 - admin renames a person with no Cognito account', async ({ page }) => {
    const runId = uniqueId()
    const guestName = `K88 Guest ${runId}`
    const newName = `K88 Guest Renamed ${runId}`
    const roomName = `K88 Room ${runId}`
    const subject = `K88 Meeting ${runId}`
    await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))

    await signInAsDemo(page)
    await createRoom(page, roomName, '4')
    await createPerson(page, guestName)
    const meetingId = await createMeetingAndOpenDetails(page, { subject, roomName, attendeeNames: [guestName] })

    await page.goto('/settings')
    await page.getByLabel(`Edit ${guestName}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(listRow(page, newName)).toBeVisible()

    await page.goto(`/meetings/${meetingId}`)
    await expect(page.getByText(newName, { exact: false })).toBeVisible()
  })
})
