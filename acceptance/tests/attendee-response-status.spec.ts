import { expect, test, type Page } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount } from '../../support/testAccount'
import { pinnedWeekday, formatDateParam } from './support/pinnedDates'

/**
 * designs/attendee-response-status.md's acceptance-layer coverage: the feature itself (response
 * control, status display, Home page redesign) against a real deployed environment, plus the two
 * concurrency shapes the design specifically calls for real DynamoDB conflict-retry proof of (see
 * RespondToMeetingHandler's own class javadoc) - mootmaker-api's unit tests already pin the
 * handler's retry LOGIC against a fake client; only a real table actually produces a genuine
 * ConditionalCheckFailedException to retry against.
 *
 * NO RETRIES, same reasoning as cross-client-updates.spec.ts: these accumulate state in a shared
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

async function signInAsDemo(page: Page): Promise<void> {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(requireEnv('DEMO_USER_EMAIL'))
  await page.getByLabel('Password').fill(requireEnv('DEMO_USER_PASSWORD'))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
}

/** A genuinely fresh, real, confirmed account with its own linked Person - see cognitoAdmin.ts. */
async function signInAsFreshAccount(page: Page): Promise<{ name: string; email: string }> {
  const account = freshTestAccount()
  await createConfirmedTestAccount(account)
  await page.goto('/signin')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
  return account
}

