import { expect, test, type Locator, type Page } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount, type TestAccount } from '../../support/testAccount'

// N.100/N.101/N.103/N.104 read a real meeting URL off addMeeting's Share button - see that
// function's own comment. Forces the clipboard-fallback branch deterministically rather than
// depending on this browser's navigator.share support - see designs/
// meeting-detail-consolidation.md's Testing impacts. Harmless for the other cases here, which
// don't create meetings.
test.beforeEach(async ({ page, context }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
})

/**
 * Credentials for the account that deliberately has NO linked Person.
 *
 * A separate account from the e2e user, which used to have no Person only by accident: it is
 * created directly rather than through sign-up, so PostConfirmationCreatePersonHandler never ran.
 * Giving it one was right - the whole suite had been running as a degraded identity - but it left
 * the degraded path itself with no fixture, and these tests with no premise. See
 * mootmaker-api's cognito.tf and mootmaker-webapp#54.
 *
 * Skips rather than fails where the account does not exist. It is not created in production, where
 * a personless account would not be a fixture but a real person's broken login.
 */
function noPersonCredentials(): { email: string; password: string } {
  const email = process.env.NO_PERSON_USER_EMAIL
  const password = process.env.NO_PERSON_USER_PASSWORD
  test.skip(
    !email || !password,
    'This environment has no personless account (deliberately absent in production).',
  )
  return { email: email as string, password: password as string }
}


// mootmaker/docs/reference/use-cases.md, section N (Settings - Date and time format), cases
// 100-105. See test-cases/n-date-time-format-settings.md for the full designs.
//
// Every case here uses a freshly signed-up account rather than the demo user. Changing the demo
// user's format would change how *every other spec in this suite* reads dates and times back -
// the same hazard I.74 avoids for renames, but much wider, since almost every spec asserts on a
// date or a time somewhere. A fresh account starts at the defaults (Iso + TwentyFourHour), which
// is exactly the "before" state these cases need.

// The visible option labels are worked examples rather than format names, because the example is
// the thing being chosen (see SettingsPage). Naming them here keeps the intent readable.
const DATE_OPTION = {
  iso: '2026-08-24',
  british: '24/08/2026',
  usa: '08/24/2026',
} as const
const TIME_OPTION = { twentyFourHour: '14:30', amPm: '02:30 PM' } as const


async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
}

async function signInAsFreshAccount(page: Page): Promise<TestAccount> {
  const account = freshTestAccount()
  await createConfirmedTestAccount(account)
  await signIn(page, account.email, account.password)
  return account
}

async function setFormats(page: Page, options: { date?: string; time?: string }): Promise<void> {
  await page.goto('/settings')
  if (options.date) {
    await page.getByLabel('Date format').click()
    await page.getByRole('option', { name: options.date, exact: true }).click()
  }
  if (options.time) {
    await page.getByLabel('Time format').click()
    await page.getByRole('option', { name: options.time, exact: true }).click()
  }
  // The "Date and time format" section's own Save - the page has several.
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Date and time format' }) })
    .getByRole('button', { name: 'Save' })
    .click()
  await expect(page.getByText('Your date and time formats were updated.')).toBeVisible()
}

// These tests sign in as fresh standard accounts, which cannot create rooms (that section is
// admin-only), and a deployed environment's rooms have generated names - so no room name is safe
// to hardcode. An earlier version used 'Boardroom' from the webapp's MSW mock fixtures, which
// exists only in the mocked integration layer and never in a real deployment.
//
// Business hours (08:00-17:00) are exactly the range sample-data fills, so no time slot is free by
// construction either. Rather than gamble on one room being idle, book into whichever room accepts:
// each room gets only 0-2 generated meetings a day, so a free one is found almost immediately.
// Returns the room's plain name, not the option's full accessible label - AddMeetingPage's Room
// Autocomplete renders each option as "<name> (capacity <capacity>)" (getOptionLabel), but
// RoomAvailabilityPage's own card shows just the plain name.
async function selectRoomByIndex(page: Page, index: number): Promise<string> {
  await page.getByRole('combobox', { name: 'Room' }).click()
  const option = page.getByRole('option').nth(index)
  const label = (await option.textContent()) ?? ''
  const roomName = label.replace(/\s*\(capacity \d+\)\s*$/, '')
  await option.click()
  return roomName
}

// Navigates first: this is called before any attempt, so the Add Meeting form is not open yet.
async function roomCount(page: Page): Promise<number> {
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Room' }).click()
  const count = await page.getByRole('option').count()
  await page.keyboard.press('Escape')
  return count
}

