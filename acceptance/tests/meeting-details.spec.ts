import { expect, type Page, test } from '@playwright/test'

// mootmaker/use-cases.md, section H (Meeting Details), cases 68-73. All sign in as the demo user
// (a real, pre-verified, always-admin Cognito account with a linked Person already resolved - see
// acceptance/README.md's "Which account to sign in as") except where a case is specifically about
// what an unauthenticated-relationship user sees, which is still the demo user, just with other
// Persons standing in for the organiser/attendee roles instead.
//
// MeetingDetailsPage fetches the *entire* unfiltered LIST_MEETINGS query and finds the matching id
// client-side (see MeetingDetailsPage.tsx) - there's no per-caller filtering at the API level, which
// is exactly what H.69/H.70 are testing for.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

// A fixed Monday, safely inside business hours (08:00-17:00) and clear of any weekend-sensitive
// UI quirks - see acceptance/README.md's "Known gaps" note on clock pinning and
// webapp/tests/meeting-details.spec.ts's own equivalent fix for the same class of problem.
// Pinning exactly to the meeting's intended start time means AddMeetingPage's own defaults
// (next-15-minute-boundary start, start+1h end) land exactly on 10:00-11:00 with no need to touch
// either time picker.
const PINNED_NOW = new Date('2026-08-24T10:00:00')
const MEETING_DATE = '2026-08-24'

async function signInAsDemo(page: Page) {
  const demoEmail = requireEnv('DEMO_USER_EMAIL')
  const demoPassword = requireEnv('DEMO_USER_PASSWORD')
  await page.goto('/signin')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
}

async function createRoom(page: Page, name: string, capacity: string) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add room' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Capacity').fill(capacity)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

async function createPerson(page: Page, name: string) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add person' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

interface MeetingFormOptions {
  subject: string
  roomName: string
  /** Leaves the Organiser field on its default (the signed-in user) when omitted. */
  organiserName?: string
  attendeeNames?: string[]
}

/**
 * Submits the Add Meeting form and returns the meeting id from the room-availability URL it
 * redirects to on success. Assumes the clock is already pinned (see PINNED_NOW) so the Date/Start
 * time/End time fields can all be left on their defaults.
 */
