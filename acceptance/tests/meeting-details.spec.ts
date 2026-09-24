import { expect, type Locator, type Page, test } from '@playwright/test'
import { formatDateParam, pinnedWeekday } from './support/pinnedDates'

// mootmaker/docs/reference/use-cases.md, section H (Meeting Details), cases 68-71, 73-74. All sign
// in as the demo user (a real, pre-verified, always-admin Cognito account with a linked Person
// already resolved - see acceptance/README.md's "Which account to sign in as") except where a case
// is specifically about what an unauthenticated-relationship user sees, which is still the demo
// user, just with other Persons standing in for the organiser/attendee roles instead.
//
// H.72 ("Back returns to whichever page the user actually came from") is GONE, not renumbered
// around - see designs/meeting-detail-consolidation.md. It reached the full page by clicking
// through Room Availability's and Home's meeting rows, but neither navigates to /meetings/:id any
// more - both open the shared sheet/panel in place instead (useMeetingDetailOverlay.tsx). There is
// no longer an in-app-originated navigation into this route for it to exercise. Back's actual
// safety property - it must never navigate somewhere outside the app for a user who arrived via a
// cold link - is covered by H.74 below (real, end-to-end) and by a mocked-integration test in
// webapp/tests/ (client-routing logic, including a tab with unrelated prior history, which isn't
// practical to simulate against a real deployed environment).
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
// Derived from now() rather than hardcoded: this file creates meetings, so a literal date stops
// being bookable the moment the server's retention boundary advances past it, and the failure shows
// up as a missing meeting rather than as a date problem. See support/pinnedDates.ts.
const PINNED_NOW = pinnedWeekday('Monday')
const MEETING_DATE = formatDateParam(PINNED_NOW)

test.beforeEach(async ({ page, context }) => {
  // Forces MeetingDetailContent's Share button down its clipboard-fallback branch
  // deterministically, rather than depending on whether this browser happens to expose
  // navigator.share - see designs/meeting-detail-consolidation.md's Testing impacts. Every test in
  // this file goes through createMeetingViaForm, which relies on this.
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
})

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

interface CreatedMeeting {
  id: string
  /** The real URL MeetingDetailContent's Share button produced for this meeting - see
   * designs/meeting-detail-consolidation.md. H.74 uses this directly, so it exercises exactly what
   * Share hands a real user rather than a hand-reconstructed path. */
  url: string
}

/**
 * Submits the Add Meeting form, then reads the created meeting's real id and Share URL back off
 * the clipboard. Assumes the clock is already pinned (see PINNED_NOW) so the Date/Start time/End
 * time fields can all be left on their defaults.
 */
