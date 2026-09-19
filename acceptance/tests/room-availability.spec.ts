import { expect, test, type Locator, type Page } from '@playwright/test'
import { formatDateParam, pinnedWeekday } from './support/pinnedDates'

// mootmaker/docs/reference/use-cases.md, section E (Room Availability), cases 26-37 except 30. E.30 ("no rooms
// exist yet") is covered separately by 00-room-availability-empty.spec.ts, which must run before
// any room-creating test in this environment - see that file's own header comment and
// e-room-availability.md's tc-e30 Notes. This file's name sorts after "00-...", so nothing special
// is needed here beyond simply never recreating that same "zero rooms" scenario.
//
// Every case here signs in as the demo user (a real, pre-verified, admin, Person-linked Cognito
// account present in every environment - see acceptance/README.md and add-meeting.spec.ts's own
// header comment) and pins page.clock.setFixedTime to a known business-hours weekday, for the same
// flakiness reason add-meeting.spec.ts already documents: any test that depends on "today" or a
// meeting's default time needs a deterministic clock to avoid flaking whenever the suite happens to
// run close to midnight (a default start/end pair spanning two calendar days is rejected by the
// API as SpansMultipleDays). Every room/meeting subject below is suffixed with a fresh uniqueId()
// so repeated runs against the same shared environment, and other agents' concurrent runs against
// sections other than E, never collide.
//
// E.37 note: RoomAvailabilityPage's "Add Meeting" links now pass the currently-viewed date via
// router state, and AddMeetingPage's defaultDate() reads it - this used to be a documented gap in
// e-room-availability.md, now fixed, so E.37 below asserts the corrected (passing) behaviour.

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

// Real Date.now()/Math.random(), deliberately not derived from any pinned clock - see
// add-meeting.spec.ts's identical helper for why a fresh value is needed every run even against an
// already-deployed, repeatedly-iterated-against environment.
function uniqueId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
}

async function signInAsDemo(page: Page): Promise<void> {
  const demoEmail = requireEnv('DEMO_USER_EMAIL')
  const demoPassword = requireEnv('DEMO_USER_PASSWORD')
  await page.goto('/signin')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
}

// No data-seeding bypass for rooms - every test creates its own via the real Settings UI (see
// acceptance/README.md's "Known gaps" and README.md's test-data conventions), uniquely named per
// run.
async function createRoom(page: Page, name: string, capacity: number): Promise<void> {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add room' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Capacity').fill(String(capacity))
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

async function goToAddMeeting(page: Page): Promise<void> {
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
}

async function selectRoom(page: Page, roomName: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: roomName, exact: false }).click()
}

// MUI X's TimePicker/DatePicker sections are individually keyboard-editable (Hours/Minutes, or
// Year/Month/Day) rather than a single fillable input - typing digits into the first section
// auto-advances through the rest. Copied from add-meeting.spec.ts's own setTime.
async function setTime(page: Page, groupName: 'Start time' | 'End time', hour24: number, minute: number): Promise<void> {
  const group = page.getByRole('group', { name: groupName })
  await group.getByRole('spinbutton', { name: 'Hours' }).click()
  await page.keyboard.type(`${String(hour24).padStart(2, '0')}${String(minute).padStart(2, '0')}`)
}

// AddMeetingPage's Date field now takes an explicit `format` from the signed-in viewer's own
// date-format setting. The default is Iso, so the sections run Year, Month, Day - not the
// Month/Day/Year of MUI's US-locale default, which is what this used to type into. Typing starts
// at Year accordingly.
async function setDate(page: Page, month: number, day: number, year: number): Promise<void> {
  const group = page.getByRole('group', { name: 'Date' })
  await group.getByRole('spinbutton', { name: 'Year' }).click()
  await page.keyboard.type(`${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`)
}

const MONTH_ABBREV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