// Books into a weekday well beyond the 6-week window mootmaker-demo-data fills, so the chosen room
// is actually free. An earlier version left the Date field at its default (today) and booked the
// same slot in the same room from every test, which collided both with the generated sample data
// and with the other tests here - the form rejected it with "The room already has a meeting
// scheduled during that time range."
function weekdayDaysAhead(days: number): { year: number; month: number; day: number } {
  const d = new Date()
  d.setDate(d.getDate() + days)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1)
  }
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

// The Date field's sections are ordered by the viewer's own format, so the digits have to be typed
// in that order and typing has to start at whichever section comes first.
async function typeDate(
  page: Page,
  date: { year: number; month: number; day: number },
  dateFormat: 'Iso' | 'British' | 'Usa',
): Promise<void> {
  const yyyy = String(date.year)
  const mm = String(date.month).padStart(2, '0')
  const dd = String(date.day).padStart(2, '0')
  const order = {
    Iso: { first: 'Year', digits: `${yyyy}${mm}${dd}` },
    British: { first: 'Day', digits: `${dd}${mm}${yyyy}` },
    Usa: { first: 'Month', digits: `${mm}${dd}${yyyy}` },
  }[dateFormat]
  const group = page.getByRole('group', { name: 'Date' })
  await group.getByRole('spinbutton', { name: order.first }).click()
  await page.keyboard.type(order.digits)
  // Verify the field actually took what was typed, BEFORE anything depends on it. These sections
  // auto-advance as digits arrive, so the whole date is typed as one stream into whichever section
  // comes first - and if focus moves mid-stream, trailing digits land in the wrong section and
  // produce a DIFFERENT BUT VALID date. The form then saves happily and the test fails much later
  // asserting on rendered output, which points at the date-formatting feature rather than at input.
  //
  // Seen for real: expected 21/09/2026, got 26/09/2026 - and 26 is the last two digits of 2026.
  // See issue #38.
  const rendered = { Iso: `${yyyy}-${mm}-${dd}`, British: `${dd}/${mm}/${yyyy}`, Usa: `${mm}/${dd}/${yyyy}` }[
    dateFormat
  ]
  await expect(group).toHaveText(new RegExp(rendered.replace(/[/-]/g, (c) => `\\${c}`)))
}

// Books a meeting through the real Add Meeting form, typing into the pickers the way the viewer's
// own format renders them. `hour24`/`minute` are the wall-clock time meant, regardless of format:
// under AmPm the field has a Meridiem section and takes the 12-hour hour plus an AM/PM keystroke,
// under TwentyFourHour it has neither and takes the hour as-is.
interface Fixture {
  subject: string
  hour24: number
  minute: number
  endHour24: number
  date: { year: number; month: number; day: number }
}

interface Format {
  amPm: boolean
  dateFormat: 'Iso' | 'British' | 'Usa'
}

/** Returns the room's plain name on success (see selectRoomByIndex), or null if this slot was rejected. */
async function fillAndSave(page: Page, fixture: Fixture, format: Format, roomIndex: number): Promise<string | null> {
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
  await page.getByLabel('Subject').fill(fixture.subject)
  const roomName = await selectRoomByIndex(page, roomIndex)
  await typeDate(page, fixture.date, format.dateFormat)
  await typeTime(page, 'Start time', fixture.hour24, fixture.minute, format.amPm)
  await typeTime(page, 'End time', fixture.endHour24, fixture.minute, format.amPm)
  await page.getByRole('button', { name: 'Save' }).click()

  // Either the form navigates away (created) or it stays put with an error banner - most likely
  // "The room already has a meeting scheduled during that time range."
  await Promise.race([
    page.waitForURL(/\/rooms\/.+\/availability/, { timeout: 15_000 }).catch(() => undefined),
    page
      .getByRole('alert')
      .waitFor({ timeout: 15_000 })
      .catch(() => undefined),
  ])
  return /\/rooms\/.+\/availability/.test(page.url()) ? roomName : null
}

/**
 * Books the meeting, trying each room in turn, and returns the created meeting's real Share URL.
 * Requires the caller to have set up navigator.share/clipboard first - see this file's beforeEach.
 */
