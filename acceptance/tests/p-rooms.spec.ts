import { expect, test, type Page } from '@playwright/test'
import { formatDateParam, pinnedWeekday } from './support/pinnedDates'

// A weekday inside business hours, derived from now() rather than hardcoded - a literal date here
// expires the moment the server's retention boundary advances past it. See support/pinnedDates.ts.
const PINNED_NOW = pinnedWeekday('Wednesday')

// mootmaker/docs/reference/use-cases.md, section P (Rooms, admin only), cases 124-131. See
// acceptance/test-cases/p-rooms.md for the full per-case Given/When/Then/Steps/Assertions this
// file implements one at a time. Supersedes section J (j-settings-rooms.md / settings-rooms.spec.ts)
// now that Rooms has moved out of Settings to its own top-level page - see the admin-rooms-and-
// people design doc. Every case except P.124 (standard user) signs in as the demo user, matching
// this catalog's general "which account to sign in as" convention (see acceptance/README.md). A
// standard user forcing createRoom/updateRoom/deleteRoom directly is covered once, comprehensively,
// by L.90 rather than repeated here - see this catalog's established "don't triplicate" convention.

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

/** The Rooms page's card for a given room name - scopes assertions past collisions with other
 * rooms concurrently-running agents may have created in this same shared environment. */
