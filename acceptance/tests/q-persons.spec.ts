import { expect, test, type Page } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount } from '../../support/testAccount'
import { formatDateParam, pinnedWeekday } from './support/pinnedDates'

const PINNED_NOW = pinnedWeekday('Wednesday')

// mootmaker/docs/reference/use-cases.md, section Q (Persons, admin only), cases 132-141. See
// acceptance/test-cases/q-persons.md for the full per-case Given/When/Then/Steps/Assertions this
// file implements one at a time. Supersedes section K (k-settings-people.md /
// settings-people.spec.ts) now that People has moved out of Settings to its own top-level Persons
// page - see the admin-rooms-and-people design doc. Every case except Q.132 (standard user) signs
// in as the demo user. A standard user forcing renamePerson/setPersonAdmin/deletePerson directly
// is covered once, comprehensively, by L.90 rather than repeated here.

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

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

/** The Persons page's card for a given person name. */
function personCard(page: Page, name: string) {
  return page
    .getByText(name, { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
}

/** Creates a guest person (no Cognito account) via the real Persons page. */
async function createPerson(page: Page, name: string) {
  await page.goto('/persons')
  await page.getByRole('button', { name: 'Add person' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

interface CreateMeetingOptions {
  subject: string
  roomName: string
  organiserName?: string
  attendeeNames?: string[]
}

async function createMeeting(page: Page, { subject, roomName, organiserName, attendeeNames = [] }: CreateMeetingOptions): Promise<void> {
  await page.goto('/meetings/add')
  await page.getByLabel('Subject').fill(subject)
  if (organiserName) {
    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await page.getByRole('option', { name: organiserName, exact: true }).click()
  }
  for (const attendeeName of attendeeNames) {
    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await page.getByRole('option', { name: attendeeName, exact: true }).click()
    await page.keyboard.press('Escape')
  }
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: roomName, exact: false }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
}

async function createRoom(page: Page, name: string, capacity: string) {
  await page.goto('/rooms')
  await page.getByRole('button', { name: 'Add room' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Capacity').fill(capacity)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

test.describe('Q. Persons (admin only)', () => {
  test('Q.132 - standard user has no Persons nav link and cannot reach the page directly', async ({ page }) => {
    await signIn(page, requireEnv('E2E_USER_EMAIL'), requireEnv('E2E_USER_PASSWORD'))
    await expect(page.getByRole('link', { name: 'Persons' })).toHaveCount(0)

    await page.goto('/persons')
    await expect(page).toHaveURL('/')
  })

  test('Q.133 - admin adds a guest person; usable as organiser/attendee/calendar subject', async ({ page }) => {
    const runId = uniqueId()
    const personName = `Q133 Guest ${runId}`

    await signInAsDemo(page)
    await createPerson(page, personName)

    await page.goto('/meetings/add')
    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await expect(page.getByRole('option', { name: personName, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await expect(page.getByRole('option', { name: personName, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('link', { name: 'Calendar', exact: true }).click()
    await expect(page).toHaveURL(/\/persons\/.+\/calendar/)
    await page.getByRole('combobox', { name: 'Person' }).click()
    await expect(page.getByRole('option', { name: personName, exact: true })).toBeVisible()
  })

  test('Q.134 - blank person name is rejected', async ({ page }) => {
    await signInAsDemo(page)
    await page.goto('/persons')
    await page.getByRole('button', { name: 'Add person' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByText('Name must not be blank.')).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  test('Q.135 - admin renames a Cognito-linked person: propagates to their sidebar and meetings', async ({ page }) => {
    const runId = uniqueId()
    const account = { ...freshTestAccount(), name: `Q135 Person ${runId}` }
    await createConfirmedTestAccount(account)

    const roomName = `Q135 Room ${runId}`
    const subject = `Q135 Meeting ${runId}`
    const newName = `Q135 Renamed ${runId}`
    await page.clock.setFixedTime(PINNED_NOW)

    await signInAsDemo(page)
    await createRoom(page, roomName, '4')
    await createMeeting(page, { subject, roomName, attendeeNames: [account.name] })

    await page.goto('/persons')
    await page.getByLabel(`Edit ${account.name}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(personCard(page, newName)).toBeVisible()

    await signOut(page)
    await signIn(page, account.email, account.password)
    await expect(page.getByText(newName)).toBeVisible()
  })

  test('Q.136 - admin renames a person with no Cognito account', async ({ page }) => {
    const runId = uniqueId()
    const guestName = `Q136 Guest ${runId}`
    const newName = `Q136 Guest Renamed ${runId}`

    await signInAsDemo(page)
    await createPerson(page, guestName)

    await page.getByLabel(`Edit ${guestName}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(personCard(page, newName)).toBeVisible()
  })

  test('Q.137 - cards show the admin badge and linked email; a guest shows "Not signed up yet"', async ({ page }) => {
    const runId = uniqueId()
    const account = { ...freshTestAccount(), name: `Q137 Linked ${runId}` }
    await createConfirmedTestAccount(account)
    const guestName = `Q137 Guest ${runId}`

    await signInAsDemo(page)
    await createPerson(page, guestName)
    await page.goto('/persons')

    await expect(personCard(page, account.name).getByText(account.email)).toBeVisible()
    await expect(personCard(page, guestName).getByText('Not signed up yet')).toBeVisible()

    const demoEmail = requireEnv('DEMO_USER_EMAIL')
    await expect(personCard(page, 'Demo User').getByText('Admin')).toBeVisible()
    await expect(personCard(page, 'Demo User').getByText(demoEmail)).toBeVisible()
  })

  test('Q.138 - admin grants admin access to a person with a linked account', async ({ page }) => {
    const runId = uniqueId()
    const account = { ...freshTestAccount(), name: `Q138 Person ${runId}` }
    await createConfirmedTestAccount(account)

    await signInAsDemo(page)
    await page.goto('/persons')
    await page.getByLabel(`Edit ${account.name}`).click()
    const dialog = page.getByRole('dialog')
    const adminSwitch = dialog.getByRole('switch', { name: 'Admin' })
    await expect(adminSwitch).toBeEnabled()
    await adminSwitch.check()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    await expect(personCard(page, account.name).getByText('Admin')).toBeVisible()

    // The grant actually took effect on their token, not just the Persons list - the real proof
    // this isn't just a DynamoDB-side badge (see the design doc's cognitoSyncFailed reasoning).
    await signOut(page)
    await signIn(page, account.email, account.password)
    await expect(page.getByRole('link', { name: 'Rooms' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Persons' })).toBeVisible()
  })

  test('Q.139 - the admin switch is disabled with an explanation for a person with no linked account', async ({ page }) => {
    const runId = uniqueId()
    const guestName = `Q139 Guest ${runId}`

    await signInAsDemo(page)
    await createPerson(page, guestName)
    await page.getByLabel(`Edit ${guestName}`).click()
    const dialog = page.getByRole('dialog')

    await expect(dialog.getByRole('switch', { name: 'Admin' })).toBeDisabled()
    await expect(dialog.getByText("hasn't signed in yet")).toBeVisible()
  })

  test('Q.140 - the admin switch is disabled for the signed-in admin\'s own person', async ({ page }) => {
    await signInAsDemo(page)
    await page.goto('/persons')
    await page.getByLabel('Edit Demo User').click()
    const dialog = page.getByRole('dialog')

    await expect(dialog.getByRole('switch', { name: 'Admin' })).toBeDisabled()
    await expect(dialog.getByText("can't change your own admin access")).toBeVisible()
  })

  test('Q.141 - admin deletes a person: their organised meeting is cancelled, they are removed from one they only attend', async ({ page, context }) => {
    const runId = uniqueId()
    const targetName = `Q141 Person ${runId}`
    const otherAttendeeName = `Q141 Other ${runId}`
    const roomName = `Q141 Room ${runId}`
    const organisedSubject = `Q141 Organised ${runId}`
    const attendedSubject = `Q141 Attended ${runId}`
    await page.clock.setFixedTime(PINNED_NOW)
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
    })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    await signInAsDemo(page)
    await createRoom(page, roomName, '4')
    await createPerson(page, targetName)
    await createPerson(page, otherAttendeeName)
    // Target organises one meeting (demo user as an attendee, so it's still visible/queryable
    // afterward), and only attends a second one the demo user organises.
    await createMeeting(page, { subject: organisedSubject, roomName, organiserName: targetName })
    await createMeeting(page, { subject: attendedSubject, roomName, attendeeNames: [targetName, otherAttendeeName] })

    await page.goto('/persons')
    await page.getByLabel(`Remove ${targetName}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Remove person' }).click()
    await expect(page.getByText(targetName)).toHaveCount(0)

    // The meeting they organised is cancelled - gone from Room Availability entirely.
    await page.goto(`/rooms/${formatDateParam(PINNED_NOW)}/availability`)
    await expect(page.getByText(organisedSubject)).toHaveCount(0)

    // The meeting they only attended is untouched apart from their own removal - still bookable,
    // still shows the other attendee.
    const card = page
      .getByText(roomName, { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
    await card.getByRole('button', { name: /'s meetings/ }).click()
    await card.getByRole('button', { name: attendedSubject, exact: false }).click()
    await expect(page.getByText(otherAttendeeName, { exact: false })).toBeVisible()
  })

  test('Q.142 - an admin cannot delete their own person this way', async ({ page }) => {
    await signInAsDemo(page)
    await page.goto('/persons')
    await page.getByLabel('Remove Demo User').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Remove person' }).click()

    await expect(dialog.getByText('use Delete account in Settings instead')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(personCard(page, 'Demo User')).toBeVisible()
  })
})