async function createRoom(page: Page, name: string, capacity: number): Promise<void> {
  await page.goto('/rooms')
  await page.getByRole('button', { name: 'Add room' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Capacity').fill(String(capacity))
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

async function myPersonId(page: Page, token: string): Promise<string> {
  const result = await graphql<{ workspace: { me: { id: string } | null } }>(
    page,
    token,
    `query { workspace { me { id } } }`,
    {},
  )
  if (!result.workspace.me) {
    throw new Error('Signed-in account has no linked Person')
  }
  return result.workspace.me.id
}

const CREATE_MEETING = `
  mutation CreateMeeting($meeting: MeetingInput!) {
    createMeeting(meeting: $meeting) { meeting { id } errors }
  }
`

/** Books a meeting with explicit attendees, over the API - see cross-client-updates.spec.ts's own
 * bookViaApi for why a direct API call is a first-class setup path here, not a shortcut around the
 * UI: precise attendeeIds control is what every test below actually needs. */
async function createMeetingViaApi(
  page: Page,
  token: string,
  options: { roomId: string; organiserId: string; attendeeIds: string[]; subject: string; date: string; startTime?: string },
): Promise<string> {
  const start = options.startTime ?? '10:00:00'
  const result = await graphql<{ createMeeting: { meeting: { id: string } | null; errors: string[] } }>(
    page,
    token,
    CREATE_MEETING,
    {
      meeting: {
        roomId: options.roomId,
        organiserId: options.organiserId,
        attendeeIds: options.attendeeIds,
        subject: options.subject,
        startTime: `${options.date}T${start}`,
        endTime: `${options.date}T${addMinutes(start, 30)}`,
      },
    },
  )
  if (!result.createMeeting.meeting) {
    throw new Error(`Booking was rejected: ${result.createMeeting.errors.join(', ')}`)
  }
  return result.createMeeting.meeting.id
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`
}

const RESPOND_TO_MEETING = `
  mutation RespondToMeeting($meetingId: ID!, $status: AttendeeStatus!) {
    respondToMeeting(meetingId: $meetingId, status: $status) { meeting { id } errors }
  }
`

async function respondViaApi(
  page: Page,
  token: string,
  meetingId: string,
  status: 'Going' | 'NotGoing' | 'Maybe',
): Promise<{ errors: string[] }> {
  const result = await graphql<{ respondToMeeting: { meeting: { id: string } | null; errors: string[] } }>(
    page,
    token,
    RESPOND_TO_MEETING,
    { meetingId, status },
  )
  return { errors: result.respondToMeeting.errors }
}

async function readAttendeeStatuses(
  page: Page,
  token: string,
  meetingId: string,
): Promise<Record<string, string>> {
  const result = await graphql<{
    meeting: { attendees: { person: { id: string }; status: string }[] } | null
  }>(page, token, `query($id: ID!) { meeting(id: $id) { attendees { person { id } status } } }`, { id: meetingId })
  if (!result.meeting) {
    throw new Error(`Meeting ${meetingId} not found`)
  }
  return Object.fromEntries(result.meeting.attendees.map((a) => [a.person.id, a.status]))
}

test('Home page shows a real "Needs your response" card, and quick-respond updates it and Today live', async ({
  browser,
}) => {
  const id = uniqueId()
  const room = `Response Status Room ${id}`
  const organiser = `Response Status Organiser ${id}`
  const subject = `Response status meeting ${id}`

  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const pinnedNow = pinnedWeekday('Wednesday')
    await page.clock.setFixedTime(pinnedNow)

    await signInAsDemo(page)
    await createRoom(page, room, 4)
    const token = await getIdToken(page)
    const meId = await myPersonId(page, token)

    // Reference data for the room id, then an organiser created via the admin-only Persons page
    // (createPerson helper elsewhere in this suite) so Demo User can be an ATTENDEE, not the
    // organiser - Add Meeting's own default would otherwise make Demo User the organiser, who has
    // no status to respond with.
    await page.goto('/persons')
    await page.getByRole('button', { name: 'Add person' }).click()
    const personDialog = page.getByRole('dialog')
    await personDialog.getByLabel('Name').fill(organiser)
    await personDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(organiser)).toBeVisible()

    const reference = await graphql<{
      workspace: { rooms: { id: string; name: string }[]; people: { id: string; name: string }[] }
    }>(page, token, `query { workspace { rooms { id name } people { id name } } }`, {})
    const roomId = reference.workspace.rooms.find((r) => r.name === room)!.id
    const organiserId = reference.workspace.people.find((p) => p.name === organiser)!.id

    const date = formatDateParam(pinnedNow)
    const meetingId = await createMeetingViaApi(page, token, {
      roomId,
      organiserId,
      attendeeIds: [meId],
      subject,
      date,
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Needs your response' })).toBeVisible()
    const card = page.getByRole('region', { name: subject, exact: true })
    await expect(card).toBeVisible({ timeout: 15_000 })

    await card.getByRole('button', { name: 'Going', exact: true }).click()

    await expect(page.getByRole('region', { name: subject, exact: true })).toHaveCount(0, { timeout: 15_000 })
    const todayCard = page.getByRole('button', { name: new RegExp(subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    await expect(todayCard.getByRole('img', { name: 'Going', exact: true })).toBeVisible()

    // And the write actually reached the server, not just this tab's own optimistic-looking UI.
    const statuses = await readAttendeeStatuses(page, token, meetingId)
    expect(statuses[meId]).toBe('Going')

    // Detail sheet: "You" plus a working control, matching the mocked-integration coverage but
    // against the real API this time.
    await todayCard.click()
    const control = page.getByRole('group', { name: 'Your response' })
    await expect(control).toBeVisible()
    await expect(control.getByRole('button', { name: 'Going', exact: true, pressed: true })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('two different attendees of the same meeting responding at once both land - real DynamoDB conflict retry', async ({
  browser,
}) => {
  const id = uniqueId()
  const room = `Concurrent Same Meeting Room ${id}`
  const subject = `Concurrent same-meeting response ${id}`

  // Three separate contexts, one per real identity - Demo User (attendee 1), and two fresh
  // accounts (organiser, attendee 2). Not a shortcut: two pages sharing one BrowserContext share
  // its localStorage/cookies too, so a second sign-in in the same context would silently replace
  // the first tab's session. Each captured token is a plain JWT string used explicitly in every
  // request below, independent of whatever a page's own localStorage holds by the time it's used.
  const demoContext = await browser.newContext()
  const organiserContext = await browser.newContext()
  const secondAttendeeContext = await browser.newContext()
  try {
    const pinnedNow = pinnedWeekday('Thursday')

    const demoPage = await demoContext.newPage()
    await demoPage.clock.setFixedTime(pinnedNow)
    await signInAsDemo(demoPage)
    await createRoom(demoPage, room, 4)
    const demoToken = await getIdToken(demoPage)
    const demoPersonId = await myPersonId(demoPage, demoToken)

    const organiserPage = await organiserContext.newPage()
    await organiserPage.clock.setFixedTime(pinnedNow)
    await signInAsFreshAccount(organiserPage)
    const organiserToken = await getIdToken(organiserPage)
    const organiserPersonId = await myPersonId(organiserPage, organiserToken)

    const secondAttendeePage = await secondAttendeeContext.newPage()
    await secondAttendeePage.clock.setFixedTime(pinnedNow)
    await signInAsFreshAccount(secondAttendeePage)
    const secondToken = await getIdToken(secondAttendeePage)
    const secondPersonId = await myPersonId(secondAttendeePage, secondToken)

    const reference = await graphql<{ workspace: { rooms: { id: string; name: string }[] } }>(
      demoPage,
      demoToken,
      `query { workspace { rooms { id name } } }`,
      {},
    )
    const roomId = reference.workspace.rooms.find((r) => r.name === room)!.id
    const date = formatDateParam(pinnedNow)

    const meetingId = await createMeetingViaApi(organiserPage, organiserToken, {
      roomId,
      organiserId: organiserPersonId,
      attendeeIds: [demoPersonId, secondPersonId],
      subject,
      date,
    })

    // Fired together, not awaited one after the other - the whole point is making both writers'
    // read-modify-write windows overlap on the SAME day item, so the second one to reach DynamoDB
    // hits a real ConditionalCheckFailedException and must retry rather than clobber the first.
    const [demoResult, secondResult] = await Promise.all([
      respondViaApi(demoPage, demoToken, meetingId, 'Going'),
      respondViaApi(secondAttendeePage, secondToken, meetingId, 'Maybe'),
    ])
    expect(demoResult.errors).toEqual([])
    expect(secondResult.errors).toEqual([])

    const statuses = await readAttendeeStatuses(demoPage, demoToken, meetingId)
    expect(statuses[demoPersonId]).toBe('Going')
    expect(statuses[secondPersonId]).toBe('Maybe')
  } finally {
    await demoContext.close()
    await organiserContext.close()
    await secondAttendeeContext.close()
  }
})

test('one person responding to two different meetings on the same day both land - they share one day item', async ({
  browser,
}) => {
  // The sharper of the two concurrency shapes (see this design's Technical considerations):
  // storage is one DynamoDB item per DAY, not per meeting, so these two "independent-looking"
  // writes actually contend on the exact same optimistic lock.
  const id = uniqueId()
  const roomA = `Same Day A Room ${id}`
  const roomB = `Same Day B Room ${id}`
  const subjectA = `Same day meeting A ${id}`
  const subjectB = `Same day meeting B ${id}`

  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const pinnedNow = pinnedWeekday('Friday')
    await page.clock.setFixedTime(pinnedNow)
    await signInAsDemo(page)
    await createRoom(page, roomA, 4)
    await createRoom(page, roomB, 4)
    const token = await getIdToken(page)
    const meId = await myPersonId(page, token)

    await page.goto('/persons')
    const organiserName = `Same Day Organiser ${id}`
    await page.getByRole('button', { name: 'Add person' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(organiserName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(organiserName)).toBeVisible()

    const reference = await graphql<{
      workspace: { rooms: { id: string; name: string }[]; people: { id: string; name: string }[] }
    }>(page, token, `query { workspace { rooms { id name } people { id name } } }`, {})
    const roomAId = reference.workspace.rooms.find((r) => r.name === roomA)!.id
    const roomBId = reference.workspace.rooms.find((r) => r.name === roomB)!.id
    const organiserId = reference.workspace.people.find((p) => p.name === organiserName)!.id
    const date = formatDateParam(pinnedNow)

    const meetingAId = await createMeetingViaApi(page, token, {
      roomId: roomAId,
      organiserId,
      attendeeIds: [meId],
      subject: subjectA,
      date,
      startTime: '09:00:00',
    })
    const meetingBId = await createMeetingViaApi(page, token, {
      roomId: roomBId,
      organiserId,
      attendeeIds: [meId],
      subject: subjectB,
      date,
      startTime: '14:00:00',
    })

    const [resultA, resultB] = await Promise.all([
      respondViaApi(page, token, meetingAId, 'Going'),
      respondViaApi(page, token, meetingBId, 'NotGoing'),
    ])
    expect(resultA.errors).toEqual([])
    expect(resultB.errors).toEqual([])

    const [statusesA, statusesB] = await Promise.all([
      readAttendeeStatuses(page, token, meetingAId),
      readAttendeeStatuses(page, token, meetingBId),
    ])
    expect(statusesA[meId]).toBe('Going')
    expect(statusesB[meId]).toBe('NotGoing')
  } finally {
    await context.close()
  }
})

test('a response made by another client is reflected live, without a refresh', async ({ browser }) => {
  const id = uniqueId()
  const room = `Cache Convergence Room ${id}`
  const subject = `Cache convergence meeting ${id}`

  const observerContext = await browser.newContext()
  const otherContext = await browser.newContext()
  try {
    const observer = await observerContext.newPage()
    const pinnedNow = pinnedWeekday('Monday', { weeks: 1 })
    await observer.clock.setFixedTime(pinnedNow)
    await signInAsDemo(observer)
    await createRoom(observer, room, 4)
    const observerToken = await getIdToken(observer)
    const observerPersonId = await myPersonId(observer, observerToken)

    const otherPage = await otherContext.newPage()
    await otherPage.clock.setFixedTime(pinnedNow)
    await signInAsFreshAccount(otherPage)
    const otherToken = await getIdToken(otherPage)
    const otherPersonId = await myPersonId(otherPage, otherToken)

    const reference = await graphql<{ workspace: { rooms: { id: string; name: string }[] } }>(
      observer,
      observerToken,
      `query { workspace { rooms { id name } } }`,
      {},
    )
    const roomId = reference.workspace.rooms.find((r) => r.name === room)!.id
    const date = formatDateParam(pinnedNow)

    // The observer organises and attends nothing themselves - the other account is the sole
    // attendee, so its OWN status change is what the observer's screen must pick up live.
    const meetingId = await createMeetingViaApi(observer, observerToken, {
      roomId,
      organiserId: observerPersonId,
      attendeeIds: [otherPersonId],
      subject,
      date,
    })

    // Watching this meeting's detail sheet before the response exists, never reloading after.
    await observer.goto('/')
    await expect(observer.getByRole('heading', { name: 'Needs your response' })).toBeVisible()
    const todayCard = observer.getByRole('button', { name: new RegExp(subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    await expect(todayCard).toBeVisible({ timeout: 15_000 })
    await todayCard.click()
    await expect(observer.getByRole('img', { name: 'No response', exact: true })).toBeVisible()

    await respondViaApi(otherPage, otherToken, meetingId, 'Going')

    // No reload, no navigation: only the daysInvalidated broadcast + refetch can make this change.
    await expect(observer.getByRole('img', { name: 'Going', exact: true })).toBeVisible({ timeout: 30_000 })
  } finally {
    await observerContext.close()
    await otherContext.close()
  }
})