async function createMeetingViaForm(page: Page, options: MeetingFormOptions): Promise<CreatedMeeting> {
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

  // Open the meeting's own row - it now opens the shared sheet/panel in place rather than
  // navigating (RoomAvailabilityPage.tsx no longer links to /meetings/:id - see
  // designs/meeting-detail-consolidation.md), so its role is 'button', not 'link'. The meeting only
  // renders once its room's card is expanded (RoomAvailabilityPage.tsx's "See <day>'s meetings"
  // Collapse toggle) - confirmed against a real run that a collapsed card's meeting row is absent
  // from role queries entirely, not just visually hidden. Not getByText for the row itself: the
  // card's own status sublabel can independently reference this meeting's subject too (see
  // roomAvailabilityLogic.ts).
  const roomCard = page
    .getByText(options.roomName, { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
  await roomCard.getByRole('button', { name: /'s meetings/ }).click()
  await roomCard.getByRole('button', { name: new RegExp(options.subject) }).click()

  // Reads the real id/URL off the real Share button (MeetingDetailContent.tsx), rather than a
  // navigated-to URL that no longer happens - see this file's beforeEach for why this lands on the
  // clipboard-fallback branch deterministically.
  await page.getByRole('button', { name: 'Share meeting' }).click()
  const url = await page.evaluate(() => navigator.clipboard.readText())
  const match = url.match(/\/meetings\/([^/?#]+)/)
  if (!match) {
    throw new Error(`Could not extract a meeting id from the shared URL: ${url}`)
  }
  // Scoped relative to "Cancel meeting", not a page-wide role query or a bare <main> scope -
  // the "Link copied to clipboard." confirmation this Share click itself just triggered is its
  // own MUI Alert rendered INSIDE the sheet (inside <main> too, unlike the app-wide SuccessToast
  // in Layout.tsx), with its own identically-named "Close" button, so both a page-wide query and
  // a <main>-scoped one resolve to two elements ambiguously (mootmaker-webapp#118's own
  // acceptance run caught this). "Cancel meeting" is unique on the page while the sheet is open,
  // and Close is reliably its next button sibling in the header (Share, Edit - a link, not a
  // button - Cancel meeting, Close - see MeetingDetailContent.tsx), which the clipboard alert's
  // own Close never is.
  await page
    .getByRole('button', { name: 'Cancel meeting' })
    .locator('xpath=following-sibling::button[1]')
    .click()

  return { id: match[1], url }
}

/**
 * Confirms `name` is shown as the organiser specifically, not merely present somewhere on the
 * page. MeetingDetailContent's organiser row now renders identically to an attendee row (plain
 * name, no "· Organiser" suffix - see mootmaker-webapp#73), so a bare-name match can't
 * disambiguate on its own; scoping to the "Organiser" caption's own row does.
 */
async function expectOrganiserIs(scope: Page | Locator, name: string): Promise<void> {
  const organiserRow = scope.getByText('Organiser', { exact: true }).locator('xpath=following-sibling::*[1]')
  await expect(organiserRow.getByText(name, { exact: true })).toBeVisible()
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
    const { id: meetingId } = await createMeetingViaForm(page, {
      subject,
      roomName,
      attendeeNames: [attendeeName],
    })

    await page.goto(`/meetings/${meetingId}`)

    await expect(page.getByRole('heading', { name: subject })).toBeVisible()
    // No capacity shown any more - MeetingDetailContent (shared with the sheet/panel, which never
    // showed it either) renders just the room name, not "<name> (capacity N)". See
    // designs/meeting-detail-consolidation.md's field-order decision.
    await expect(page.getByText(roomName, { exact: true })).toBeVisible()
    // Scoped to <main> - the sidebar also shows the signed-in user's own name ("Demo Strater"),
    // which is the organiser here too, so an unscoped query is ambiguous between the two.
    const main = page.getByRole('main')
    await expectOrganiserIs(main, 'Demo Strater')
    await expect(main.getByText(attendeeName, { exact: true })).toBeVisible()
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
    const { id: meetingId } = await createMeetingViaForm(page, {
      subject,
      roomName,
      organiserName,
      attendeeNames: ['Demo Strater'],
    })

    await page.goto(`/meetings/${meetingId}`)

    // Page loads with no access error (proving attendee-only access works) - the full details are
    // visible, with the other person as organiser and the signed-in user among the attendees.
    await expect(page.getByRole('heading', { name: subject })).toBeVisible()
    // Scoped to <main> - the sidebar also shows the signed-in user's own name ("Demo Strater"),
    // which is an attendee here too, so an unscoped query is ambiguous between the two.
    const main = page.getByRole('main')
    await expectOrganiserIs(main, organiserName)
    await expect(main.getByText('Demo Strater', { exact: true })).toBeVisible()
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
    const { id: meetingId } = await createMeetingViaForm(page, {
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
    await expectOrganiserIs(page, thirdPartyA)
    await expect(page.getByText(thirdPartyB, { exact: true })).toBeVisible()
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

    const { id: meetingId } = await createMeetingViaForm(page, { subject, roomName })

    await page.goto(`/meetings/${meetingId}`)
    await expect(page.getByRole('heading', { name: subject })).toBeVisible()

    // MeetingDetailContent shows the date and the start-end time as plain, unlabelled lines - no
    // "Date"/"Time" label to scope from any more (that was the old full-page-only DetailRow
    // layout). formatLocalDate is a raw YYYY-MM-DD string slice, not a locale-aware formatter -
    // assert the literal value rather than a "nice" human date (see formatDateTime.ts and this
    // case's Notes). formatLocalTime's template literal joins start/end with an en dash - use the
    // literal character, not a hyphen.
    await expect(page.getByText(MEETING_DATE, { exact: true })).toBeVisible()
    await expect(page.getByText('10:00–11:00', { exact: true })).toBeVisible()

    // Regression check: no full ISO date-time string (e.g. containing "T") appears anywhere
    // *visible* on the page - the old two-full-date-times layout this replaced would fail this.
    // Uses innerText() rather than toContainText's default textContent()-based matching: the
    // latter also picks up hidden nodes (e.g. Apollo's cache state embedded in a <script> tag),
    // which aren't a UI regression even though they do legitimately contain the raw ISO string.
    const visibleText = await page.locator('body').innerText()
    expect(visibleText).not.toContain(`${MEETING_DATE}T`)
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

  test('H.74: a signed-out visitor who follows a real shared meeting link goes through a real sign-in and lands on the correct meeting', async ({
    page,
  }) => {
    const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
    const roomName = `H74 Room ${runId}`
    const subject = `H74 meeting ${runId}`

    await page.clock.setFixedTime(PINNED_NOW)
    await signInAsDemo(page)
    await createRoom(page, roomName, '4')
    const { url: meetingUrl } = await createMeetingViaForm(page, { subject, roomName })

    // Sign out, then follow the real link exactly as its recipient would - a signed-out visit to a
    // protected route redirects to /signin (RequireAuth), and a real sign-in returns to it
    // (SignInPage's `from` router state). See designs/meeting-detail-consolidation.md's Testing
    // impacts for why this is the acceptance-layer half of the unsafe-Back fix: a
    // mocked-integration test in webapp/tests/ covers the client-routing logic itself (including a
    // tab with unrelated prior history, not practical to simulate here), this test covers
    // RequireAuth/Cognito/AppSync actually being wired together correctly for a cold link.
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()

    await page.goto(meetingUrl)
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
    await expect(page).toHaveURL(/\/signin/)

    const demoEmail = requireEnv('DEMO_USER_EMAIL')
    const demoPassword = requireEnv('DEMO_USER_PASSWORD')
    await page.getByLabel('Email').fill(demoEmail)
    await page.getByLabel('Password').fill(demoPassword)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(meetingUrl)
    await expect(page.getByRole('heading', { name: subject })).toBeVisible()

    // "Back" must not appear - this page was reached via a real cold link (RequireAuth's redirect,
    // not an in-app navigation carrying fromInApp router state), so an unconditional navigate(-1)
    // here would be exactly the unsafe-Back scenario this design fixed. See
    // MeetingDetailsPage.tsx's own comment on the mechanism.
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
  })
})
