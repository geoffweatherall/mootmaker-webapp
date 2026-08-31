import { expect, test, type Locator, type Page } from '@playwright/test'

// mootmaker/docs/reference/use-cases.md, section E (Room Availability), cases 26-37 except 30. E.30 ("no rooms
// exist yet") is covered separately by 00-room-availability-empty.spec.ts, which must run before
// any room-creating test in this environment - see that file's own header comment and
// e-room-availability.md's tc-e30 Notes. This file's name sorts after "00-...", so nothing special
// is needed here beyond simply never recreating that same "zero rooms" scenario.
//
// Every case here signs in as the demo user (a real, pre-verified, admin, Person-linked Cognito
// account present in every environment - see acceptance/README.md and add-meeting.spec.ts's own
// header comment) and pins page.clock.setFixedTime to a known business-hours weekday, for the same
// flakiness reason add-meeting.spec.ts already documents: RoomAvailabilityPage only ever renders
// business hours (08:00-17:00), so any test that depends on "today" or a meeting's default time
// needs a deterministic clock to avoid flaking whenever the suite happens to run outside that
// window. Every room/meeting subject below is suffixed with a fresh uniqueId() so repeated runs
// against the same shared environment, and other agents' concurrent runs against sections other
// than E, never collide.
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

// Local (not UTC) YYYY-MM-DD, matching RoomAvailabilityPage's own DATE_PARAM_FORMAT and how
// dayjs().format('YYYY-MM-DD') reads a pinned clock in the browser - using toISOString() here
// instead would silently shift by a day whenever the host's local timezone isn't UTC.
function formatDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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

// A meeting block's clickable element (the coloured ButtonBase-as-<a>) isn't reliably locatable by
// getByRole('link', { name: subject, exact: true }): MUI's Tooltip defaults to describeChild=false,
// which sets aria-label (not just a native `title`) to the *whole* tooltip string
// ("<subject>: <start>-<end>") on the child, which becomes the link's accessible name and so
// overrides its own visible text content - confirmed against a real run's accessibility snapshot
// (the link's computed name was "<subject>: 09:00-09:30", not just "<subject>"). The subject
// Typography is still the link's own single child, one DOM hop below it, so finding the text first
// and going up is unambiguous regardless of what the tooltip does to the accessible name.
function meetingBlock(page: Page, subject: string): Locator {
  return page.getByText(subject, { exact: true }).locator('xpath=..')
}

// RoomAvailabilityPage's grid accumulates every room ever created in a shared environment (rooms
// are never deleted), so an unscoped getByText(/Capacity \d+/) matches every room's capacity text
// once other specs have run first - confirmed against a real run ("resolved to 28 elements").
// Scoping to the specific room's own name-column Box (two DOM hops above its name Typography - see
// RoomAvailabilityPage.tsx: Typography(name) -> Stack(name row) -> Box(name column), which also
// directly contains the Capacity Typography as a sibling of that Stack) keys the check to exactly
// the room this test itself created.
function roomNameColumn(page: Page, roomName: string): Locator {
  return page.getByText(roomName, { exact: true }).locator('xpath=../..')
}