// Reads a DatePicker's sectioned field (role="group", with Day/Month/Year child sections each
// role="spinbutton" - see MUI X's locale translations for those section names) and asserts it
// shows the given date, independent of whichever concrete format string the field happens to use
// (RoomAvailabilityPage's is "dddd D MMM YYYY" with a letter month; AddMeetingPage's Date field is
// the default numeric "MM/DD/YYYY") - reading each section directly avoids having to reproduce
// either format string exactly, and Number(...) tolerates the section being zero-padded or not.
async function expectDateFieldShows(group: Locator, expected: Date): Promise<void> {
  await expect(group).toBeVisible()
  // exact: true matters here - RoomAvailabilityPage's DatePicker also has a "Week day" section
  // (format includes "dddd"), and Playwright's default name matching is a case-insensitive
  // substring, so an unscoped name: 'Day' also matches "Week day" (confirmed against a real run:
  // "resolved to 2 elements").
  const dayText = (await group.getByRole('spinbutton', { name: 'Day', exact: true }).textContent()) ?? ''
  const yearText = (await group.getByRole('spinbutton', { name: 'Year', exact: true }).textContent()) ?? ''
  const monthText = (await group.getByRole('spinbutton', { name: 'Month', exact: true }).textContent()) ?? ''

  expect(Number(dayText)).toBe(expected.getDate())
  expect(Number(yearText)).toBe(expected.getFullYear())

  const expectedMonthNumeric = expected.getMonth() + 1
  const monthMatches =
    Number(monthText) === expectedMonthNumeric ||
    monthText.toLowerCase().startsWith(MONTH_ABBREV[expected.getMonth()].toLowerCase())
  expect(monthMatches).toBe(true)
}

// RoomAvailabilityPage's DatePicker has no `label`, so it can't be found by accessible name -
// locating it structurally instead, via the Stack it shares with the Previous/Next day buttons
// (see RoomAvailabilityPage.tsx: IconButton "Previous day", DatePicker, IconButton "Next day", all
// direct children of the same header Stack).
function dateNavGroup(page: Page): Locator {
  return page.getByLabel('Next day').locator('xpath=..').getByRole('group')
}

async function goToOwnCalendar(page: Page): Promise<void> {
  // exact: true matters here - a meeting row can have an accessible name like "Calendar click
  // meeting <id>: 10:00-10:30" (built from a test fixture's own subject text elsewhere in the
  // suite), which a non-exact match against 'Calendar' would ambiguously match alongside this
  // sidebar link - see person-calendar.spec.ts's goToOwnCalendar for the same fix.
  await page.getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(page).toHaveURL(/\/persons\/[^/]+\/calendar$/)
}