async function addMeeting(page: Page, fixture: Fixture, format: Format): Promise<string> {
  const rooms = await roomCount(page)
  for (let i = 0; i < rooms; i++) {
    const roomName = await fillAndSave(page, fixture, format, i)
    if (roomName !== null) {
      // The meeting only renders once its room's card is expanded (RoomAvailabilityPage.tsx's
      // "See <day>'s meetings" Collapse toggle). Not a plain getByText(subject): the card's own
      // status sublabel can independently reference this meeting's subject too (see
      // roomAvailabilityLogic.ts) - only the meeting row itself has role 'button'.
      const roomCard = page
        .getByText(roomName, { exact: true })
        .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
      await roomCard.getByRole('button', { name: /'s meetings/ }).click()
      // Opens the shared detail sheet/panel in place, not a navigation any more - see
      // designs/meeting-detail-consolidation.md. Its real Share button is the only source of a
      // usable /meetings/:id URL now.
      await roomCard.getByRole('button', { name: fixture.subject, exact: false }).click()
      await page.getByRole('button', { name: 'Share meeting' }).click()
      const url = await page.evaluate(() => navigator.clipboard.readText())
      if (!/\/meetings\/[^/]+$/.test(url)) {
        throw new Error(`Could not extract a meeting URL from the shared URL: ${url}`)
      }
      // Scoped via the Share button's own sibling, not a page-wide role query - the clipboard-
  // fallback confirmation toast (SuccessToast/MUI Alert) also renders its own "Close" button
  // with the identical accessible name, and a page-wide query resolves to both ambiguously.
  await page
    .getByRole('button', { name: 'Share meeting' })
    .locator('xpath=following-sibling::button[1]')
    .click()
      return url
    }
  }
  throw new Error(`Could not find a free room for ${fixture.subject} across ${rooms} room(s)`)
}

async function typeTime(page: Page, groupName: string, hour24: number, minute: number, amPm: boolean): Promise<void> {
  const group = page.getByRole('group', { name: groupName })
  await group.getByRole('spinbutton', { name: 'Hours' }).click()
  if (amPm) {
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
    await page.keyboard.type(`${String(hour12).padStart(2, '0')}${String(minute).padStart(2, '0')}`)
    await page.keyboard.type(hour24 < 12 ? 'AM' : 'PM')
  } else {
    await page.keyboard.type(`${String(hour24).padStart(2, '0')}${String(minute).padStart(2, '0')}`)
  }
}

// The same two renderings the app produces, restated so each assertion derives from the time
// actually booked rather than a literal that goes stale when the booking moves - which is exactly
// what happened when N.103's slot was shifted to fit inside business hours.
function asAmPm(hour24: number, minute: number): string {
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}`
}

function asTwentyFourHour(hour24: number, minute: number): string {
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// The availability route takes an ISO date regardless of anyone's display preference - it is a
// URL parameter, not something shown to a human.
function isoToday(): string {
  return isoDate(new Date())
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Locates the meeting detail sheet/full-page's date or time value by its own shape, not by a
 * label - unlike the old full-page DetailRow layout, MeetingDetailContent (see designs/
 * meeting-detail-consolidation.md) renders the date and time as plain, unlabelled lines, matching
 * the sheet/panel it's shared with. Each regex covers every format this file switches between
 * (Iso/British/Usa dates render the same digit-slash shape for British and Usa; 24-hour/AM-PM
 * times), so the same call still resolves to exactly one live element regardless of which format
 * is active when it's called - the surrounding assertions narrow down the exact expected value.
 */
function detailRow(page: Page, kind: 'Date' | 'Time') {
  return kind === 'Date'
    ? page.getByText(/^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$/)
    : page.getByText(/^\d{2}:\d{2}(?: [AP]M)?–\d{2}:\d{2}(?: [AP]M)?$/)
}

test('N.100: changing your date format switches every date shown to you, and persists across a reload', async ({
  page,
}) => {
  await signInAsFreshAccount(page)
  const subject = `N100 ${Date.now()}`
  const meetingUrl = await addMeeting(
    page,
    { subject, hour24: 9, minute: 0, endHour24: 10, date: weekdayDaysAhead(70) },
    { amPm: false, dateFormat: 'Iso' },
  )

  await page.goto(meetingUrl)
  await expect(detailRow(page, 'Date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/)

  await setFormats(page, { date: DATE_OPTION.british })

  await page.goto(meetingUrl)
  await expect(detailRow(page, 'Date')).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/)

  // Persisted server-side, not just held in component state.
  await page.reload()
  await expect(detailRow(page, 'Date')).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/)
})

test('N.101: changing your time format switches every time shown to you, and persists across a reload', async ({
  page,
}) => {
  await signInAsFreshAccount(page)
  const subject = `N101 ${Date.now()}`
  // Deliberately an afternoon time: a morning one renders the same in both formats apart from the
  // marker, so a substring assertion could pass by accident.
  const meetingUrl = await addMeeting(
    page,
    { subject, hour24: 14, minute: 30, endHour24: 15, date: weekdayDaysAhead(72) },
    { amPm: false, dateFormat: 'Iso' },
  )

  await page.goto(meetingUrl)
  await expect(detailRow(page, 'Time')).toContainText('14:30')

  await setFormats(page, { time: TIME_OPTION.amPm })

  await page.goto(meetingUrl)
  await expect(detailRow(page, 'Time')).toContainText('02:30 PM')
  await expect(detailRow(page, 'Time')).not.toContainText('14:30')

  await page.reload()
  await expect(detailRow(page, 'Time')).toContainText('02:30 PM')
})

test('N.102: both formats save together in one action, with a success message', async ({ page }) => {
  await signInAsFreshAccount(page)

  await setFormats(page, { date: DATE_OPTION.usa, time: TIME_OPTION.amPm })

  // Navigating away and back proves both survived one Save - the mutation replaces the pair, so
  // "saved one, lost the other" is the specific regression this guards.
  await page.goto('/')
  await page.goto('/settings')
  await expect(page.getByLabel('Date format')).toHaveText(DATE_OPTION.usa)
  await expect(page.getByLabel('Time format')).toHaveText(TIME_OPTION.amPm)
})

test("N.103/N.104: a meeting booked in one viewer's format is the same instant for a viewer on another", async ({
  page,
}) => {
  // Account A books in USA + AM/PM by typing in that format; account B, on the defaults, must see
  // the very same instant written ISO/24-hour. This is the load-bearing case for the whole
  // design: the format is applied at the presentation edge only, never to what is stored.
  await signInAsFreshAccount(page)
  await setFormats(page, { date: DATE_OPTION.usa, time: TIME_OPTION.amPm })

  const subject = `N103 ${Date.now()}`
  const startHour = 15
  const startMinute = 30
  const meetingUrl = await addMeeting(
    page,
    { subject, hour24: startHour, minute: startMinute, endHour24: 16, date: weekdayDaysAhead(74) },
    { amPm: true, dateFormat: 'Usa' },
  )

  await page.goto(meetingUrl)
  await expect(detailRow(page, 'Date')).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/)
  await expect(detailRow(page, 'Time')).toContainText(asAmPm(startHour, startMinute))
  const usaDate = await detailRow(page, 'Date').textContent()

  // A second, default-format account viewing the same meeting.
  await page.getByText('Sign out').click()
  await signInAsFreshAccount(page)
  await page.goto(meetingUrl)

  await expect(detailRow(page, 'Date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/)
  await expect(detailRow(page, 'Time')).toContainText(asTwentyFourHour(startHour, startMinute))

  // Same instant, written two ways: B's ISO date must be A's USA date reordered.
  const [month, day, year] = (usaDate ?? '').split('/')
  await expect(detailRow(page, 'Date')).toHaveText(`${year}-${month}-${day}`)
})

test('N.105: an account with no linked Person sees the section disabled with an explanation', async ({ page }) => {
  // The personless account - the same one I.76 uses for the equivalent "Your name" case.
  const noPerson = noPersonCredentials()
  await signIn(page, noPerson.email, noPerson.password)
  await page.goto('/settings')

  await expect(page.getByLabel('Date format')).toBeDisabled()
  await expect(page.getByLabel('Time format')).toBeDisabled()
  await expect(page.getByText("Your account has no linked person yet, so these can't be changed here.")).toBeVisible()

  // A missing preference must never mean a missing date: the defaults still apply for display.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
})

test("N.106: a meeting's time in Room Availability's expanded list follows the time format", async ({ page }) => {
  // Room Availability's redesign (designs/room-availability-and-person-calendar-redesign.md)
  // replaced the old fixed-hour grid - and with it, the hour axis and "Showing business hours"
  // caption this case used to check without needing a meeting at all - with room-status cards.
  // There's no longer a plain, data-independent time rendering to check, so this books a real
  // meeting and reads its time back out of the card's expanded meeting list instead.
  await signInAsFreshAccount(page)
  const subject = `N106 ${Date.now()}`
  const date = weekdayDaysAhead(76)
  const rooms = await roomCount(page)
  let bookedRoomName: string | null = null
  for (let i = 0; i < rooms && bookedRoomName === null; i++) {
    bookedRoomName = await fillAndSave(page, { subject, hour24: 9, minute: 0, endHour24: 10, date }, { amPm: false, dateFormat: 'Iso' }, i)
  }
  if (bookedRoomName === null) {
    throw new Error(`Could not find a free room for ${subject} across ${rooms} room(s)`)
  }

  const isoUrlDate = isoDate(new Date(date.year, date.month - 1, date.day))

  // The meeting only renders once its room's card is expanded (RoomAvailabilityPage.tsx's "See
  // <day>'s meetings" Collapse toggle).
  function roomCard(): Locator {
    return page
      .getByText(bookedRoomName as string, { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
  }

  await page.goto(`/rooms/${isoUrlDate}/availability`)
  await roomCard().getByRole('button', { name: /'s meetings/ }).click()
  await expect(roomCard().getByRole('button', { name: subject, exact: false })).toContainText('09:00')

  await setFormats(page, { time: TIME_OPTION.amPm })
  await page.goto(`/rooms/${isoUrlDate}/availability`)
  await roomCard().getByRole('button', { name: /'s meetings/ }).click()
  await expect(roomCard().getByRole('button', { name: subject, exact: false })).toContainText('09:00 AM')
})
