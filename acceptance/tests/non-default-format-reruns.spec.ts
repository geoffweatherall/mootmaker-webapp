import { expect, test, type Page } from '@playwright/test'
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
// Availability (a time-only range inside a tooltip). Between them they cover every call site of
// formatLocalDate and formatLocalTime in the app.
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

// Kept inside Person Calendar's own 6-week window, since one of these scenarios reads that page.
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

async function trySave(
  page: Page,
  subject: string,
  date: { year: number; month: number; day: number },
  roomIndex: number,
): Promise<boolean> {
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
  await page.getByLabel('Subject').fill(subject)
  await selectRoomByIndex(page, roomIndex)
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
  return /\/rooms\/.+\/availability/.test(page.url())
}

/** Books a 14:30-15:30 meeting, trying each room in turn. Leaves the page on Room Availability. */
async function addAfternoonMeeting(
  page: Page,
  subject: string,
  date: { year: number; month: number; day: number },
): Promise<void> {
  const rooms = await roomCount(page)
  for (let i = 0; i < rooms; i++) {
    if (await trySave(page, subject, date, i)) {
      await expect(page.getByText(subject, { exact: true })).toBeVisible()
      return
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
  await addAfternoonMeeting(page, subject, date)

  await page.getByText(subject, { exact: true }).click()
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

  const row = page.getByText(subject, { exact: false }).first()
  await expect(row).toContainText(expectedAmPmTime(14, 30))
  await expect(row).not.toContainText('14:30')
})

test('E.26 under British + AM/PM: Room Availability renders its meeting tooltip in AM/PM', async ({ page }) => {
  await signInAsNonDefaultAccount(page)
  const subject = `Rerun availability ${Date.now()}`
  const date = weekdayDaysAhead(18)
  await addAfternoonMeeting(page, subject, date)

  // addAfternoonMeeting lands on the availability page for the meeting's own day.
  //
  // Same locator and aria-label reading as E.32's own case: MUI's Tooltip (describeChild defaults
  // to false) sets aria-label to the whole "<subject>: <start>-<end>" string on the child rather
  // than a native `title`, so the range is readable without triggering a real hover. The subject
  // Typography is the link's own child one DOM hop below, so finding the text and going up is
  // unambiguous regardless of what the tooltip does to the accessible name.
  const block = page.getByText(subject, { exact: true }).locator('xpath=..')
  await expect(block).toHaveAttribute(
    'aria-label',
    `${subject}: ${expectedAmPmTime(14, 30)}\u2013${expectedAmPmTime(15, 30)}`,
  )
})