// RoomAvailabilityPage's card grid accumulates every room ever created in a shared environment
// (rooms are never deleted), so an unscoped getByText(/Capacity \d+/) matches every room's
// capacity text once other specs have run first - confirmed against a real run ("resolved to 28
// elements") back when this was a grid, and the same risk applies to any per-room text now.
// Scoping to the specific room's own Paper card - climbing from its name Typography to the
// nearest MuiPaper-root ancestor, since RoomAvailabilityPage.tsx renders each room as its own
// `<Paper>` - keys every check below to exactly the room this test itself created.
function roomCard(page: Page, roomName: string): Locator {
  return page
    .getByText(roomName, { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
}

function roomNameColumn(page: Page, roomName: string): Locator {
  return roomCard(page, roomName)
}

// A room's meetings only show once its card's "See <day>'s meetings (N)" toggle is expanded -
// Collapse keeps the list mounted but zero-height/hidden until then, see RoomAvailabilityPage.tsx.
// Returns the card itself so callers can keep scoping further checks to it.
async function expandMeetings(page: Page, roomName: string): Promise<Locator> {
  const card = roomCard(page, roomName)
  await card.getByRole('button', { name: /'s meetings/ }).click()
  return card
}

test('E.26 - view room availability for today', async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Today Room E26 ${runId}`
  const pinnedNow = pinnedWeekday('Wednesday')
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, roomName, 4)

  await page.getByRole('link', { name: 'Room Availability' }).click()

  const today = formatDateParam(pinnedNow)
  await expect(page).toHaveURL(new RegExp(`/rooms/${today}/availability`))
  await expect(page.getByText(roomName, { exact: true })).toBeVisible()
  await expect(roomNameColumn(page, roomName).getByText(/Capacity \d+/)).toBeVisible()
  await expectDateFieldShows(dateNavGroup(page), pinnedNow)
})

test("E.27 - navigating to a future date shows that date's meeting", async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Future Room E27 ${runId}`
  const subject = `E27 future meeting ${runId}`
  const pinnedNow = pinnedWeekday('Tuesday')
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, roomName, 4)

  // Fixture: a meeting three days in the future, created via Add Meeting with the Date field set
  // explicitly (it otherwise defaults to today).
  const futureDate = addDays(pinnedNow, 3)
  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(subject)
  await selectRoom(page, roomName)
  await setDate(page, futureDate.getMonth() + 1, futureDate.getDate(), futureDate.getFullYear())
  await setTime(page, 'Start time', 10, 0)
  await setTime(page, 'End time', 10, 30)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(new RegExp(`/rooms/${formatDateParam(futureDate)}/availability`))

  // The use case itself: starting from today, click "Next day" three times.
  const today = formatDateParam(pinnedNow)
  await page.goto(`/rooms/${today}/availability`)
  await page.getByLabel('Next day').click()
  await page.getByLabel('Next day').click()
  await page.getByLabel('Next day').click()

  await expect(page).toHaveURL(new RegExp(`/rooms/${formatDateParam(futureDate)}/availability`))
  await expectDateFieldShows(dateNavGroup(page), futureDate)
  const card = await expandMeetings(page, roomName)
  // Not a plain getByText(subject): a future day's status sublabel is "First: <subject> at
  // <time>", which also contains the subject as a substring - only the meeting row itself has
  // role 'button'.
  await expect(card.getByRole('button', { name: subject, exact: false })).toBeVisible()
})

test('E.28 - navigating to a past date updates the URL and date picker', async ({ page }) => {
  const pinnedNow = pinnedWeekday('Friday')
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)

  const today = formatDateParam(pinnedNow)
  await page.goto(`/rooms/${today}/availability`)
  await expect(page.getByRole('heading', { name: 'Room Availability' })).toBeVisible()

  await page.getByLabel('Previous day').click()

  const yesterday = addDays(pinnedNow, -1)
  await expect(page).toHaveURL(new RegExp(`/rooms/${formatDateParam(yesterday)}/availability`))
  await expectDateFieldShows(dateNavGroup(page), yesterday)
})

test('E.29 - the date picker jumps directly to an arbitrary date several weeks away', async ({ page }) => {
  // Deliberately still a literal, unlike every other pinned date in this file (see
  // support/pinnedDates.ts). This case books nothing - it only navigates - so the retention
  // boundary never applies to it, and it has been running from behind that boundary for weeks
  // without trouble. The literal also keeps the property the jump below wants: a date early in its
  // month, so the fixed +42-day hop can't land on a day-of-month the target month doesn't have.
  const pinnedNow = new Date('2026-08-03T10:00:00')
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)

  const today = formatDateParam(pinnedNow)
  await page.goto(`/rooms/${today}/availability`)
  await expect(page.getByRole('heading', { name: 'Room Availability' })).toBeVisible()

  // ~6 weeks away - not sensibly reachable via repeated next/prev clicks (see E.27/E.28 for that
  // mechanism instead).
  const target = addDays(pinnedNow, 42)
  const group = dateNavGroup(page)
  await group.getByRole('button', { name: /Choose date/i }).click()

  const dialog = page.getByRole('dialog')
  const monthsForward =
    (target.getFullYear() - pinnedNow.getFullYear()) * 12 + (target.getMonth() - pinnedNow.getMonth())
  for (let i = 0; i < monthsForward; i++) {
    await dialog.getByRole('button', { name: 'Next month' }).click()
  }
  // Not gridcell name (the day-of-month number): during the month-switch slide transition MUI can
  // briefly keep both the outgoing and incoming month's grids mounted, so a same-numbered day from
  // the adjacent month can transiently double-match by name alone (confirmed against a real run:
  // "resolved to 2 elements", 31 days apart by their own data-timestamp). Each PickersDay instead
  // carries its own exact local-midnight epoch ms as data-timestamp, which is unambiguous.
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  const targetCell = dialog.locator(`[data-timestamp="${targetMidnight}"]`)
  // Keyboard focus + Enter, not .click() - confirmed against two separate full-suite runs (this
  // environment accumulates every room ever created across the whole suite, per this catalog's own
  // E.30 Notes, so by the time this test runs the underlying RoomAvailabilityPage is rendering
  // dozens of rooms): under that load, MUI's month slide-in/out CSS transition can visually stall
  // indefinitely (the "Next month" header text staying stuck on the outgoing month for the entire
  // 120s test timeout), even though React has already committed the target month's day cells to
  // the DOM - a pointer .click() on the target cell then gets stuck failing its actionability check
  // ("element is not stable" / "<outgoing-month's adjacent-day button> intercepts pointer events")
  // because that check requires the element to be visually settled and unobstructed, neither of
  // which the stalled transition ever satisfies. locator.focus() only requires the element to be
  // attached and enabled - it doesn't care about visual stability or pointer occlusion - and a
  // native <button> (which PickersDay renders as) fires its click handler on a keyboard Enter once
  // focused, the same as a real click would, so this reaches the same outcome without depending on
  // the animation ever visually finishing.
  await targetCell.focus()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(new RegExp(`/rooms/${formatDateParam(target)}/availability`))
})