function roomCard(page: Page, name: string) {
  return page
    .getByText(name, { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
}

/** Creates a room via the real Rooms page - there's no data-seeding bypass (see README.md). */
async function createRoom(page: Page, name: string, capacity: string) {
  await page.goto('/rooms')
  await page.getByRole('button', { name: 'Add room' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Capacity').fill(capacity)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

interface CreateMeetingOptions {
  subject: string
  roomName: string
}

/** Same technique as settings-rooms.spec.ts's identical helper - see its own comment for why the
 * id is read off the Share button rather than a navigated-to URL. */
async function createMeetingAndOpenDetails(page: Page, { subject, roomName }: CreateMeetingOptions): Promise<string> {
  await page.goto('/meetings/add')
  await page.getByLabel('Subject').fill(subject)
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: roomName, exact: false }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)

  const card = page
    .getByText(roomName, { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
  await card.getByRole('button', { name: /'s meetings/ }).click()
  await card.getByRole('button', { name: subject, exact: false }).click()
  await page.getByRole('button', { name: 'Share meeting' }).click()
  const url = await page.evaluate(() => navigator.clipboard.readText())
  const match = url.match(/\/meetings\/([^/?#]+)/)
  if (!match) throw new Error(`Could not extract a meeting id from the shared URL: ${url}`)
  await page
    .getByRole('button', { name: 'Share meeting' })
    .locator('xpath=following-sibling::button[1]')
    .click()
  return match[1]
}

test.describe('P. Rooms (admin only)', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
    })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('P.124 - standard user has no Rooms nav link and cannot reach the page directly', async ({ page }) => {
    await signIn(page, requireEnv('E2E_USER_EMAIL'), requireEnv('E2E_USER_PASSWORD'))
    await expect(page.getByRole('link', { name: 'Rooms' })).toHaveCount(0)

    await page.goto('/rooms')
    await expect(page).toHaveURL('/')
  })

  test('P.125 - admin adds a room; it is immediately usable in Add Meeting and Room Availability', async ({ page }) => {
    const runId = uniqueId()
    const roomName = `P125 Room ${runId}`
    await page.clock.setFixedTime(PINNED_NOW)

    await signInAsDemo(page)
    await createRoom(page, roomName, '2')
    await expect(roomCard(page, roomName).getByText('Capacity 2')).toBeVisible()

    await page.goto('/meetings/add')
    await page.getByRole('combobox', { name: 'Room' }).click()
    await expect(page.getByRole('option', { name: roomName, exact: false })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.goto(`/rooms/${formatDateParam(PINNED_NOW)}/availability`)
    await expect(page.getByText(roomName)).toBeVisible()
  })

  test('P.126 - blank room name is rejected', async ({ page }) => {
    await signInAsDemo(page)
    await page.goto('/rooms')
    await page.getByRole('button', { name: 'Add room' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Capacity').fill('4')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(dialog.getByText('Name must not be blank.')).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  test('P.127 - capacity below 2 is rejected', async ({ page }) => {
    const runId = uniqueId()
    await signInAsDemo(page)
    await page.goto('/rooms')

    await page.getByRole('button', { name: 'Add room' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`P127 Room ${runId}`)
    await dialog.getByLabel('Capacity').fill('1')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByText('Room capacity must be at least 2.')).toBeVisible()
  })

  test('P.128 - editing a room propagates to its meeting details and Room Availability', async ({ page }) => {
    const runId = uniqueId()
    const originalName = `P128 Room ${runId}`
    const newName = `P128 Room Renamed ${runId}`
    const subject = `P128 Meeting ${runId}`
    await page.clock.setFixedTime(PINNED_NOW)

    await signInAsDemo(page)
    await createRoom(page, originalName, '4')
    const meetingId = await createMeetingAndOpenDetails(page, { subject, roomName: originalName })

    await page.goto('/rooms')
    await page.getByLabel(`Edit ${originalName}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(roomCard(page, newName)).toBeVisible()

    await page.goto(`/meetings/${meetingId}`)
    await expect(page.getByText(newName, { exact: false })).toBeVisible()

    await page.goto(`/rooms/${formatDateParam(PINNED_NOW)}/availability`)
    await expect(page.getByText(newName)).toBeVisible()
  })

  test('P.129 - reducing a room capacity below an already-booked meeting is allowed', async ({ page }) => {
    const runId = uniqueId()
    const roomName = `P129 Room ${runId}`
    const subject = `P129 Meeting ${runId}`
    await page.clock.setFixedTime(PINNED_NOW)

    await signInAsDemo(page)
    await createRoom(page, roomName, '4')
    const meetingId = await createMeetingAndOpenDetails(page, { subject, roomName })

    await page.goto('/rooms')
    await page.getByLabel(`Edit ${roomName}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Capacity').fill('1')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(dialog).toHaveCount(0)
    await expect(roomCard(page, roomName).getByText('Capacity 1')).toBeVisible()
    await page.goto(`/meetings/${meetingId}`)
    await expect(page.getByText(subject)).toBeVisible()
  })

  test('P.130 - admin deletes a room with no upcoming meetings', async ({ page }) => {
    const runId = uniqueId()
    const roomName = `P130 Room ${runId}`

    await signInAsDemo(page)
    await createRoom(page, roomName, '4')

    await page.getByLabel(`Remove ${roomName}`).click()
    await expect(page.getByRole('heading', { name: `Remove ${roomName}?` })).toBeVisible()
    await page.getByRole('button', { name: 'Remove room' }).click()
    await expect(page.getByText(roomName)).toHaveCount(0)

    // No longer offered in Add Meeting either.
    await page.goto('/meetings/add')
    await page.getByRole('combobox', { name: 'Room' }).click()
    await expect(page.getByRole('option', { name: roomName, exact: false })).toHaveCount(0)
  })

  test('P.131 - deleting a room with an upcoming meeting is rejected', async ({ page }) => {
    const runId = uniqueId()
    const roomName = `P131 Room ${runId}`
    const subject = `P131 Meeting ${runId}`
    await page.clock.setFixedTime(PINNED_NOW)

    await signInAsDemo(page)
    await createRoom(page, roomName, '4')
    await createMeetingAndOpenDetails(page, { subject, roomName })

    await page.goto('/rooms')
    await page.getByLabel(`Remove ${roomName}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Remove room' }).click()

    // Rejected - the room is still there, still usable.
    await expect(dialog.getByText('This room has one or more meetings booked from today onward')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(roomCard(page, roomName)).toBeVisible()
  })
})
