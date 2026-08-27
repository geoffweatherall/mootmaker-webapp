import { expect, test, type Page } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount } from '../../support/testAccount'

// mootmaker/use-cases.md, section D (Home page), cases 21-25 - see
// acceptance/test-cases/d-home-page.md for the full Given/When/Then design each test below
// translates directly from. Signs in as whichever account each case's own Preconditions call for:
// the demo user (D.22, D.25 - a working, Person-linked, admin account), a freshly signed-up
// account via createConfirmedTestAccount (D.23 - the only way to *guarantee* zero meetings,
// unlike the demo user whose history depends on what else has run against this environment), or
// the e2e user (D.24 - standard, with no linked Person at all). D.21 stays signed out throughout.

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

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
}

async function signInAsDemo(page: Page): Promise<void> {
  await signIn(page, requireEnv('DEMO_USER_EMAIL'), requireEnv('DEMO_USER_PASSWORD'))
}

async function signInAsE2eUser(page: Page): Promise<void> {
  await signIn(page, requireEnv('E2E_USER_EMAIL'), requireEnv('E2E_USER_PASSWORD'))
}

// Precondition helper - no data-seeding bypass for rooms (see README.md's "Known gaps"), so every
// test creates its own via the real Settings UI, uniquely named per run.
async function createRoom(page: Page, name: string, capacity: number): Promise<void> {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add room' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Capacity').fill(String(capacity))
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

// Fills one of AddMeetingPage's MUI X sectioned Time fields (role="group", e.g. "Start time") -
// the same technique person-calendar.spec.ts's fillTime uses, confirmed against the real deployed
// form there: clicking the "Hours" section then typing all digits plus an AM/PM marker in one go
// auto-advances through Hours -> Minutes -> Meridiem, e.g. "0900A" types out to 09:00 AM.
async function fillTime(page: Page, groupLabel: string, digitsAndMeridiem: string): Promise<void> {
  const group = page.getByRole('group', { name: groupLabel })
  await group.getByRole('spinbutton', { name: 'Hours' }).click()
  await page.keyboard.type(digitsAndMeridiem)
}

// Same sectioned-field technique as fillTime above, applied to the Date field's Month/Day/Year
// sections instead of Hours/Minutes/Meridiem - AdapterDayjs's "keyboardDate" format is dayjs's
// "L" token, which defaults to "MM/DD/YYYY" (dayjs's localizedFormat plugin, no adapterLocale
// configured in main.tsx), confirmed by reading dayjs/plugin/localizedFormat's own default before
// relying on it here (matches D.25's catalog Notes, which flagged this as needing confirmation).
// Only needed by D.22's "tomorrow" fixture, to override the form's default (today).
async function setDate(page: Page, date: { month: number; day: number; year: number }): Promise<void> {
  const group = page.getByRole('group', { name: 'Date' })
  await group.getByRole('spinbutton', { name: 'Month' }).click()
  await page.keyboard.type(`${String(date.month).padStart(2, '0')}${String(date.day).padStart(2, '0')}${date.year}`)
}

interface MeetingFixture {
  subject: string
  roomName: string
  start: string
  end: string
  /** Overrides the Date field's default (today) - only needed for a fixture on a different day. */
  date?: { month: number; day: number; year: number }
}

// Creates a meeting via the real Add Meeting form - there's no seeding bypass for meetings any
// more than there is for rooms/people (see README.md). Every test using this pins
// page.clock.setFixedTime first, so "today" (the form's own default date) is a known, controlled
// value rather than whenever the suite happened to run.
async function addMeeting(page: Page, fixture: MeetingFixture): Promise<void> {
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
  await page.getByLabel('Subject').fill(fixture.subject)
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: fixture.roomName, exact: false }).click()
  if (fixture.date) {
    await setDate(page, fixture.date)
  }
  await fillTime(page, 'Start time', fixture.start)
  await fillTime(page, 'End time', fixture.end)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
}

// HomePage's Today/Tomorrow AgendaList panels, each a Paper with its own <h2> title - scoped this
// way (rather than a page-wide query) so a panel's rows/empty-state can be asserted without
// ambiguity between the two panels.
function agendaPanel(page: Page, title: 'Today' | 'Tomorrow') {
  return page.getByRole('heading', { name: title, level: 2 }).locator('xpath=..')
}

