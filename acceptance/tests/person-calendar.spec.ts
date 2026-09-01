import { expect, test, type Page } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount } from '../../support/testAccount'

// mootmaker/docs/reference/use-cases.md, section G (Person Calendar), cases 59-63 and 65-67. Case 64 ("no people
// exist yet") is left unautomated - see g-person-calendar.md's own Notes on that case: every
// environment this project can deploy already has exactly one seeded Person (the demo user's own,
// via mootmaker-api's cognito.tf) before any test runs, so a genuinely empty People table isn't a
// reachable state here.

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

// Precondition helper - no data-seeding bypass for rooms/people, so every test creates its own via
// the real Settings UI (see acceptance/README.md's "Known gaps"), uniquely named per run.
async function createRoom(page: Page, roomName: string) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add room' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(roomName)
  await dialog.getByLabel('Capacity').fill('4')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(roomName)).toBeVisible()
}

async function createPerson(page: Page, name: string) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add person' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}

// Fills one of AddMeetingPage's MUI X time-picker fields (role="group", e.g. "Start time") by
// clicking its "Hours" section then typing all four digits in one go - the sectioned field
// auto-advances between segments as each fills up, e.g. "0900" types out to 09:00.
//
// 24-hour digits, because the default account's time format is TwentyFourHour and the field
// therefore has no Meridiem section to type into.
async function fillTime(page: Page, groupLabel: string, digits: string) {
  const group = page.getByRole('group', { name: groupLabel })
  await group.getByRole('spinbutton', { name: 'Hours' }).click()
  await page.keyboard.type(digits)
}

interface MeetingFixture {
  subject: string
  roomName: string
  start: string
  end: string
}

// Creates a meeting via the real Add Meeting form, leaving the Date field at its default (today,
// per AddMeetingPage's defaultDate()) - every test using this pins page.clock.setFixedTime first
// so "today" is a known, controlled value rather than whenever the suite happened to run.
async function addMeeting(page: Page, fixture: MeetingFixture) {
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
  await page.getByLabel('Subject').fill(fixture.subject)
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: fixture.roomName, exact: false }).click()
  await fillTime(page, 'Start time', fixture.start)
  await fillTime(page, 'End time', fixture.end)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
}

async function goToOwnCalendar(page: Page) {
  // exact: true matters here - a meeting row on this same page can have an accessible name like
  // "Calendar click meeting <id>: 10:00-10:30" (built from a test fixture's own subject text), a
  // non-exact match against 'Calendar' would ambiguously match both that row and this sidebar
  // link, and Playwright's strict mode rejects a click on an ambiguous locator.
  await page.getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(page).toHaveURL(/\/persons\/[^/]+\/calendar$/)
}

test('G.59 - viewing your own calendar by default shows it pre-selected in the Person selector', async ({
  page,
}) => {
  await signInAsDemo(page)
  await goToOwnCalendar(page)

  const url = page.url()
  const demoPersonId = new URL(url).pathname.match(/\/persons\/([^/]+)\/calendar/)?.[1]
  expect(demoPersonId).toBeTruthy()

  await expect(page.getByRole('combobox', { name: 'Person' })).toHaveValue('Demo Strater')
})

test("G.60 - switching the Person selector to someone else's calendar works for both an admin and a standard user", async ({
  page,
}) => {
  const id = uniqueId()
  const aliceName = `Acceptance Alice ${id}`

  // Admin half: the demo user creates Alice, then switches their own calendar view to her.
  await signInAsDemo(page)
  await createPerson(page, aliceName)
  await goToOwnCalendar(page)

  await page.getByRole('combobox', { name: 'Person' }).click()
  await page.getByRole('option', { name: aliceName, exact: true }).click()

  await expect(page).toHaveURL(/\/persons\/[^/]+\/calendar$/)
  await expect(page.getByRole('combobox', { name: 'Person' })).toHaveValue(aliceName)
  const aliceUrl = new URL(page.url())
  const alicePersonId = aliceUrl.pathname.match(/\/persons\/([^/]+)\/calendar/)?.[1]
  expect(alicePersonId).toBeTruthy()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

  // Standard-user half: a freshly signed-up account (no admin rights) can do the exact same
  // switch - see g-person-calendar.md's G.60 Notes: ListMeetingsHandler/ListPeopleHandler only
  // require an authenticated identity, with no self-or-admin restriction, confirmed against
  // source. This test documents that actual, current behaviour rather than deciding whether it
  // should be restricted.
  const standardAccount = freshTestAccount()
  await createConfirmedTestAccount(standardAccount)
  await signIn(page, standardAccount.email, standardAccount.password)
  await goToOwnCalendar(page)

  await page.getByRole('combobox', { name: 'Person' }).click()
  await page.getByRole('option', { name: aliceName, exact: true }).click()

  await expect(page).toHaveURL(`/persons/${alicePersonId}/calendar`)
  await expect(page.getByRole('combobox', { name: 'Person' })).toHaveValue(aliceName)
})

