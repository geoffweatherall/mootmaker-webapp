import { expect, test, type Page } from '@playwright/test'

/**
 * The cross-client guarantee: a booking made by one client appears on another's screen without a
 * refresh, and the client that made it does not flicker.
 *
 * These are the rows of the design's cross-client definition of done that a browser can actually
 * observe (mootmaker/designs/graphql-schema-and-caching.md). They are the only place the whole
 * chain is proven end to end - resolver Lambda, IAM-signed publish, @aws_subscribe, the realtime
 * socket, and the cache eviction - with a real user watching a real page.
 *
 * NO RETRIES, for the same reason as add-meeting.spec.ts: these accumulate state in a shared
 * environment, so a retry re-runs against an environment that also contains everything the failed
 * attempt created.
 */
test.describe.configure({ retries: 0, mode: 'serial' })

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

/**
 * A date far enough out that no other section's fixtures collide with it, and comfortably inside
 * the 180-day booking horizon. Relative to today rather than hardcoded: a fixed date silently
 * stops being bookable once the horizon or the retention boundary moves past it.
 */
function bookableDate(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

async function signInAsDemo(page: Page): Promise<void> {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(requireEnv('DEMO_USER_EMAIL'))
  await page.getByLabel('Password').fill(requireEnv('DEMO_USER_PASSWORD'))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
}

async function createRoom(page: Page, name: string, capacity: number): Promise<void> {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add room' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Capacity').fill(String(capacity))
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

async function createPerson(page: Page, name: string): Promise<void> {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add person' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

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

async function graphql<T>(page: Page, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await page.request.post(requireEnv('GRAPHQL_API_URL'), {
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    data: { query, variables },
  })
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] }
  if (body.errors?.length) {
    throw new Error(`GraphQL request failed: ${JSON.stringify(body.errors)}`)
  }
  return body.data as T
}

const REFERENCE_DATA = `query { workspace { rooms { id name } people { id name } } }`

const CREATE_MEETING = `
  mutation CreateMeeting($meeting: MeetingInput!) {
    createMeeting(meeting: $meeting) { meeting { id } errors }
  }
`

interface ReferenceData {
  workspace: { rooms: { id: string; name: string }[]; people: { id: string; name: string }[] }
}

/**
 * Books as a SECOND CLIENT, over the API rather than through this browser.
 *
 * Deliberate, and not a shortcut around the UI. The guarantee under test is "a change made
 * somewhere else reaches this screen", and the design's own list of sources names the nightly
 * demo-data run alongside another user - a direct API caller is a first-class case, not a stand-in
 * for one. It also avoids driving a locale-dependent DatePicker, which would make this test fail
 * for reasons that have nothing to do with real-time updates.
 */
async function bookViaApi(page: Page, token: string, options: {
  roomName: string
  organiserName: string
  subject: string
  date: string
}): Promise<void> {
  const reference = await graphql<ReferenceData>(page, token, REFERENCE_DATA, {})
  const room = reference.workspace.rooms.find((r) => r.name === options.roomName)
  const organiser = reference.workspace.people.find((p) => p.name === options.organiserName)
  if (!room || !organiser) {
    throw new Error(`Fixtures missing: room=${room?.id} organiser=${organiser?.id}`)
  }
  const result = await graphql<{ createMeeting: { errors: string[] } }>(page, token, CREATE_MEETING, {
    meeting: {
      roomId: room.id,
      organiserId: organiser.id,
      attendeeIds: [],
      subject: options.subject,
      startTime: `${options.date}T10:00:00`,
      endTime: `${options.date}T10:30:00`,
    },
  })
  if (result.createMeeting.errors.length > 0) {
    throw new Error(`Booking was rejected: ${result.createMeeting.errors.join(', ')}`)
  }
}