test('E.31 - rooms exist but none has meetings that day shows the cards, not the no-rooms empty state', async ({
  page,
}) => {
  const runId = uniqueId()
  const roomName = `Empty Day Room E31 ${runId}`
  // Far enough in the future to be collision-free with every other fixture in this catalog - see
  // e-room-availability.md's tc-e31 Notes. Isolation is also guaranteed structurally: this test
  // only ever checks its own freshly-created room, which by construction has no meetings on it yet
  // regardless of what date is used.
  // Deliberately still a literal (see support/pinnedDates.ts): being far in the FUTURE, it can
  // never fall behind the retention boundary, which is the expiry every other pinned date in this
  // file was changed to avoid.
  const pinnedNow = new Date('2028-01-05T10:00:00')
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, roomName, 4)

  const today = formatDateParam(pinnedNow)
  await page.goto(`/rooms/${today}/availability`)

  await expect(page.getByText(roomName, { exact: true })).toBeVisible()
  await expect(roomNameColumn(page, roomName).getByText(/Capacity \d+/)).toBeVisible()
  await expect(page.getByText('No rooms exist yet.')).toHaveCount(0)
  // The card's own toggle button spells out the meeting count for the day - "(0)" here proves "no
  // meetings that day" beyond just "the empty state didn't show", without needing to expand it.
  await expect(roomCard(page, roomName).getByRole('button', { name: /'s meetings \(0\)$/ })).toBeVisible()
})

test("E.32 - a room card's expanded meeting list shows subject and time range, and clicking a meeting opens its detail sheet, from which Share reaches Meeting Details", async ({
  page,
  context,
}) => {
  // Forces MeetingDetailContent's Share button down its clipboard-fallback branch
  // deterministically - see designs/meeting-detail-consolidation.md's Testing impacts.
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  const runId = uniqueId()
  const roomName = `Card Room E32 ${runId}`
  const subject = `E32 card meeting ${runId}`
  const pinnedNow = pinnedWeekday('Tuesday', { hour: 9 })
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, roomName, 4)

  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(subject)
  await selectRoom(page, roomName)
  await setTime(page, 'Start time', 9, 0)
  await setTime(page, 'End time', 9, 30)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)

  // Meetings only render once the card's "See <day>'s meetings (N)" toggle is expanded (see
  // expandMeetings()'s own comment). Not a plain getByText(subject): this meeting is happening
  // right now under the pinned clock, so the card's own status sublabel is bare `busy.subject`
  // (no "Busy until"/"Next"/"First" prefix - see roomAvailabilityLogic.ts) - a second, exact
  // duplicate of the subject text elsewhere on the card. Only the meeting row itself has role
  // 'button', so scoping by role sidesteps the ambiguity regardless of which status branch
  // applies.
  const card = await expandMeetings(page, roomName)
  const meetingRow = card.getByRole('button', { name: subject, exact: false })
  await expect(meetingRow).toContainText('09:00–09:30')

  // Opens the shared detail sheet/panel in place, not a navigation - see
  // designs/meeting-detail-consolidation.md. Reach Meeting Details itself via Share, the same way a
  // real user now would.
  await meetingRow.click()
  await expect(page.getByRole('heading', { name: subject, level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Share meeting' }).click()
  const meetingUrl = await page.evaluate(() => navigator.clipboard.readText())
  expect(meetingUrl).toMatch(/\/meetings\/.+/)

  await page.goto(meetingUrl)
  await expect(page.getByRole('heading', { name: subject, level: 1 })).toBeVisible()
})

test('E.33 - overlapping meetings in different rooms each show only on their own card', async ({ page, context }) => {
  // Forces MeetingDetailContent's Share button down its clipboard-fallback branch
  // deterministically - see designs/meeting-detail-consolidation.md's Testing impacts.
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  const runId = uniqueId()
  const roomAName = `Room A E33 ${runId}`
  const roomBName = `Room B E33 ${runId}`
  const subjectA = `E33 meeting A ${runId}`
  const subjectB = `E33 meeting B ${runId}`
  const pinnedNow = pinnedWeekday('Wednesday', { hour: 9 })
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, roomAName, 4)
  await createRoom(page, roomBName, 4)

  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(subjectA)
  await selectRoom(page, roomAName)
  await setTime(page, 'Start time', 10, 0)
  await setTime(page, 'End time', 11, 0)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)

  // Time-overlapping with the first meeting, but a different room - legal, since
  // TimeRangeUnavailable is scoped per room.
  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(subjectB)
  await selectRoom(page, roomBName)
  await setTime(page, 'Start time', 10, 30)
  await setTime(page, 'End time', 11, 30)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)

  const roomACard = await expandMeetings(page, roomAName)
  const roomBCard = await expandMeetings(page, roomBName)

  await expect(roomACard.getByText(subjectA, { exact: true })).toBeVisible()
  await expect(roomACard.getByText(subjectB, { exact: true })).toHaveCount(0)
  await expect(roomBCard.getByText(subjectB, { exact: true })).toBeVisible()
  await expect(roomBCard.getByText(subjectA, { exact: true })).toHaveCount(0)

  // Clicking a meeting row opens the shared detail sheet/panel in place, not a navigation any
  // more (see designs/meeting-detail-consolidation.md) - reach Meeting Details itself, and the
  // real page navigation this test's "back" step relies on, via Share.
  await roomACard.getByText(subjectA, { exact: true }).click()
  await page.getByRole('button', { name: 'Share meeting' }).click()
  const meetingAUrl = await page.evaluate(() => navigator.clipboard.readText())
  await page.goto(meetingAUrl)
  await expect(page.getByRole('heading', { name: subjectA, level: 1 })).toBeVisible()

  // A real navigation away and back unmounts RoomAvailabilityPage, so its expandedRoomIds state
  // (a plain useState, not persisted anywhere) resets - room B's card needs expanding again.
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Room Availability' })).toBeVisible()
  const roomBCardAfterBack = await expandMeetings(page, roomBName)
  await roomBCardAfterBack.getByText(subjectB, { exact: true }).click()
  await page.getByRole('button', { name: 'Share meeting' }).click()
  const meetingBUrl = await page.evaluate(() => navigator.clipboard.readText())
  await page.goto(meetingBUrl)
  await expect(page.getByRole('heading', { name: subjectB, level: 1 })).toBeVisible()
})