test('G.61 - the six-week grid shows exactly Monday-Friday, 30 day cells total', async ({ page }) => {
  await signInAsDemo(page)
  await goToOwnCalendar(page)

  // The weekday headers are the only subtitle2 (h6) text on this page - each day cell's own date
  // caption is a "caption" variant, not a heading.
  const headers = page.getByRole('heading', { level: 6 })
  await expect(headers).toHaveCount(5)
  await expect(headers).toHaveText(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])

  // Each day cell is a Paper with variant="outlined"; the grid's own outer Paper is default
  // elevation, so this class only ever matches the 30 day cells (6 weeks x 5 work days).
  await expect(page.locator('.MuiPaper-outlined')).toHaveCount(30)
})

test('G.62 - Previous/Next week and This week navigate the visible six-week window', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-26T10:00:00'))
  await signInAsDemo(page)
  await goToOwnCalendar(page)

  // Precomputed directly from PersonCalendarPage's own startOfWorkWeek()/window-length logic for
  // the pinned "now" above (Wed 26 Aug 2026 -> week starts Mon 24 Aug; 6 weeks later ends Fri 2
  // Oct 2026), rather than re-deriving dayjs math at runtime in the test.
  const originalRange = '24 Aug – 2 Oct 2026'
  const threeWeeksForward = '14 Sep – 23 Oct 2026'
  const oneWeekBack = '17 Aug – 25 Sep 2026'

  await expect(page.getByText(originalRange, { exact: true })).toBeVisible()

  const previousWeek = page.getByRole('button', { name: 'Previous week' })
  const nextWeek = page.getByRole('button', { name: 'Next week' })
  const thisWeekButton = page.getByRole('button', { name: 'This week' })
  await expect(thisWeekButton).toBeDisabled()

  await nextWeek.click()
  await nextWeek.click()
  await nextWeek.click()
  await expect(page.getByText(threeWeeksForward, { exact: true })).toBeVisible()
  await expect(thisWeekButton).toBeEnabled()

  await thisWeekButton.click()
  await expect(page.getByText(originalRange, { exact: true })).toBeVisible()
  await expect(thisWeekButton).toBeDisabled()

  await previousWeek.click()
  await expect(page.getByText(oneWeekBack, { exact: true })).toBeVisible()
  await expect(thisWeekButton).toBeEnabled()
})

