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
    .getByRole('heading', { name: 'Date and time format' })
    .locator('xpath=ancestor::*[self::div][1]')
    .getByRole('button', { name: 'Save' })
    .click()
  await expect(page.getByText('Your date and time formats were updated.')).toBeVisible()
}

// Books a meeting through the real Add Meeting form, typing into the pickers the way the viewer's
// own format renders them. `hour24`/`minute` are the wall-clock time meant, regardless of format:
// under AmPm the field has a Meridiem section and takes the 12-hour hour plus an AM/PM keystroke,
// under TwentyFourHour it has neither and takes the hour as-is.
async function addMeeting(
  page: Page,
  fixture: {
    subject: string
    roomName: string
    hour24: number
    minute: number
    endHour24: number
  },
  format: { dateSectionsStartAt: 'Year' | 'Month'; amPm: boolean },
): Promise<void> {
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
  await page.getByLabel('Subject').fill(fixture.subject)
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: fixture.roomName, exact: false }).click()

  await typeTime(page, 'Start time', fixture.hour24, fixture.minute, format.amPm)
  await typeTime(page, 'End time', fixture.endHour24, fixture.minute, format.amPm)

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
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

async function openMeetingDetails(page: Page, subject: string): Promise<void> {
  await page.goto('/')
  await page.getByText(subject, { exact: false }).first().click()
  await expect(page).toHaveURL(/\/meetings\/[^/]+$/)
}

function detailRow(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]')
}

test('N.100: changing your date format switches every date shown to you, and persists across a reload', async ({
  page,
}) => {
  await signInAsFreshAccount(page)
  const subject = `N100 ${Date.now()}`
  await addMeeting(
    page,
    { subject, roomName: 'Boardroom', hour24: 14, minute: 0, endHour24: 15 },
    {
      dateSectionsStartAt: 'Year',
      amPm: false,
    },
  )

  await openMeetingDetails(page, subject)
  await expect(detailRow(page, 'Date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/)

  await setFormats(page, { date: DATE_OPTION.british })

  await openMeetingDetails(page, subject)
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
  await addMeeting(
    page,
    { subject, roomName: 'Boardroom', hour24: 14, minute: 30, endHour24: 15 },
    {
      dateSectionsStartAt: 'Year',
      amPm: false,
    },
  )

  await openMeetingDetails(page, subject)
  await expect(detailRow(page, 'Time')).toContainText('14:30')

  await setFormats(page, { time: TIME_OPTION.amPm })

  await openMeetingDetails(page, subject)
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
  await addMeeting(
    page,
    { subject, roomName: 'Boardroom', hour24: 14, minute: 30, endHour24: 15 },
    {
      dateSectionsStartAt: 'Month',
      amPm: true,
    },
  )

  await openMeetingDetails(page, subject)
  await expect(detailRow(page, 'Date')).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/)
  await expect(detailRow(page, 'Time')).toContainText('02:30 PM')
  const usaDate = await detailRow(page, 'Date').textContent()
  const meetingUrl = page.url()

  // A second, default-format account viewing the same meeting.
  await page.getByText('Sign out').click()
  await signInAsFreshAccount(page)
  await page.goto(meetingUrl)

  await expect(detailRow(page, 'Date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/)
  await expect(detailRow(page, 'Time')).toContainText('14:30')

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