test('E.34 - back-to-back meetings in the same room both succeed and render as distinct, ordered rows', async ({
  page,
}) => {
  const runId = uniqueId()
  const roomName = `Back To Back Room E34 ${runId}`
  const subject1 = `E34 first meeting ${runId}`
  const subject2 = `E34 second meeting ${runId}`
  const pinnedNow = pinnedWeekday('Thursday', { hour: 8 })
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, roomName, 4)

  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(subject1)
  await selectRoom(page, roomName)
  await setTime(page, 'Start time', 9, 0)
  await setTime(page, 'End time', 10, 0)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)

  // 10:00-11:00, same room, touching the first meeting's end exactly - the actual boundary
  // condition under test is that this creation succeeds at all, per the API's [startTime, endTime)
  // half-open interval rule (mootmaker-api/README.md's Validation table), not just how it renders.
  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(subject2)
  await selectRoom(page, roomName)
  await setTime(page, 'Start time', 10, 0)
  await setTime(page, 'End time', 11, 0)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
  await expect(page.getByText('The room already has a meeting scheduled during that time range.')).toHaveCount(0)

  // Two distinct rows, in chronological order - not merged into one, and not reordered. Filtered
  // to rows whose name contains a time, not just role 'button' - the card's own "Hide ... meetings"
  // toggle is role 'button' too now (meeting rows changed from 'link' to 'button' - see
  // designs/meeting-detail-consolidation.md), so an unfiltered role query would also match it.
  const card = await expandMeetings(page, roomName)
  const rows = card.getByRole('button', { name: /\d{2}:\d{2}/ })
  await expect(rows).toHaveCount(2)
  const rowTexts = await rows.allTextContents()
  expect(rowTexts[0]).toContain('09:00')
  expect(rowTexts[0]).toContain(subject1)
  expect(rowTexts[1]).toContain('10:00')
  expect(rowTexts[1]).toContain(subject2)
})