async function createMeetingViaForm(page: Page, options: MeetingFormOptions): Promise<string> {
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()

  await page.getByLabel('Subject').fill(options.subject)

  if (options.organiserName) {
    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await page.getByRole('option', { name: options.organiserName, exact: true }).click()
  }

  for (const attendeeName of options.attendeeNames ?? []) {
    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await page.getByRole('option', { name: attendeeName, exact: true }).click()
    await page.keyboard.press('Escape')
  }

  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: options.roomName, exact: false }).click()
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
  await expect(page.getByText('Meeting was successfully scheduled.')).toBeVisible()

  // Find the newly created meeting's id by following its own block back from the schedule.
  await page.getByText(options.subject).click()
  await expect(page).toHaveURL(/\/meetings\/.+/)
  const url = page.url()
  const match = url.match(/\/meetings\/([^/?#]+)/)
  if (!match) {
    throw new Error(`Could not extract a meeting id from ${url}`)
  }
  return match[1]
}

test.describe('H. Meeting Details', () => {
  test('H.68: viewing details of a meeting you organise shows every field correctly', async ({ page }) => {
    const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
    const roomName = `H68 Room ${runId}`
    const attendeeName = `H68 Attendee ${runId}`
    const subject = `H68 meeting ${runId}`

    await page.clock.setFixedTime(PINNED_NOW)
    await signInAsDemo(page)
    await createRoom(page, roomName, '4')
    await createPerson(page, attendeeName)

    // Organiser omitted - defaults to the signed-in demo user's own Person ("Demo Strater").
    const meetingId = await createMeetingViaForm(page, {
      subject,
      roomName,
      attendeeNames: [attendeeName],
    })

    await page.goto(`/meetings/${meetingId}`)

    await expect(page.getByRole('heading', { name: subject })).toBeVisible()
    await expect(page.getByText(`${roomName} (capacity 4)`)).toBeVisible()
    await expect(page.getByText('Organiser', { exact: true }).locator('..').getByText('Demo Strater')).toBeVisible()
    await expect(page.getByText('Attendees', { exact: true }).locator('..').getByText(attendeeName)).toBeVisible()
  })

  test('H.69: viewing details of a meeting you attend but did not organise shows the other person as organiser and yourself as an attendee', async ({
    page,
  }) => {
    const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
    const roomName = `H69 Room ${runId}`
    const organiserName = `H69 Organiser ${runId}`
    const subject = `H69 meeting ${runId}`

    await page.clock.setFixedTime(PINNED_NOW)
    await signInAsDemo(page)
    await createRoom(page, roomName, '4')
    await createPerson(page, organiserName)

    // Explicitly picking a different organiser overrides the default-to-self behaviour; the demo
    // user is then added as an attendee instead.
    const meetingId = await createMeetingViaForm(page, {
      subject,
      roomName,
      organiserName,
      attendeeNames: ['Demo Strater'],
    })

    await page.goto(`/meetings/${meetingId}`)

    // Page loads with no access error (proving attendee-only access works) - the full details are
    // visible, with the other person as organiser and the signed-in user among the attendees.
    await expect(page.getByRole('heading', { name: subject })).toBeVisible()
    await expect(page.getByText('Organiser', { exact: true }).locator('..').getByText(organiserName)).toBeVisible()
    await expect(page.getByText('Attendees', { exact: true }).locator('..').getByText('Demo Strater')).toBeVisible()
  })

  test('H.70: viewing details of a meeting you are neither organiser nor attendee of still loads full details', async ({
    page,
  }) => {
    const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
    const roomName = `H70 Room ${runId}`
    const thirdPartyA = `H70 Third Party A ${runId}`
    const thirdPartyB = `H70 Third Party B ${runId}`
    const subject = `H70 meeting ${runId}`

    await page.clock.setFixedTime(PINNED_NOW)
    await signInAsDemo(page)
    await createRoom(page, roomName, '4')
    await createPerson(page, thirdPartyA)
    await createPerson(page, thirdPartyB)

    // The demo (admin) user submits this on behalf of two other Persons, ending up neither
    // organiser nor attendee of the resulting meeting themselves.
    const meetingId = await createMeetingViaForm(page, {
      subject,
      roomName,
      organiserName: thirdPartyA,
      attendeeNames: [thirdPartyB],
    })

    await page.goto(`/meetings/${meetingId}`)

    // Loads successfully with correct data - not an access-denied state - documenting the
    // current, unrestricted behaviour (see this case's Notes in h-meeting-details.md; this test
    // does not decide whether that *should* be the case).
    await expect(page.getByRole('heading', { name: subject })).toBeVisible()
    await expect(page.getByText('Organiser', { exact: true }).locator('..').getByText(thirdPartyA)).toBeVisible()
    await expect(page.getByText('Attendees', { exact: true }).locator('..').getByText(thirdPartyB)).toBeVisible()
  })

  test('H.71: date is shown once and time as a start-end range, never two full date-times', async ({ page }) => {
    const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
    const roomName = `H71 Room ${runId}`
    const subject = `H71 meeting ${runId}`

    // PINNED_NOW is exactly 2026-08-24T10:00:00, which is already on a 15-minute boundary, so
    // AddMeetingPage's defaults land on Date=2026-08-24, Start=10:00, End=11:00 without touching
    // any of those three fields.
    await page.clock.setFixedTime(PINNED_NOW)
    await signInAsDemo(page)
    await createRoom(page, roomName, '4')

    const meetingId = await createMeetingViaForm(page, { subject, roomName })

    await page.goto(`/meetings/${meetingId}`)
    await expect(page.getByRole('heading', { name: subject })).toBeVisible()

    // formatLocalDate is a raw YYYY-MM-DD string slice, not a locale-aware formatter - assert the
    // literal value rather than a "nice" human date (see formatDateTime.ts and this case's Notes).
    const dateRow = page.getByText('Date', { exact: true }).locator('..')
    await expect(dateRow.getByText(MEETING_DATE, { exact: true })).toBeVisible()

    // formatLocalTime's template literal joins start/end with an en dash (see
    // MeetingDetailsPage.tsx's Time DetailRow) - use the literal character, not a hyphen.
    const timeRow = page.getByText('Time', { exact: true }).locator('..')
    await expect(timeRow.getByText('10:00–11:00', { exact: true })).toBeVisible()

    // Regression check: no full ISO date-time string (e.g. containing "T") appears anywhere
    // *visible* on the page - the old two-full-date-times layout this replaced would fail this.
    // Uses innerText() rather than toContainText's default textContent()-based matching: the
    // latter also picks up hidden nodes (e.g. Apollo's cache state embedded in a <script> tag),
    // which aren't a UI regression even though they do legitimately contain the raw ISO string.
    const visibleText = await page.locator('body').innerText()
    expect(visibleText).not.toContain(`${MEETING_DATE}T`)
  })

  test('H.72: Back returns to whichever page the user actually came from', async ({ page }) => {
    const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
    const roomName = `H72 Room ${runId}`
    const subject = `H72 meeting ${runId}`

    await page.clock.setFixedTime(PINNED_NOW)
    await signInAsDemo(page)
    await createRoom(page, roomName, '4')
    await createMeetingViaForm(page, { subject, roomName })

    // Entry point 1: Room Availability.
    await page.goto(`/rooms/${MEETING_DATE}/availability`)
    await page.getByText(subject).click()
    await expect(page).toHaveURL(/\/meetings\/.+/)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page).toHaveURL(new RegExp(`/rooms/${MEETING_DATE}/availability`))

    // Entry point 2: Home's "Today" agenda list (the meeting's date is the pinned "today").
    await page.goto('/')
    await page.getByRole('heading', { name: 'Today' }).locator('..').getByText(subject).click()
    await expect(page).toHaveURL(/\/meetings\/.+/)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page).toHaveURL(`${new URL(page.url()).origin}/`)
  })

  test('H.73: navigating directly to a nonexistent meeting id shows "Meeting not found." rather than crashing', async ({
    page,
  }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (error) => pageErrors.push(error))

    await signInAsDemo(page)
    await page.goto('/meetings/not-a-real-id-12345')

    await expect(page.getByText('Meeting not found.')).toBeVisible()
    expect(pageErrors).toEqual([])
  })
})
