import { expect, test, type Locator, type Page } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount } from '../../support/testAccount'

// A second, parameterized run of a small number of scenarios that already pass under the default
// format, this time under an account deliberately set to British + AM/PM.
//
// Why not just flip the shared demo user instead? That would turn the *entire* existing suite into
// non-default coverage for free, but only by rewriting every hardcoded date/time assertion across
// dozens of files to compute its expectation from a configured format - real migration work, and
// it would leave the project's actual default as the one path the main test account never
// exercises. Three scenarios re-run deliberately buy most of the confidence for a fraction of it.
//
// One scenario is taken from each of the three views that render a date or a time differently:
// Meeting Details (both a date row and a time row), Person Calendar (a time-only range), and Room
// Availability (a time-only range in an expanded card's meeting row). Between them they cover
// every call site of formatLocalDate and formatLocalTime in the app.
//
// Expectations are *computed* from the format rather than hardcoded, which is the whole point: a
// literal would prove only that this file agrees with itself.

const BRITISH_OPTION = '24/08/2026'
const AM_PM_OPTION = '02:30 PM'

/** The same two formatters the app uses, restated here so a bug in one can't hide itself. */
function expectedBritishDate(year: number, month: number, day: number): string {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

function expectedAmPmTime(hour24: number, minute: number): string {
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const meridiem = hour24 < 12 ? 'AM' : 'PM'
  return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${meridiem}`
}

async function signInAsNonDefaultAccount(page: Page): Promise<void> {
  const account = freshTestAccount()
  await createConfirmedTestAccount(account)
  await page.goto('/signin')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()

  await page.goto('/settings')
  await page.getByLabel('Date format').click()
  await page.getByRole('option', { name: BRITISH_OPTION, exact: true }).click()
  await page.getByLabel('Time format').click()
  await page.getByRole('option', { name: AM_PM_OPTION, exact: true }).click()
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Date and time format' }) })
    .getByRole('button', { name: 'Save' })
    .click()
  await expect(page.getByText('Your date and time formats were updated.')).toBeVisible()
}

// A deployed environment's rooms have generated names, and business hours (08:00-17:00) are
// exactly the range sample-data fills, so neither a room name nor a free slot can be hardcoded.
// Book into whichever room accepts: each room gets only 0-2 generated meetings a day.
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

function weekdayDaysAhead(days: number): { year: number; month: number; day: number } {
  const d = new Date()
  d.setDate(d.getDate() + days)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1)
  }
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

// The account is on British, so the Date field's sections run Day, Month, Year.
async function typeBritishDate(page: Page, date: { year: number; month: number; day: number }): Promise<void> {
  const digits = `${String(date.day).padStart(2, '0')}${String(date.month).padStart(2, '0')}${date.year}`
  const group = page.getByRole('group', { name: 'Date' })
  await group.getByRole('spinbutton', { name: 'Day' }).click()
  await page.keyboard.type(digits)
  // Verify the field actually took what was typed, BEFORE anything depends on it. These sections
  // auto-advance as digits arrive, so the whole date is typed as one stream into whichever section
  // comes first - and if focus moves mid-stream, trailing digits land in the wrong section and
  // produce a DIFFERENT BUT VALID date. The form then saves happily and the test fails much later
  // asserting on rendered output, which points at the date-formatting feature rather than at input.
  //
  // Seen for real: expected 21/09/2026, got 26/09/2026 - and 26 is the last two digits of 2026.
  // See issue #38.
  await expect(group).toHaveText(
    new RegExp(expectedBritishDate(date.year, date.month, date.day).replace(/\//g, '\\/')),
  )
}

// The account is on AM/PM, so the time field has a Meridiem section and takes the 12-hour hour
// plus an AM/PM keystroke.
async function typeAmPmTime(page: Page, groupName: string, hour24: number, minute: number): Promise<void> {
  const group = page.getByRole('group', { name: groupName })
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  await group.getByRole('spinbutton', { name: 'Hours' }).click()
  await page.keyboard.type(`${String(hour12).padStart(2, '0')}${String(minute).padStart(2, '0')}`)
  await page.keyboard.type(hour24 < 12 ? 'AM' : 'PM')
}

/** Returns the room's plain name on success (see selectRoomByIndex), or null if this slot was rejected. */
async function trySave(
  page: Page,
  subject: string,
  date: { year: number; month: number; day: number },
  roomIndex: number,
): Promise<string | null> {
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
  await page.getByLabel('Subject').fill(subject)
  const roomName = await selectRoomByIndex(page, roomIndex)
  await typeBritishDate(page, date)
  await typeAmPmTime(page, 'Start time', 14, 30)
  await typeAmPmTime(page, 'End time', 15, 30)
  await page.getByRole('button', { name: 'Save' }).click()
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
 * Books a 14:30-15:30 meeting, trying each room in turn. Leaves the page on Room Availability,
 * with the booked room's own card expanded - the meeting only renders once its card is expanded
 * (RoomAvailabilityPage.tsx's "See <day>'s meetings" Collapse toggle) - and returns that card so
 * callers can keep scoping further checks to it.
 */
async function addAfternoonMeeting(
  page: Page,
  subject: string,
  date: { year: number; month: number; day: number },
): Promise<Locator> {
  const rooms = await roomCount(page)
  for (let i = 0; i < rooms; i++) {
    const roomName = await trySave(page, subject, date, i)
    if (roomName !== null) {
      // Not a plain getByText(subject): the card's own status sublabel can independently
      // reference this meeting's subject too (see roomAvailabilityLogic.ts) - only the meeting
      // row itself has role 'link'.
      const roomCard = page
        .getByText(roomName, { exact: true })
        .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
      await roomCard.getByRole('button', { name: /'s meetings/ }).click()
      await expect(roomCard.getByRole('link', { name: subject, exact: false })).toBeVisible()
      return roomCard
    }
  }
  throw new Error(`Could not find a free room for ${subject} across ${rooms} room(s)`)
}

function detailRow(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]')
}

test("H.68 under British + AM/PM: Meeting Details renders both rows in the viewer's own format", async ({ page }) => {
  await signInAsNonDefaultAccount(page)
  const subject = `Rerun details ${Date.now()}`
  const date = weekdayDaysAhead(14)
  const roomCard = await addAfternoonMeeting(page, subject, date)

  await roomCard.getByRole('link', { name: subject, exact: false }).click()
  await expect(page).toHaveURL(/\/meetings\/[^/]+$/)

  await expect(detailRow(page, 'Date')).toHaveText(expectedBritishDate(date.year, date.month, date.day))
  await expect(detailRow(page, 'Time')).toContainText(expectedAmPmTime(14, 30))
  await expect(detailRow(page, 'Time')).toContainText(expectedAmPmTime(15, 30))
})

test('G.59 under British + AM/PM: Person Calendar renders its meeting rows in AM/PM', async ({ page }) => {
  await signInAsNonDefaultAccount(page)
  const subject = `Rerun calendar ${Date.now()}`
  const date = weekdayDaysAhead(16)
  await addAfternoonMeeting(page, subject, date)

  await page.getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(page).toHaveURL(/\/persons\/[^/]+\/calendar$/)

  // PersonCalendarPage shows one Monday-Friday week at a time, defaulting to the current week -
  // this fixture's date is well outside it (chosen to avoid colliding with H.68/E.26's own
  // fixtures, which don't need to be calendar-visible), so navigate forward the right number of
  // weeks first. Both weeks are anchored to their own Monday (ISO week start) before differencing,
  // matching PersonCalendarPage.tsx's own startOfWorkWeek() math.
  const mondayOf = (d: Date): Date => {
    const day = d.getDay()
    const diff = day === 0 ? 6 : day - 1
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff)
  }
  const targetDate = new Date(date.year, date.month - 1, date.day)
  const weeksAhead = Math.round((mondayOf(targetDate).getTime() - mondayOf(new Date()).getTime()) / (7 * 86_400_000))
  const nextWeek = page.getByRole('button', { name: 'Next week' })
  for (let i = 0; i < weeksAhead; i++) {
    await nextWeek.click()
  }

  // Not a plain getByText(subject): the meeting row's subject and its time+room caption are two
  // separate sibling Typography elements (PersonCalendarPage.tsx), so a text match on the subject
  // alone wouldn't contain the time. The row itself is a ButtonBase (role 'button'), whose
  // accessible name is its full text content - subject and caption both.
  const row = page.getByRole('button', { name: subject, exact: false })
  await expect(row).toContainText(expectedAmPmTime(14, 30))
  await expect(row).not.toContainText('14:30')
})

test("E.26 under British + AM/PM: Room Availability renders a meeting's time range in AM/PM", async ({ page }) => {
  await signInAsNonDefaultAccount(page)
  const subject = `Rerun availability ${Date.now()}`
  const date = weekdayDaysAhead(18)

  // addAfternoonMeeting lands on the availability page for the meeting's own day, with its room's
  // card already expanded. Same reasoning as room-availability.spec.ts's E.32: only the meeting
  // row itself has role 'link', so this can't accidentally match the card's own status sublabel
  // even where it independently references the same subject.
  const roomCard = await addAfternoonMeeting(page, subject, date)
  const meetingLink = roomCard.getByRole('link', { name: subject, exact: false })
  await expect(meetingLink).toContainText(`${expectedAmPmTime(14, 30)}\u2013${expectedAmPmTime(15, 30)}`)
})