test('E.35 - room colour is consistent between Room Availability and Person Calendar', async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Colour Match Room E35 ${runId}`
  const subject = `E35 colour match meeting ${runId}`
  const pinnedNow = pinnedWeekday('Tuesday', { weeks: 1 })
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, roomName, 4)

  // Left at the Date field's default (today, same as the pinned clock), so this meeting falls
  // inside Person Calendar's own visible week, computed from that same pinned "now".
  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(subject)
  await selectRoom(page, roomName)
  await setTime(page, 'Start time', 10, 0)
  await setTime(page, 'End time', 10, 30)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)

  const availabilityDot = page.getByText(roomName, { exact: true }).locator('xpath=preceding-sibling::div[1]')
  const availabilityColor = await availabilityDot.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(availabilityColor).toBeTruthy()

  // Rather than guessing/hardcoding the demo user's own Person id, get there the same way a real
  // user would: the sidebar's "Calendar" nav link defaults to the signed-in user's own calendar.
  await goToOwnCalendar(page)
  // Person Calendar's meeting rows are a ButtonBase (opens a detail panel, not a link), with no
  // aria-label of its own - its accessible name is just its visible text (subject, time, room), so
  // an exact:false role match on the subject finds it. The colour dot sits two levels deep
  // (PersonCalendarPage.tsx: ButtonBase > Stack(dot, subject) > Box(dot)) since
  // mootmaker-webapp#71's alignment fix, so `div` alone now also matches that wrapping Stack -
  // `div div` (a div nested inside another div) is specific to the dot itself.
  const meetingRow = page.getByRole('button', { name: subject, exact: false })
  const calendarDot = meetingRow.locator('div div').first()
  const calendarColor = await calendarDot.evaluate((el) => getComputedStyle(el).backgroundColor)

  expect(calendarColor).toBe(availabilityColor)
})

test('E.36 - mobile viewport: room cards stack in a single column, no horizontal scrolling needed', async ({
  page,
}) => {
  const runId = uniqueId()
  const roomName = `Mobile Room E36 ${runId}`
  const pinnedNow = pinnedWeekday('Friday')
  await page.clock.setFixedTime(pinnedNow)
  // Signs in at the default (desktop) viewport first, then switches to mobile - signInAsDemo's own
  // "Sign out" check targets the sidebar's Drawer, which Layout.tsx hides via CSS (not unmounts) at
  // narrow widths, so doing this the other way around leaves that text attached but never visible
  // (confirmed against a real run: "unexpected value 'hidden'"). This doesn't change what E.36
  // itself is testing, since sign-in isn't part of this case's own assertions.
  await signInAsDemo(page)
  await page.setViewportSize({ width: 375, height: 667 })
  await createRoom(page, roomName, 4)

  const today = formatDateParam(pinnedNow)
  await page.goto(`/rooms/${today}/availability`)
  await expect(page.getByText(roomName, { exact: true })).toBeVisible()

  // This redesign's whole point (mootmaker-webapp#11) was replacing the old fixed-column timeline
  // grid - which forced horizontal scrolling on narrow screens and had a real rendering defect
  // where scrolled content bled under its sticky room-name column - with cards that stack in a
  // single column instead (RoomAvailabilityPage.tsx's grid: `{ xs: '1fr', md: 'repeat(2, 1fr)' }`).
  // No horizontal scroll should be needed at this mobile width any more.
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

  // Single column: the room card spans (almost) the full viewport width, rather than sharing a row
  // with a second card the way the >=md two-column layout would.
  const cardBox = await roomCard(page, roomName).boundingBox()
  if (!cardBox) {
    throw new Error('Could not read the room card bounding box.')
  }
  expect(cardBox.width).toBeGreaterThan(300)
})

test('E.37 - "Add Meeting" from this page pre-fills the currently viewed date, not today', async ({ page }) => {
  const pinnedNow = pinnedWeekday('Monday')
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)

  const today = formatDateParam(pinnedNow)
  await page.goto(`/rooms/${today}/availability`)
  await expect(page.getByRole('heading', { name: 'Room Availability' })).toBeVisible()

  await page.getByLabel('Next day').click()
  await page.getByLabel('Next day').click()
  await page.getByLabel('Next day').click()
  const viewedDate = addDays(pinnedNow, 3)
  await expect(page).toHaveURL(new RegExp(`/rooms/${formatDateParam(viewedDate)}/availability`))

  // The header's own "Add Meeting" link (see F.55's identical .first() usage in add-meeting.spec.ts
  // - the footer copy also exists in the DOM but is hidden by CSS at this desktop viewport).
  await page.getByRole('link', { name: 'Add Meeting' }).first().click()
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()

  // The actual assertion this case is about: the Date field defaults to the date that was being
  // viewed (today + 3 days), not the pinned clock's actual "today".
  await expectDateFieldShows(page.getByRole('group', { name: 'Date' }), viewedDate)
})
