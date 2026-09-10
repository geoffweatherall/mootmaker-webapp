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

    // Watching the day BEFORE the booking exists, and never reloading after this point.
    await page.goto(`/rooms/${date}/availability`)
    await expect(page.getByText(room)).toBeVisible()
    await expect(page.getByText(subject)).toHaveCount(0)

    await bookViaApi(page, token, { roomName: room, organiserName: organiser, subject, date })

    // No reload, no navigation, no user action: the only thing that can make this appear is the
    // broadcast evicting the day and the refetch refilling it.
    await expect(page.getByText(subject)).toBeVisible({ timeout: 30_000 })
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
    await page.getByRole('button', { name: 'Add meeting' }).click()

    // Lands on the availability page for the booked date, already holding the Day the mutation
    // returned - no fetch needed.
    await expect(page.getByText(subject)).toBeVisible()

    // The broadcast round trip completes well inside this window. Asserted CONTINUOUSLY rather
    // than once at the end: a flicker is transient, so a single later assertion would pass right
    // through it and report nothing.
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      await expect(page.getByText(subject)).toBeVisible()
      await page.waitForTimeout(250)
    }
  } finally {
    await context.close()
  }
})
