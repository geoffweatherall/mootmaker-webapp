import { expect, test, type Page } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount, type TestAccount } from '../../support/testAccount'

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

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

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
async function selectRoomByIndex(page: Page, index: number): Promise<void> {
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option').nth(index).click()
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

async function fillAndSave(page: Page, fixture: Fixture, format: Format, roomIndex: number): Promise<boolean> {
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
  await page.getByLabel('Subject').fill(fixture.subject)
  await selectRoomByIndex(page, roomIndex)
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
  return /\/rooms\/.+\/availability/.test(page.url())
}

/** Books the meeting, trying each room in turn, and returns the created meeting's details URL. */
async function addMeeting(page: Page, fixture: Fixture, format: Format): Promise<string> {
  const rooms = await roomCount(page)
  for (let i = 0; i < rooms; i++) {
    if (await fillAndSave(page, fixture, format, i)) {
      await page.getByText(fixture.subject, { exact: true }).click()
      await expect(page).toHaveURL(/\/meetings\/[^/]+$/)
      return page.url()
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
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function detailRow(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]')
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
  // The e2e user deliberately has no linked Person - the same account I.76 uses for the
  // equivalent "Your name" case.
  await signIn(page, requireEnv('E2E_USER_EMAIL'), requireEnv('E2E_USER_PASSWORD'))
  await page.goto('/settings')

  await expect(page.getByLabel('Date format')).toBeDisabled()
  await expect(page.getByLabel('Time format')).toBeDisabled()
  await expect(page.getByText("Your account has no linked person yet, so these can't be changed here.")).toBeVisible()

  // A missing preference must never mean a missing date: the defaults still apply for display.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
})

test('N.106: the Room Availability hour axis and business-hours caption follow the time format', async ({ page }) => {
  // These two read plain hour numbers out of the business-hours constants rather than any
  // meeting's data, which is exactly why they were missed on the first pass - they are times
  // shown to a human all the same. No meeting needed: the axis and caption are always rendered.
  await signInAsFreshAccount(page)
  await page.goto(`/rooms/${isoToday()}/availability`)

  await expect(page.getByText('Showing business hours (08:00–17:00).')).toBeVisible()
  await expect(page.getByText('08:00', { exact: true }).first()).toBeVisible()

  await setFormats(page, { time: TIME_OPTION.amPm })
  await page.goto(`/rooms/${isoToday()}/availability`)

  await expect(page.getByText('Showing business hours (08:00 AM–05:00 PM).')).toBeVisible()
  await expect(page.getByText('08:00 AM', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('05:00 PM', { exact: true }).first()).toBeVisible()
})