// The signed-in Home page has its own "Calendar" call-to-action button, and the sidebar nav has a
// separate "Calendar" item too (see person-calendar.spec.ts's G.67, which scopes the other way -
// to the sidebar's own <nav> - for the exact same reason). Scoping to the <main> landmark here
// keeps assertions about the Home page's own content unambiguous regardless of which role the
// sidebar's item happens to render as at that moment (link once personId resolves, button while
// still loading).
function pageMain(page: Page) {
  return page.getByRole('main')
}

// Mirrors add-meeting.spec.ts's roomFieldIsEmpty: MUI's Select falls back to a zero-width-space
// placeholder rather than genuinely empty text when nothing is selected, so this strips it out
// before comparing.
async function comboboxIsEmpty(page: Page, name: string): Promise<boolean> {
  const text = (await page.getByRole('combobox', { name }).textContent()) ?? ''
  return text.replace(/​/g, '').trim().length === 0
}

test('D.21 - signed-out home page shows the sign-in form pre-filled with demo credentials, the credentials in plain text, and the sign-up steps', async ({
  page,
}) => {
  const demoEmail = requireEnv('DEMO_USER_EMAIL')
  const demoPassword = requireEnv('DEMO_USER_PASSWORD')

  await page.goto('/')

  await expect(page.getByLabel('Email')).toHaveValue(demoEmail)
  await expect(page.getByLabel('Password')).toHaveValue(demoPassword)

  // Also shown as visible plain text elsewhere on the page, not just pre-filled into the form
  // fields - an <input>'s value attribute isn't matched by getByText, so this is a genuinely
  // separate element from the fields just asserted above.
  await expect(page.getByText(demoEmail)).toBeVisible()
  await expect(page.getByText(demoPassword)).toBeVisible()

  // Scoped to <main>: the sidebar nav also has its own "Sign up" link while signed out.
  const homeMain = pageMain(page)
  await expect(homeMain.getByRole('heading', { name: 'Or sign up for your own account' })).toBeVisible()
  const steps = homeMain.locator('ol li')
  await expect(steps).toHaveCount(3)
  await expect(steps.nth(0)).toContainText('Enter your name, email address, and password.')
  await expect(steps.nth(1)).toContainText('Check your email for the verification code')
  await expect(steps.nth(2)).toContainText('Enter the code to confirm your account')
  await expect(homeMain.getByRole('link', { name: 'Sign up' })).toBeVisible()
})

test('D.22 - signed in with a linked Person shows Calendar/Room availability/Add Meeting entry points plus a Today/Tomorrow agenda sorted by start time, each linking to its own meeting details', async ({
  page,
}) => {
  const runId = uniqueId()
  const roomName = `Home Agenda Room ${runId}`
  const subjectToday10 = `D22 today 10am ${runId}`
  const subjectToday14 = `D22 today 2pm ${runId}`
  const subjectTomorrow = `D22 tomorrow ${runId}`

  // A known Tuesday, safely inside business hours, deliberately far from every other pinned date
  // already used elsewhere in this suite (e.g. add-meeting.spec.ts's 2026-08-19/2026-08-24, which
  // each accumulate real persisted demo-user meetings of their own). This test's "Today" panel
  // asserts an exact row count below, which an unrelated fixture meeting landing on the same date
  // for the same signed-in user would throw off.
  await page.clock.setFixedTime(new Date('2027-04-06T09:00:00'))
  await signInAsDemo(page)
  await createRoom(page, roomName, 4)

  // Created out of chronological order (14:00 before 10:00) so a passing sort-order assertion
  // below can only be explained by the Home page actually sorting by start time, not by
  // preserving creation/insertion order (same reasoning as person-calendar.spec.ts's G.63).
  await addMeeting(page, { subject: subjectToday14, roomName, start: '0200P', end: '0230P' })
  await addMeeting(page, { subject: subjectToday10, roomName, start: '1000A', end: '1030A' })
  // Tomorrow relative to the pinned instant above (2027-04-06 -> 2027-04-07).
  await addMeeting(page, {
    subject: subjectTomorrow,
    roomName,
    start: '1000A',
    end: '1030A',
    date: { month: 4, day: 7, year: 2027 },
  })

  await page.goto('/')

  await expect(pageMain(page).getByRole('button', { name: 'Calendar' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Room availability today' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add Meeting' })).toBeVisible()

  const todayRows = agendaPanel(page, 'Today').locator('a')
  await expect(todayRows).toHaveCount(2)
  const todayTexts = await todayRows.allTextContents()
  expect(todayTexts[0]).toContain(subjectToday10)
  expect(todayTexts[0]).toContain('10:00')
  expect(todayTexts[0]).toContain(roomName)
  expect(todayTexts[1]).toContain(subjectToday14)
  expect(todayTexts[1]).toContain('14:00')
  expect(todayTexts[1]).toContain(roomName)

  const tomorrowRows = agendaPanel(page, 'Tomorrow').locator('a')
  await expect(tomorrowRows).toHaveCount(1)
  await expect(tomorrowRows).toContainText(subjectTomorrow)

  // Clicking a row navigates to that specific meeting's own details page - the first Today row is
  // the 10:00 meeting (see the sort-order assertion above).
  await todayRows.first().click()
  await expect(page).toHaveURL(/\/meetings\/.+/)
  await expect(page.getByRole('heading', { name: subjectToday10, level: 1 })).toBeVisible()
})

