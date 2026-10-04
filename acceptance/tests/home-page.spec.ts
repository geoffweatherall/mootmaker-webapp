import type { Page } from '@playwright/test'
import { formatDateParam, pinnedFutureWeekday, pinnedWeekday } from './support/pinnedDates'
import { requireEnv, uniqueId } from './support/env'
import { signInAsNoPersonUser, signInAsStandardUser } from './support/accounts'
import { expect, test } from './support/test'
import { gql } from './support/gql'

// mootmaker/docs/reference/use-cases.md, section D (Home page), cases 21-25 - see
// acceptance/test-cases/d-home-page.md for the full Given/When/Then design each test below
// translates directly from. Signs in as whichever account each case's own Preconditions call for
// (./support/accounts.ts): the standard user (D.22, D.23, D.25, D.112) or the no-person user
// (D.24). D.21 stays signed out throughout, and is the one place the
// demo user's credentials appear, because the demo login on the home page is its subject.

// Fills one of AddMeetingPage's MUI X sectioned Time fields (role="group", e.g. "Start time") -
// the same technique person-calendar.spec.ts's fillTime uses, confirmed against the real deployed
// form there: clicking the "Hours" section then typing all digits plus an AM/PM marker in one go
// auto-advances through Hours -> Minutes. The default account is 24-hour, so there is no
// Meridiem section and the hour is typed as-is: "0900" produces 09:00, "1400" produces 14:00.
async function fillTime(page: Page, groupLabel: string, digits: string): Promise<void> {
  const group = page.getByRole('group', { name: groupLabel })
  await group.getByRole('spinbutton', { name: 'Hours' }).click()
  await page.keyboard.type(digits)
}

