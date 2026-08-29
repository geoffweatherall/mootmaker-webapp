import { expect, test, type Page } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount } from '../../support/testAccount'

// mootmaker/docs/reference/use-cases.md, section J (Settings - Rooms, admin only), cases 77-83. See
// acceptance/test-cases/j-settings-rooms.md for the full per-case Given/When/Then/Steps/Assertions
// this file implements one at a time. Every case except J.77 (standard user) and J.83 (a fresh
// standard test account, for the direct-mutation half) signs in as the demo user, matching this
// catalog's general "which account to sign in as" convention (see acceptance/README.md).

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

test.describe('J. Settings - Rooms (admin only)', () => {
  test('J.77 - standard user does not see the Rooms section', async ({ page }) => {
    await signIn(page, requireEnv('E2E_USER_EMAIL'), requireEnv('E2E_USER_PASSWORD'))

    await page.goto('/settings')

    // The page rendered at all (proving the absence below isn't just "the page is broken").
    await expect(page.getByRole('heading', { name: 'Your name' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Rooms' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add room' })).toHaveCount(0)
  })

  test('J.78 - admin adds a room; it is immediately usable in Add Meeting and Room Availability', async ({ page }) => {
    const runId = uniqueId()
    const roomName = `J78 Room ${runId}`
    // See add-meeting.spec.ts's identical comment: RoomAvailabilityPage only renders business
    // hours, so this needs pinning to land the check inside that window deterministically.
    await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))

    await signInAsDemo(page)
    await createRoom(page, roomName, '2')
    await expect(listRow(page, roomName).getByText('Capacity 2')).toBeVisible()

    // Selectable in Add Meeting's Room dropdown, no manual refresh needed in between.
    await page.goto('/meetings/add')
    await page.getByRole('combobox', { name: 'Room' }).click()
    await expect(page.getByRole('option', { name: roomName, exact: false })).toBeVisible()
    await page.keyboard.press('Escape')

    // Has its own lane on Room Availability's grid for the pinned (today's) date.
    await page.goto('/rooms/2026-08-19/availability')
    await expect(page.getByText(roomName)).toBeVisible()
  })

  test('J.79 - blank room name is rejected', async ({ page }) => {
    await signInAsDemo(page)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Add room' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Capacity').fill('4')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(dialog.getByText('Name must not be blank.')).toBeVisible()
    // Dialog remains open on failure, not dismissed.
    await expect(dialog).toBeVisible()
  })

  test('J.80 - capacity below 2 is rejected', async ({ page }) => {
    const runId = uniqueId()
    await signInAsDemo(page)
    await page.goto('/settings')

    await page.getByRole('button', { name: 'Add room' }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`J80 Room A ${runId}`)
    await dialog.getByLabel('Capacity').fill('1')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByText('Room capacity must be at least 2.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // Second attempt, reopening the dialog, with capacity 0.
    await page.getByRole('button', { name: 'Add room' }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`J80 Room B ${runId}`)
    await dialog.getByLabel('Capacity').fill('0')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByText('Room capacity must be at least 2.')).toBeVisible()
  })

  test('J.81 - editing a room propagates to its meeting details and Room Availability', async ({ page }) => {
    const runId = uniqueId()
    const originalName = `J81 Room ${runId}`
    const newName = `J81 Room Renamed ${runId}`
    const subject = `J81 Meeting ${runId}`
    await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))

    await signInAsDemo(page)
    await createRoom(page, originalName, '4')
    const meetingId = await createMeetingAndOpenDetails(page, { subject, roomName: originalName })

    await page.goto('/settings')
    await page.getByLabel(`Edit ${originalName}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(listRow(page, newName)).toBeVisible()

    // Meetings aren't denormalised by room name (per the API README's "Storage" section) - this
    // proves that end-to-end through the UI, not just that Settings' own list updated.
    await page.goto(`/meetings/${meetingId}`)
    await expect(page.getByText(newName, { exact: false })).toBeVisible()

    await page.goto('/rooms/2026-08-19/availability')
    await expect(page.getByText(newName)).toBeVisible()
  })

  test('J.82 - reducing a room capacity below an already-booked meeting is allowed', async ({ page }) => {
    const runId = uniqueId()
    const roomName = `J82 Room ${runId}`
    const subject = `J82 Meeting ${runId}`
    const attendee1 = `J82 Attendee A ${runId}`
    const attendee2 = `J82 Attendee B ${runId}`
    await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))

    await signInAsDemo(page)
    await createRoom(page, roomName, '4')
    await createPerson(page, attendee1)
    await createPerson(page, attendee2)
    // 1 organiser (demo, default) + 2 attendees = 3 distinct people, within capacity 4.
    const meetingId = await createMeetingAndOpenDetails(page, { subject, roomName, attendeeNames: [attendee1, attendee2] })

    await page.goto('/settings')
    await page.getByLabel(`Edit ${roomName}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Capacity').fill('2')
    await dialog.getByRole('button', { name: 'Save' }).click()

    // No error; dialog closes; the list reflects the reduced capacity.
    await expect(dialog).toHaveCount(0)
    await expect(listRow(page, roomName).getByText('Capacity 2')).toBeVisible()

    // The existing (now over-capacity) booking is left alone - no retroactive rejection.
    await page.goto(`/meetings/${meetingId}`)
    await expect(page.getByText(subject)).toBeVisible()
    await expect(page.getByText(attendee1, { exact: false })).toBeVisible()
    await expect(page.getByText(attendee2, { exact: false })).toBeVisible()
  })

  test('J.83 - standard user calling createRoom/updateRoom directly is rejected server-side', async ({ page }) => {
    const graphqlUrl = requireEnv('GRAPHQL_API_URL')
    const runId = uniqueId()
    const account = freshTestAccount()
    await createConfirmedTestAccount(account)
    await signIn(page, account.email, account.password)

    // Same technique as F.45's "forced" half: reuse the signed-in browser session's own real
    // Cognito id token straight out of localStorage rather than re-deriving one, then issue raw
    // GraphQL calls that bypass the UI entirely (which wouldn't even show these options to a
    // standard user - see J.77).
    const token = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.endsWith('.idToken'))
      return key ? localStorage.getItem(key) : null
    })
    if (!token) throw new Error('Could not find a Cognito id token in localStorage after signing in.')

    const attemptedRoomName = `J83 Room ${runId}`
    const createResponse = await page.request.post(graphqlUrl, {
      headers: { Authorization: token },
      data: {
        query: 'mutation CreateRoom($room: RoomInput!) { createRoom(room: $room) { room { id } errors } }',
        variables: { room: { name: attemptedRoomName, capacity: 2 } },
      },
    })
    const createBody = await createResponse.json()
    expect(createBody.errors?.length ?? 0).toBeGreaterThan(0)
    expect(createBody.data?.createRoom ?? null).toBeNull()

    // updateRoom needs an existing room id - LIST_ROOMS has no admin restriction (only the
    // mutations do), so the same standard-user token can read the list to find one.
    const listResponse = await page.request.post(graphqlUrl, {
      headers: { Authorization: token },
      data: { query: 'query { rooms { id } }' },
    })
    const listBody = await listResponse.json()
    const existingRoomId: string | undefined = listBody.data?.rooms?.[0]?.id
    if (!existingRoomId) throw new Error('No existing room found in this environment to attempt updateRoom against.')

    const updateResponse = await page.request.post(graphqlUrl, {
      headers: { Authorization: token },
      data: {
        query: 'mutation UpdateRoom($id: ID!, $room: RoomInput!) { updateRoom(id: $id, room: $room) { room { id } errors } }',
        variables: { id: existingRoomId, room: { name: `J83 Updated ${runId}`, capacity: 2 } },
      },
    })
    const updateBody = await updateResponse.json()
    expect(updateBody.errors?.length ?? 0).toBeGreaterThan(0)
    expect(updateBody.data?.updateRoom ?? null).toBeNull()

    // Spot-check: no room was actually created by the rejected createRoom attempt above.
    await signOut(page)
    await signInAsDemo(page)
    await page.goto('/settings')
    await expect(page.getByText(attemptedRoomName)).toHaveCount(0)
  })
})