test('D.23 - no meetings today or tomorrow shows the empty state, not a bare empty list', async ({ page }) => {
  // A freshly signed-up account, not the demo user - the cleanest way to guarantee zero meetings
  // without first needing to query/clear existing ones (see D.23's catalog Notes).
  const account = freshTestAccount()
  await createConfirmedTestAccount(account)
  await signIn(page, account.email, account.password)

  await page.goto('/')

  for (const title of ['Today', 'Tomorrow'] as const) {
    const panel = agendaPanel(page, title)
    await expect(panel.getByText('No meetings.')).toBeVisible()
    await expect(panel.locator('img')).toBeVisible()
  }
})

test('D.24 - no linked Person shows a degraded Home page: the account-not-set-up error replaces Calendar/agenda, but Room availability today and Add Meeting still work with a blank Organiser', async ({
  page,
}) => {
  await signInAsE2eUser(page)
  await page.goto('/')

  await expect(
    page.getByText("Your account hasn't been set up properly — no profile could be found for your sign-in."),
  ).toBeVisible()
  // Scoped to <main>: the sidebar nav still renders its own (disabled) "Calendar" item for a
  // no-linked-Person user (see person-calendar.spec.ts's G.67) - this assertion is specifically
  // about the Home page's own content, which has no Calendar button/agenda at all in this state.
  await expect(pageMain(page).getByRole('button', { name: 'Calendar' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Today', level: 2 })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Tomorrow', level: 2 })).toHaveCount(0)

  const roomAvailabilityButton = page.getByRole('button', { name: 'Room availability today' })
  const addMeetingLink = page.getByRole('link', { name: 'Add Meeting' })
  await expect(roomAvailabilityButton).toBeEnabled()
  await expect(addMeetingLink).toBeVisible()

  await roomAvailabilityButton.click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)

  await page.goto('/')
  await page.getByRole('link', { name: 'Add Meeting' }).click()
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
  // Left blank rather than defaulted - the organiser-defaulting effect in AddMeetingPage.tsx only
  // ever fires once personId resolves, which never happens for this account (see D.24's catalog
  // Notes on why the organiser-default race condition is out of scope here by construction).
  expect(await comboboxIsEmpty(page, 'Organiser')).toBe(true)
})

test('D.25 - "Room availability today" and "Add Meeting" deep-link to the pinned "today" date', async ({ page }) => {
  await signInAsDemo(page)
  // A known Monday, safely inside business hours - the exact pinned instant from D.25's own
  // catalog Steps, so this test's expected URLs/values below can be hardcoded rather than derived.
  await page.clock.setFixedTime(new Date('2026-08-24T10:00:00'))

  await page.goto('/')
  await page.getByRole('button', { name: 'Room availability today' }).click()
  await expect(page).toHaveURL(/\/rooms\/2026-08-24\/availability$/)

  await page.goto('/')
  await page.getByRole('link', { name: 'Add Meeting' }).click()
  await expect(page).toHaveURL(/\/meetings\/add$/)
  // Home's "Add Meeting" link carries no router state (unlike RoomAvailabilityPage's - see E.37's
  // known gap), so this is exercising AddMeetingPage's own defaultDate() fallback to today, not a
  // passed-through value.
  await expect(page.getByRole('group', { name: 'Date' }).locator('input')).toHaveValue('08/24/2026')
})