// Same sectioned-field technique as fillTime above, applied to the Date field's sections. The
// field now takes an explicit `format` from the signed-in viewer's own date-format setting rather
// than falling through to the dayjs adapter's "L" token (which resolved to MM/DD/YYYY for the
// "en" locale). The default setting is Iso, so the sections run Year, Month, Day and typing
// starts at Year. Only needed by D.22's "tomorrow" fixture, to override the form's default.
async function setDate(page: Page, date: { month: number; day: number; year: number }): Promise<void> {
  const group = page.getByRole('group', { name: 'Date' })
  await group.getByRole('spinbutton', { name: 'Year' }).click()
  await page.keyboard.type(`${date.year}${String(date.month).padStart(2, '0')}${String(date.day).padStart(2, '0')}`)
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

// The merged agenda's per-day section - a Box containing both the day's own heading row (Today/
// Tomorrow, as an <h2>) and its rows, as siblings - scoped this way (rather than a page-wide
// query) so a day's rows can be asserted without ambiguity against the other day. Two levels up
// from the heading: one to its own header row Stack, one more to the day-section Box that also
// holds the rows Stack alongside it - see HomePage.tsx's day-section markup. Previously walked up
// just one level to each day's own Paper, from when Today/Tomorrow were two separate panels
// rather than sections sharing one merged list - see designs/home-and-misc-pages-redesign.md.
function agendaPanel(page: Page, title: 'Today' | 'Tomorrow') {
  return page.getByRole('heading', { name: title, level: 2 }).locator('xpath=../..')
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

// Mirrors add-meeting.spec.ts's roomFieldIsEmpty.
async function comboboxIsEmpty(page: Page, name: string): Promise<boolean> {
  const value = await page.getByRole('combobox', { name }).inputValue()
  return value.trim().length === 0
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


/**
 * A pinned instant on the given weekday, at least `minDaysAhead` days from now, at `hhmm` local.
 *
 * Derived rather than written as a calendar date, because the API now has two moving bounds: a
 * retention boundary that advances every week, and a 180-day booking horizon. A hardcoded date
 * drifts out of that window and the failure names something else entirely - a failed navigation, a
 * missing meeting - rather than the date.
 *
 * Pinning itself must stay: it's what keeps "Today"/"Tomorrow" deterministic and avoids booking a
 * start/end pair that spans midnight (rejected by the API as SpansMultipleDays).
 */
test('D.22 - signed in with a linked Person shows Calendar/Room availability/Add Meeting entry points plus a Today/Tomorrow agenda sorted by start time, each opening its own meeting details', async ({
  page,
  context,
  api,
}) => {
  // Forces MeetingDetailContent's Share button down its clipboard-fallback branch
  // deterministically - see designs/meeting-detail-consolidation.md's Testing impacts.
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  const runId = uniqueId()
  const roomName = `Home Agenda Room ${runId}`
  const subjectToday10 = `D22 today 10am ${runId}`
  const subjectToday14 = `D22 today 2pm ${runId}`
  const subjectTomorrow = `D22 tomorrow ${runId}`

  // A Tuesday, safely inside business hours. This test's "Today" panel asserts an exact row count
  // below; the reset before every test (./support/test.ts) is what guarantees no other meeting
  // lands on the same date.
  //
  // DERIVED, not hardcoded. It used to be 2027-04-06, which stopped working the moment the API
  // gained a 180-day booking horizon: every booking came back OutsideBookableRange and the test
  // reported a failed navigation, blaming the Home page. A fixed future date expires silently.
  const pinnedToday = pinnedFutureWeekday('Tuesday', { hour: 9 })
  await page.clock.setFixedTime(pinnedToday)
  await signInAsStandardUser(page)
  await api.createRoom(roomName, 4)

  // Created out of chronological order (14:00 before 10:00) so a passing sort-order assertion
  // below can only be explained by the Home page actually sorting by start time, not by
  // preserving creation/insertion order (same reasoning as person-calendar.spec.ts's G.63).
  await addMeeting(page, { subject: subjectToday14, roomName, start: '1400', end: '1430' })
  await addMeeting(page, { subject: subjectToday10, roomName, start: '1000', end: '1030' })
  // Tomorrow relative to the pinned instant above, DERIVED from it. Hardcoding this was the other
  // half of the same expiry bug: pinning the clock forward is no use if the date typed into the
  // form is still a fixed calendar date the horizon has moved past.
  const pinnedTomorrow = new Date(pinnedToday)
  pinnedTomorrow.setDate(pinnedTomorrow.getDate() + 1)
  await addMeeting(page, {
    subject: subjectTomorrow,
    roomName,
    start: '1000',
    end: '1030',
    date: {
      year: pinnedTomorrow.getFullYear(),
      month: pinnedTomorrow.getMonth() + 1,
      day: pinnedTomorrow.getDate(),
    },
  })

  await page.goto('/')

  await expect(pageMain(page).getByRole('button', { name: 'Calendar' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Room availability today' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add Meeting' })).toBeVisible()

  // Each row is a ListItemButton with no component={Link} any more - it opens the shared
  // detail sheet/panel in place instead of navigating (see designs/
  // meeting-detail-consolidation.md), so it's a native <button> (role 'button'), not an <a>.
  const todayRows = agendaPanel(page, 'Today').getByRole('button')
  await expect(todayRows).toHaveCount(2)
  const todayTexts = await todayRows.allTextContents()
  expect(todayTexts[0]).toContain(subjectToday10)
  expect(todayTexts[0]).toContain('10:00')
  expect(todayTexts[0]).toContain(roomName)
  expect(todayTexts[1]).toContain(subjectToday14)
  expect(todayTexts[1]).toContain('14:00')
  expect(todayTexts[1]).toContain(roomName)

  const tomorrowRows = agendaPanel(page, 'Tomorrow').getByRole('button')
  await expect(tomorrowRows).toHaveCount(1)
  await expect(tomorrowRows).toContainText(subjectTomorrow)

  // Clicking a row opens its detail sheet/panel in place - the first Today row is the 10:00
  // meeting (see the sort-order assertion above). Share reaches that same meeting's full details
  // page, the same way a real user now would.
  await todayRows.first().click()
  await expect(page.getByRole('heading', { name: subjectToday10, level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Share meeting' }).click()
  const meetingUrl = await page.evaluate(() => navigator.clipboard.readText())
  expect(meetingUrl).toMatch(/\/meetings\/.+/)

  await page.goto(meetingUrl)
  await expect(page.getByRole('heading', { name: subjectToday10, level: 1 })).toBeVisible()
})

test('D.23 - no meetings today or tomorrow shows the empty state, not a bare empty list', async ({ page }) => {
  // The standard user has no meetings at all: the environment was reset before this test
  // (./support/test.ts), and reset deletes every meeting.
  await signInAsStandardUser(page)

  await page.goto('/')

  // The merged agenda shows ONE whole-agenda empty state when both Today and Tomorrow have
  // nothing, not a per-day heading/empty-state pair any more (see HomePage.tsx's `bothDaysEmpty`
  // branch) - so this no longer loops over agendaPanel() the way it did with two separate panels.
  await expect(page.getByRole('heading', { name: 'Today', level: 2 })).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'No meetings today or tomorrow.' })).toBeVisible()
  // A plain <p> locator, not getByText: EmptyState's icon carries the same message as its own
  // (decorative) SVG <title> - see components/EmptyState.tsx's titleAccess - which getByText also
  // matches regardless of visibility.
  await expect(page.locator('p', { hasText: 'No meetings today or tomorrow.' })).toBeVisible()
})

test('D.24 - no linked Person shows a degraded Home page: the account-not-set-up error replaces Calendar/agenda, but Room availability today and Add Meeting still work with a blank Organiser', async ({
  page,
}) => {
  await signInAsNoPersonUser(page)
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
  await signInAsStandardUser(page)
  // A Monday inside business hours, derived from now() rather than hardcoded: a literal date here
  // expires as soon as the server's retention boundary advances past it (see
  // support/pinnedDates.ts). The expected URL and field value below are therefore derived from the
  // same instant rather than written out, which is what the catalog Steps describe anyway.
  const pinnedToday = pinnedWeekday('Monday')
  await page.clock.setFixedTime(pinnedToday)
  const todayParam = formatDateParam(pinnedToday)

  await page.goto('/')
  await page.getByRole('button', { name: 'Room availability today' }).click()
  await expect(page).toHaveURL(new RegExp(`/rooms/${todayParam}/availability$`))

  await page.goto('/')
  await page.getByRole('link', { name: 'Add Meeting' }).click()
  await expect(page).toHaveURL(/\/meetings\/add$/)
  // Home's "Add Meeting" link carries no router state (unlike RoomAvailabilityPage's - see E.37's
  // known gap), so this is exercising AddMeetingPage's own defaultDate() fallback to today, not a
  // passed-through value.
  await expect(page.getByRole('group', { name: 'Date' }).locator('input')).toHaveValue(todayParam)
})

async function getIdToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.endsWith('.idToken')) return localStorage.getItem(key)
    }
    return null
  })
  if (!token) {
    throw new Error('Could not find a Cognito idToken in localStorage - is the browser actually signed in?')
  }
  return token
}