test('a booking made by another client appears without a refresh', async ({ browser }) => {
  const id = uniqueId()
  const date = bookableDate(21)
  const room = `Cross Client Room ${id}`
  const organiser = `Cross Client Organiser ${id}`
  const subject = `Cross client booking ${id}`

  // Its own context, so the observer has its own storage, its own session and its own WebSocket.
  const observer = await browser.newContext()
  try {
    const page = await observer.newPage()
    await signInAsDemo(page)
    await createRoom(page, room, 4)
    await createPerson(page, organiser)
    const token = await getIdToken(page)

    // Watching the day BEFORE the booking exists, and never reloading after this point. The room's
    // card is expanded once, up front, and must stay expanded (a pure local UI state, untouched by
    // the broadcast/refetch below) so the meeting appearing needs no further user action to see -
    // meetings only render inside an expanded card's Collapse, see RoomAvailabilityPage.tsx.
    await page.goto(`/rooms/${date}/availability`)
    await expect(page.getByText(room)).toBeVisible()
    const roomCard = page
      .getByText(room, { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
    // Status Chip before the booking - a future day (bookableDate) with no meetings yet reads
    // "Free all day" (statusForRoom's future-day branch). Asserted here, before expanding, so the
    // later post-broadcast assertion is a genuine before/after comparison of the same element
    // (mootmaker-webapp#92 - previously only the meeting row's own appearance was checked, not
    // whether the Chip driven by the same data actually updates too).
    await expect(roomCard.getByText('Free all day', { exact: true })).toBeVisible()
    await roomCard.getByRole('button', { name: /'s meetings/ }).click()
    await expect(page.getByText(subject)).toHaveCount(0)

    await bookViaApi(page, token, { roomName: room, organiserName: organiser, subject, date })

    // No reload, no navigation, no user action: the only thing that can make this appear is the
    // broadcast evicting the day and the refetch refilling it. Not a plain getByText(subject): the
    // card's own status sublabel can independently reference this meeting's subject too (see
    // roomAvailabilityLogic.ts) - only the meeting row itself has role 'button'.
    await expect(roomCard.getByRole('button', { name: subject, exact: false })).toBeVisible({ timeout: 30_000 })
    // The Chip updates from the same broadcast/refetch, not just the meeting row (mootmaker-webapp#92).
    await expect(roomCard.getByText('1 meeting', { exact: true })).toBeVisible()
  } finally {
    await observer.close()
  }
})

test('a booking made by another client updates the collapsed meeting count, not just the expanded row', async ({
  browser,
}) => {
  // mootmaker-webapp#93: the test above pre-expands the card, so the collapsed toggle label -
  // "See <day>'s meetings (N)" - is never on screen when the broadcast lands. This test leaves it
  // collapsed throughout, proving that count updates live too, with no click at all.
  const id = uniqueId()
  const date = bookableDate(22)
  const room = `Cross Client Count Room ${id}`
  const organiser = `Cross Client Count Organiser ${id}`
  const subject = `Cross client count booking ${id}`

  const observer = await browser.newContext()
  try {
    const page = await observer.newPage()
    await signInAsDemo(page)
    await createRoom(page, room, 4)
    await createPerson(page, organiser)
    const token = await getIdToken(page)

    await page.goto(`/rooms/${date}/availability`)
    await expect(page.getByText(room)).toBeVisible()
    const roomCard = page
      .getByText(room, { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
    // Collapsed, deliberately never clicked - the toggle's own label carries the count. Not a
    // literal "See <day>'s meetings" string: dayLabel is "Today"/"Tomorrow" only for the two near
    // days (dayRelativeLabel), the plain weekday name otherwise - bookableDate(22) lands on
    // whichever weekday that turns out to be, so match the count only.
    await expect(roomCard.getByRole('button', { name: /'s meetings \(0\)/ })).toBeVisible()

    await bookViaApi(page, token, { roomName: room, organiserName: organiser, subject, date })

    await expect(roomCard.getByRole('button', { name: /'s meetings \(1\)/ })).toBeVisible({
      timeout: 30_000,
    })
  } finally {
    await observer.close()
  }
})

test('a booking made by another client adds a segment to the timeline bar, live', async ({ browser }) => {
  // mootmaker-webapp#94/#75: the busy/free timeline bar is always rendered (not gated behind the
  // expand toggle), so this needs no click at all either.
  const id = uniqueId()
  const date = bookableDate(23)
  const room = `Cross Client Bar Room ${id}`
  const organiser = `Cross Client Bar Organiser ${id}`
  const subject = `Cross client bar booking ${id}`

  const observer = await browser.newContext()
  try {
    const page = await observer.newPage()
    await signInAsDemo(page)
    await createRoom(page, room, 4)
    await createPerson(page, organiser)
    const token = await getIdToken(page)

    await page.goto(`/rooms/${date}/availability`)
    await expect(page.getByText(room)).toBeVisible()
    const roomCard = page
      .getByText(room, { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')

    // The bar itself is deliberately aria-hidden (RoomAvailabilityPage.tsx - it's a purely visual
    // summary of information already available as text, so it carries no accessible role of its
    // own to query by, unlike the rest of this app's UI). Located structurally instead: it's the
    // element immediately before the "...'s meetings" toggle button in the DOM. Each meeting
    // renders exactly one child segment inside it.
    const bar = roomCard.getByRole('button', { name: /'s meetings/ }).locator('xpath=preceding-sibling::*[1]')
    const segmentsBefore = await bar.locator('> div').count()
    expect(segmentsBefore).toBe(0)

    await bookViaApi(page, token, { roomName: room, organiserName: organiser, subject, date })

    await expect(async () => {
      expect(await bar.locator('> div').count()).toBe(1)
    }).toPass({ timeout: 30_000 })
  } finally {
    await observer.close()
  }
})

test('a booking on a day being viewed does not disturb another day', async ({ browser }) => {
  // Row 3a of the cross-client table, and the row most likely to be mistaken for a defect later:
  // an invalidation names ONE date, so a client viewing a different date must be untouched.
  const id = uniqueId()
  const viewedDate = bookableDate(25)
  const bookedDate = bookableDate(26)
  const room = `Other Day Room ${id}`
  const organiser = `Other Day Organiser ${id}`
  const subject = `Other day booking ${id}`

  const observer = await browser.newContext()
  try {
    const page = await observer.newPage()
    await signInAsDemo(page)
    await createRoom(page, room, 4)
    await createPerson(page, organiser)
    const token = await getIdToken(page)

    await page.goto(`/rooms/${viewedDate}/availability`)
    await expect(page.getByText(room)).toBeVisible()

    await bookViaApi(page, token, { roomName: room, organiserName: organiser, subject, date: bookedDate })

    // The booking is real, but on another day - so it must never appear here. Waiting first, so
    // this is a genuine assertion of absence rather than a race the broadcast simply lost.
    await page.waitForTimeout(8_000)
    await expect(page.getByText(subject)).toHaveCount(0)
    await expect(page.getByText(room)).toBeVisible()
  } finally {
    await observer.close()
  }
})

test('the tab that made the booking does not lose it to its own broadcast', async ({ browser }) => {
  // Row 7 of the cross-client table. The booking tab is also a subscriber, so the server's
  // broadcast for this booking comes back to it. Without the self-invalidation guard it evicts the
  // Day its own mutation response just wrote authoritatively and re-renders empty while refetching
  // - the person who booked watching their own screen flicker, on every create.
  //
  // Booked through the real UI here, unlike the tests above, because the thing under test is
  // exactly the mutation RESPONSE populating the cache. An API call has no cache to disturb.
  // It uses the form's default date and times, so it never touches the locale-dependent
  // DatePicker: the default is today, which is always inside the bookable window.
  const id = uniqueId()
  const room = `Self Broadcast Room ${id}`
  const organiser = `Self Broadcast Organiser ${id}`
  const subject = `Self broadcast booking ${id}`

  const context = await browser.newContext()
  try {
    const page = await context.newPage()

    // Pinned to 10:00 so the form's default start/end don't drift near midnight - a run right
    // before midnight could otherwise default to a start/end pair spanning two calendar days,
    // which the API rejects (SpansMultipleDays), and the assertion below would fail blaming
    // real-time updates for what is actually the clock.
    //
    // Today's date rather than a hardcoded one: the day must stay inside the bookable window, and a
    // fixed date eventually drifts out of it.
    const tenAmToday = new Date()
    tenAmToday.setHours(10, 0, 0, 0)
    await page.clock.setFixedTime(tenAmToday)

    await signInAsDemo(page)
    await createRoom(page, room, 4)
    await createPerson(page, organiser)

    await page.goto('/meetings/add')
    await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
    await page.getByLabel('Subject').fill(subject)
    await page.getByRole('combobox', { name: 'Room' }).click()
    await page.getByRole('option', { name: room, exact: false }).click()
    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await page.getByRole('option', { name: organiser, exact: true }).click()
    await page.getByRole('button', { name: 'Save' }).click()

    // Lands on the availability page for the booked date, already holding the Day the mutation
    // returned - no fetch needed. The meeting only renders once its room's card is expanded (see
    // RoomAvailabilityPage.tsx), and stays expanded - a pure local UI state - for the rest of this
    // test.
    await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
    const roomCard = page
      .getByText(room, { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
    await roomCard.getByRole('button', { name: /'s meetings/ }).click()
    // Not a plain getByText(subject): the card's own status sublabel can independently reference
    // this meeting's subject too (see roomAvailabilityLogic.ts) - only the meeting row itself has
    // role 'button'.
    const meetingLink = roomCard.getByRole('button', { name: subject, exact: false })
    await expect(meetingLink).toBeVisible()

    // The broadcast round trip completes well inside this window. Asserted CONTINUOUSLY rather
    // than once at the end: a flicker is transient, so a single later assertion would pass right
    // through it and report nothing.
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      await expect(meetingLink).toBeVisible()
      await page.waitForTimeout(250)
    }
  } finally {
    await context.close()
  }
})