// A raw `.MuiPaper-root` CSS-class locator (unlike a role/label query) matches Layout.tsx's own
// chrome too, not just this page's own grid: the permanent sidebar Drawer's Paper is always in the
// DOM even when CSS-hidden at some viewports (a class selector doesn't respect display:none the
// way accessibility-tree-based queries do), and at mobile widths the fixed AppBar is a Paper as
// well - confirmed against real runs ("resolved to 6 elements" scoping E.31's link count across
// the sidebar's own nav links, "resolved to 3 elements" including the AppBar in E.36). The "08:00"
// hour mark is unique to this grid's own header row (only rendered at all once rooms exist), so
// walking up from it to the nearest MuiPaper-root ancestor reliably isolates just the grid.
function gridPaper(page: Page): Locator {
  return page
    .getByText('08:00', { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
}

test('E.26 - view room availability for today', async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Today Room E26 ${runId}`
  const pinnedNow = new Date('2026-08-19T10:00:00')
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, roomName, 4)

  await page.getByRole('link', { name: 'Room Availability' }).click()

  const today = formatDateParam(pinnedNow)
  await expect(page).toHaveURL(new RegExp(`/rooms/${today}/availability`))
  await expect(page.getByText('Showing business hours (08:00–17:00).')).toBeVisible()
  await expect(page.getByText(roomName, { exact: true })).toBeVisible()
  await expect(roomNameColumn(page, roomName).getByText(/Capacity \d+/)).toBeVisible()
  await expectDateFieldShows(dateNavGroup(page), pinnedNow)
})

test("E.27 - navigating to a future date shows that date's meeting", async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Future Room E27 ${runId}`
  const subject = `E27 future meeting ${runId}`
  const pinnedNow = new Date('2026-08-20T10:00:00')
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
  await expect(page.getByText(subject)).toBeVisible()
})

test('E.28 - navigating to a past date updates the URL and date picker', async ({ page }) => {
  const pinnedNow = new Date('2026-08-21T10:00:00')
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
  // A date early in its month, so the fixed +42-day jump below can't land on a day-of-month that
  // doesn't exist in the target month.
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

test('E.31 - rooms exist but none has meetings that day shows the grid, not the no-rooms empty state', async ({
  page,
}) => {
  const runId = uniqueId()
  const roomName = `Empty Day Room E31 ${runId}`
  // Far enough in the future to be collision-free with every other fixture in this catalog - see
  // e-room-availability.md's tc-e31 Notes. Isolation is also guaranteed structurally: this test
  // only ever checks its own freshly-created room, which by construction has no meetings on it yet
  // regardless of what date is used.
  const pinnedNow = new Date('2028-01-05T10:00:00')
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, roomName, 4)

  const today = formatDateParam(pinnedNow)
  await page.goto(`/rooms/${today}/availability`)

  await expect(page.getByText(roomName, { exact: true })).toBeVisible()
  await expect(roomNameColumn(page, roomName).getByText(/Capacity \d+/)).toBeVisible()
  await expect(page.getByText('No rooms exist yet.')).toHaveCount(0)
  // Meeting blocks are the only links rendered inside the grid's Paper - zero of them here proves
  // "no meetings that day" beyond just "the empty state didn't show". Scoped via gridPaper(), not
  // a raw '.MuiPaper-root' locator - see that helper's own comment for why (confirmed against a
  // real run: an unscoped locator also picked up the sidebar's own 6 nav links).
  await expect(gridPaper(page).getByRole('link')).toHaveCount(0)
})

test("E.32 - a meeting block's tooltip shows subject and time range, and clicking it navigates to Meeting Details", async ({
  page,
}) => {
  const runId = uniqueId()
  const roomName = `Tooltip Room E32 ${runId}`
  const subject = `E32 tooltip meeting ${runId}`
  const pinnedNow = new Date('2026-09-01T09:00:00')
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

  // MUI's Tooltip, with the default describeChild={false}, never sets a native `title` HTML
  // attribute at all (that only happens when describeChild is explicitly true) - it sets
  // aria-label on the child instead, unconditionally (not swapped for aria-describedby while
  // open, since that swap is also describeChild-only) - confirmed both against @mui/material's
  // own Tooltip source and a real run (asserting `title` failed with "Received: null"; the child's
  // actual aria-label was "<subject>: 09:00–09:30"). Reading it directly is far less flaky in
  // headless mode than triggering and waiting on a real hover-shown popper, per this case's own
  // catalog Notes.
  const meetingLink = meetingBlock(page, subject)
  await expect(meetingLink).toHaveAttribute('aria-label', `${subject}: 09:00–09:30`)

  await meetingLink.click()
  await expect(page).toHaveURL(/\/meetings\/.+/)
  await expect(page.getByRole('heading', { name: subject, level: 1 })).toBeVisible()
})

test('E.33 - overlapping meetings in different rooms render in their own lanes', async ({ page }) => {
  const runId = uniqueId()
  const roomAName = `Room A E33 ${runId}`
  const roomBName = `Room B E33 ${runId}`
  const subjectA = `E33 meeting A ${runId}`
  const subjectB = `E33 meeting B ${runId}`
  const pinnedNow = new Date('2026-09-02T09:00:00')
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

  // Each room's row is 3 DOM levels above its name Typography - see RoomAvailabilityPage.tsx:
  // Typography(name) -> Stack(name row) -> Box(name column) -> Box(the room's own row).
  const roomARow = page.getByText(roomAName, { exact: true }).locator('xpath=../../..')
  const roomBRow = page.getByText(roomBName, { exact: true }).locator('xpath=../../..')

  await expect(roomARow.getByText(subjectA, { exact: true })).toBeVisible()
  await expect(roomARow.getByText(subjectB, { exact: true })).toHaveCount(0)
  await expect(roomBRow.getByText(subjectB, { exact: true })).toBeVisible()
  await expect(roomBRow.getByText(subjectA, { exact: true })).toHaveCount(0)

  await roomARow.getByText(subjectA, { exact: true }).click()
  await expect(page).toHaveURL(/\/meetings\/.+/)
  await expect(page.getByRole('heading', { name: subjectA, level: 1 })).toBeVisible()

  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Room Availability' })).toBeVisible()
  const roomBRowAfterBack = page.getByText(roomBName, { exact: true }).locator('xpath=../../..')
  await roomBRowAfterBack.getByText(subjectB, { exact: true }).click()
  await expect(page).toHaveURL(/\/meetings\/.+/)
  await expect(page.getByRole('heading', { name: subjectB, level: 1 })).toBeVisible()
})

test('E.34 - back-to-back meetings in the same room both succeed and render as distinct, non-overlapping blocks', async ({
  page,
}) => {
  const runId = uniqueId()
  const roomName = `Back To Back Room E34 ${runId}`
  const subject1 = `E34 first meeting ${runId}`
  const subject2 = `E34 second meeting ${runId}`
  const pinnedNow = new Date('2026-09-03T08:00:00')
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
  await expect(page.getByText(subject1)).toBeVisible()

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
  await expect(page.getByText(subject2)).toBeVisible()

  const block1 = meetingBlock(page, subject1)
  const block2 = meetingBlock(page, subject2)
  const box1 = await block1.boundingBox()
  const box2 = await block2.boundingBox()
  if (!box1 || !box2) {
    throw new Error('Could not read bounding boxes for the two meeting blocks.')
  }
  // Block 1's right edge <= block 2's left edge (+1px for sub-pixel rounding) - no horizontal
  // pixel overlap between the two.
  expect(box1.x + box1.width).toBeLessThanOrEqual(box2.x + 1)
})

test('E.35 - room colour is consistent between Room Availability and Person Calendar', async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Colour Match Room E35 ${runId}`
  const subject = `E35 colour match meeting ${runId}`
  const pinnedNow = new Date('2026-09-08T10:00:00')
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, roomName, 4)

  // Left at the Date field's default (today, same as the pinned clock), so this meeting falls
  // inside Person Calendar's own 6-week window computed from that same pinned "now".
  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(subject)
  await selectRoom(page, roomName)
  await setTime(page, 'Start time', 10, 0)
  await setTime(page, 'End time', 10, 30)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
  await expect(page.getByText(subject)).toBeVisible()

  const availabilityDot = page.getByText(roomName, { exact: true }).locator('xpath=preceding-sibling::div[1]')
  const availabilityColor = await availabilityDot.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(availabilityColor).toBeTruthy()

  // Rather than guessing/hardcoding the demo user's own Person id, get there the same way a real
  // user would: the sidebar's "Calendar" nav link defaults to the signed-in user's own calendar.
  await goToOwnCalendar(page)
  const meetingRow = page.locator('a').filter({ hasText: subject })
  const calendarDot = meetingRow.locator('div').first()
  const calendarColor = await calendarDot.evaluate((el) => getComputedStyle(el).backgroundColor)

  expect(calendarColor).toBe(availabilityColor)
})

test('E.36 - mobile viewport: grid scrolls horizontally, the room column stays pinned, and scroll-fade hints track the edges', async ({
  page,
}) => {
  const runId = uniqueId()
  const roomName = `Scroll Room E36 ${runId}`
  const pinnedNow = new Date('2026-09-04T10:00:00')
  await page.clock.setFixedTime(pinnedNow)
  // Signs in at the default (desktop) viewport first, then switches to mobile - signInAsDemo's own
  // "Sign out" check targets the sidebar's Drawer, which Layout.tsx hides via CSS (not unmounts) at
  // narrow widths, so doing this the other way around leaves that text attached but never visible
  // (confirmed against a real run: "unexpected value 'hidden'"). This doesn't change what E.36
  // itself is testing, since sign-in isn't part of this case's own assertions.
  await signInAsDemo(page)
  // A typical mobile width, well under the grid's own 720px minWidth so it's guaranteed scrollable
  // regardless of the outer Container's own breakpoint - see e-room-availability.md's tc-e36 Notes.
  await page.setViewportSize({ width: 375, height: 667 })
  await createRoom(page, roomName, 4)

  const today = formatDateParam(pinnedNow)
  await page.goto(`/rooms/${today}/availability`)
  await expect(page.getByText(roomName, { exact: true })).toBeVisible()

  // The only `div[aria-hidden="true"]` elements this page ever renders are the two scroll-fade
  // hints themselves (confirmed against RoomAvailabilityPage.tsx's own source) - each is only
  // mounted at all while its edge is actually scrollable, so exactly one exists at either extreme.
  const fadeHint = page.locator('div[aria-hidden="true"]')
  const roomNameLocator = page.getByText(roomName, { exact: true })

  await expect(fadeHint).toHaveCount(1)
  const rightFadeBox = await fadeHint.boundingBox()
  const xBeforeScroll = (await roomNameLocator.boundingBox())!.x

  // gridPaper(page), not a raw '.MuiPaper-root' locator - see that helper's own comment for why
  // (confirmed against a real run: an unscoped locator at this mobile viewport also matched the
  // fixed AppBar and the Drawer's own Paper, "resolved to 3 elements").
  await gridPaper(page).evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })

  await expect(fadeHint).toHaveCount(1)
  const leftFadeBox = await fadeHint.boundingBox()
  const xAfterScroll = (await roomNameLocator.boundingBox())!.x

  if (!rightFadeBox || !leftFadeBox) {
    throw new Error('Could not read the scroll-fade hint bounding box.')
  }
  // The right-edge hint (sx: right: 0) sits further right than the left-edge hint (sx: left: 200)
  // ever does - a relative comparison rather than an absolute pixel expectation, so it doesn't
  // depend on the outer Container's exact computed offset.
  expect(leftFadeBox.x).toBeLessThan(rightFadeBox.x)
  // The sticky (position: sticky; left: 0) room-name column doesn't move as the grid scrolls.
  expect(Math.abs(xAfterScroll - xBeforeScroll)).toBeLessThan(1)
})

test('E.37 - "Add Meeting" from this page pre-fills the currently viewed date, not today', async ({ page }) => {
  const pinnedNow = new Date('2026-08-24T10:00:00')
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