test('G.63 - a day with three meetings lists them in ascending start-time order; other days show none', async ({
  page,
}) => {
  // Wed 2 Sep 2026 - a work day inside the 6-week window that opens from this pinned "now", with
  // Fri 4 Sep 2026 (same week) used as the "no fixtures placed here" comparison day.
  await page.clock.setFixedTime(new Date('2026-09-02T09:00:00'))
  await signInAsDemo(page)
  const id = uniqueId()
  const roomName = `Sort Test Room ${id}`
  await createRoom(page, roomName)

  // Created out of chronological order (14:00, then 09:00, then 11:00) so a pass here can only be
  // explained by the calendar actually sorting by start time, not by accidentally preserving
  // creation/insertion order.
  await addMeeting(page, {
    subject: `Sort Meeting C ${id}`,
    roomName,
    start: '1400',
    end: '1430',
  })
  await addMeeting(page, {
    subject: `Sort Meeting A ${id}`,
    roomName,
    start: '0900',
    end: '0930',
  })
  await addMeeting(page, {
    subject: `Sort Meeting B ${id}`,
    roomName,
    start: '1100',
    end: '1130',
  })

  await goToOwnCalendar(page)

  const fixtureCell = page
    .locator('.MuiPaper-outlined')
    .filter({ has: page.getByText('2 Sep', { exact: true }) })
  const rows = fixtureCell.locator('a')
  await expect(rows).toHaveCount(3)
  const rowTexts = await rows.allTextContents()
  expect(rowTexts[0]).toContain('09:00')
  expect(rowTexts[0]).toContain(`Sort Meeting A ${id}`)
  expect(rowTexts[1]).toContain('11:00')
  expect(rowTexts[1]).toContain(`Sort Meeting B ${id}`)
  expect(rowTexts[2]).toContain('14:00')
  expect(rowTexts[2]).toContain(`Sort Meeting C ${id}`)

  const unrelatedCell = page
    .locator('.MuiPaper-outlined')
    .filter({ has: page.getByText('4 Sep', { exact: true }) })
  await expect(unrelatedCell.locator('a')).toHaveCount(0)
})

test('G.65 - clicking a meeting row on the calendar navigates to its Meeting Details page', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-09-09T10:00:00'))
  await signInAsDemo(page)
  const id = uniqueId()
  const roomName = `Calendar Click Room ${id}`
  const subject = `Calendar click meeting ${id}`
  await createRoom(page, roomName)
  await addMeeting(page, { subject, roomName, start: '1000', end: '1030' })

  await goToOwnCalendar(page)
  await page.getByText(subject, { exact: false }).click()

  await expect(page).toHaveURL(/\/meetings\/.+/)
  await expect(page.getByRole('heading', { name: subject, level: 1 })).toBeVisible()
})

test("G.66 - the meeting's room colour dot on Person Calendar matches Room Availability's for the same room", async ({
  page,
}) => {
  // Same underlying check as E.35 in e-room-availability.md, initiated from this page instead -
  // see g-person-calendar.md's G.66 Notes. Kept as its own independent fixture rather than a
  // shared helper across the two catalog files/agents, per this section's own scope.
  await page.clock.setFixedTime(new Date('2026-09-16T10:00:00'))
  await signInAsDemo(page)
  const id = uniqueId()
  const roomName = `Colour Match Room ${id}`
  const subject = `Colour match meeting ${id}`
  await createRoom(page, roomName)
  await addMeeting(page, { subject, roomName, start: '1000', end: '1030' })

  await goToOwnCalendar(page)
  const meetingRow = page.locator('a').filter({ hasText: subject })
  const calendarDot = meetingRow.locator('div').first()
  const calendarColor = await calendarDot.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(calendarColor).toBeTruthy()

  await page.goto('/rooms/2026-09-16/availability')
  const roomNameText = page.getByText(roomName, { exact: true })
  const availabilityDot = roomNameText.locator('xpath=preceding-sibling::div[1]')
  const availabilityColor = await availabilityDot.evaluate((el) => getComputedStyle(el).backgroundColor)

  expect(calendarColor).toBe(availabilityColor)
})

test('G.67 - the sidebar\'s Calendar item is disabled, not hidden, for a signed-in user with no linked Person', async ({
  page,
}) => {
  await signIn(page, requireEnv('E2E_USER_EMAIL'), requireEnv('E2E_USER_PASSWORD'))

  // Scoped to the sidebar nav - HomePage separately has its own "Calendar" call-to-action button
  // (also disabled for a no-linked-Person user), which would otherwise make this selector
  // ambiguous.
  const calendarItem = page.locator('nav').getByRole('button', { name: 'Calendar' })
  await expect(calendarItem).toBeVisible()
  await expect(calendarItem).toHaveAttribute('aria-disabled', 'true')
  await expect(calendarItem).toHaveClass(/Mui-disabled/)

  const urlBefore = page.url()
  await calendarItem.click({ timeout: 2_000 }).catch(() => {})
  expect(page.url()).toBe(urlBefore)
})