async function graphqlQuery<T>(page: Page, token: string, query: string): Promise<T> {
  const response = await page.request.post(requireEnv('GRAPHQL_API_URL'), {
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    data: { query },
  })
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] }
  if (body.errors?.length) {
    throw new Error(`GraphQL request failed: ${JSON.stringify(body.errors)}`)
  }
  return body.data as T
}

/** The signed-in user's own display name, needed to pick them by name in the Attendees
 * Autocomplete below - there is no DEMO_USER_NAME env var, so this reads it the same way the
 * signed-in session itself does. */
async function ownName(page: Page): Promise<string> {
  const token = await getIdToken(page)
  const result = await graphqlQuery<{ workspace: { me: { name: string } | null } }>(
    page,
    token,
    gql`query { workspace { me { name } } }`,
  )
  if (!result.workspace.me) {
    throw new Error('Signed-in account has no linked Person')
  }
  return result.workspace.me.name
}

test('D.112 - "Search further ahead" finds a real meeting booked beyond the initial window', async ({ page, api }) => {
  const runId = uniqueId()
  const roomName = `Search Further Ahead Room ${runId}`
  const organiserName = `Search Further Ahead Organiser ${runId}`
  const subject = `D112 search further ahead ${runId}`

  // A Tuesday, far from every other pinned date this suite uses - see D.22's own note on why that
  // matters (an unrelated fixture meeting landing on the same date this test navigates through).
  const pinnedToday = pinnedFutureWeekday('Tuesday', { hour: 9 })
  await page.clock.setFixedTime(pinnedToday)
  await signInAsStandardUser(page)
  await api.createRoom(roomName, 4)

  // Add Meeting defaults the Organiser to the signed-in user - explicitly picking a different
  // organiser first, then adding the signed-in user as an Attendee, is what makes them an
  // unresponded ATTENDEE instead (matching webapp/tests/attendee-response-status.spec.ts's own
  // mocked-layer equivalent of this same mechanic).
  await api.createPerson(organiserName)
  const attendeeName = await ownName(page)

  // 6 days out: past the initial 3-day window (offsets 0-2) and past the first "Search further
  // ahead" click's own new window (offsets 3-5), so reaching it exercises a click that finds
  // nothing before the click that does - see designs/home-and-misc-pages-redesign.md's Testing
  // impacts on why this isn't also duplicated as a separate "finds nothing" acceptance case.
  const meetingDate = new Date(pinnedToday)
  meetingDate.setDate(meetingDate.getDate() + 6)

  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
  await page.getByLabel('Subject').fill(subject)

  await page.getByRole('combobox', { name: 'Organiser' }).click()
  await page.getByRole('option', { name: organiserName, exact: true }).click()

  await page.getByRole('combobox', { name: 'Attendees' }).click()
  await page.getByRole('option', { name: attendeeName, exact: true }).click()
  await page.keyboard.press('Escape')

  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: roomName, exact: false }).click()
  await setDate(page, { year: meetingDate.getFullYear(), month: meetingDate.getMonth() + 1, day: meetingDate.getDate() })
  await fillTime(page, 'Start time', '1000')
  await fillTime(page, 'End time', '1030')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Needs your response' })).toBeVisible()
  await expect(page.getByRole('region', { name: subject, exact: true })).toHaveCount(0)

  const searchButton = page.getByRole('button', { name: 'Search further ahead' })
  const card = page.getByRole('region', { name: subject, exact: true })
  // Bounded rather than an unconditional loop - if the meeting is never found, this fails loudly
  // with a clear assertion instead of hanging.
  for (let attempt = 0; attempt < 5 && (await card.count()) === 0; attempt++) {
    await searchButton.click()
  }
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card.getByText(organiserName, { exact: false })).toBeVisible()
})
