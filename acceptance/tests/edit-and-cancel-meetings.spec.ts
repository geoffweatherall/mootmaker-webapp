import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount } from '../../support/testAccount'
import { formatDateParam, pinnedWeekday } from './support/pinnedDates'

/**
 * designs/edit-and-cancel-meetings.md's acceptance-layer coverage: the cases that genuinely need a
 * real deployed environment to prove, rather than re-running what
 * webapp/tests/meeting-edit-and-cancel.spec.ts already proves thoroughly against the mock -
 * forced server-side authorization (O.116, the same shape as L.90/L.91), a genuine
 * MeetingNotFound outcome from a real DynamoDB table (O.119), the cross-day
 * DayRepository.moveMeeting pointer-repoint mechanism (O.121), and the two live-update cases a
 * real AppSync subscription is required to prove at all (M.112/M.113 - MSW has no subscription
 * transport, so the mocked layer stands in with a visibility-triggered refetch instead; only here
 * is the real daysInvalidated broadcast actually exercised end to end for these two mutations).
 * See o-edit-and-cancel-meetings.md and m-cross-cutting.md for the full case catalog, including
 * the cases deliberately left Planned because the Integration layer already covers them and this
 * file's job is the real-infrastructure proof, not a third copy of the same assertions.
 *
 * NO RETRIES, same reasoning as attendee-response-status.spec.ts and cross-client-updates.spec.ts:
 * these accumulate state in a shared environment, so a retry re-runs against an environment that
 * also contains everything the failed attempt created.
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

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
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

/** Raw request, no throw-on-error - for the cases under test where a top-level `errors` array
 * IS the expected outcome (O.116's forced-rejection case, mirroring authorization-boundaries.spec.ts's
 * own createRoomResponse/updateRoomBody handling). */
async function rawGraphql(
  request: APIRequestContext,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; errors?: unknown[] }> {
  const response = await request.post(requireEnv('GRAPHQL_API_URL'), {
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    data: { query, variables },
  })
  return response.json()
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

/** Extracts the signed-in user's real Cognito ID token straight from localStorage - see
 * authorization-boundaries.spec.ts's own copy for why this, not getIdToken's `.idToken` suffix
 * match, is used specifically where a fresh account (not the demo user) just signed in: both key
 * shapes exist in this app's localStorage, and this is the form the other forced-rejection tests
 * already rely on. */
async function extractIdToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith('CognitoIdentityServiceProvider.') && k.endsWith('.idToken'),
    )
    return key ? localStorage.getItem(key) : null
  })
  if (!token) {
    throw new Error('Could not find a Cognito idToken in localStorage - is the page signed in?')
  }
  return token
}

/** M2M admin-equivalent token via OAuth2 client_credentials - see authorization-boundaries.spec.ts's
 * own copy for the full explanation of what this is and why it is safe to use for fixture setup
 * (a real createRoom call through the real handler) as well as, here, for the "another client"
 * side of the two live-update cases, where the point under test is the OBSERVER's page updating,
 * not who the editor happens to be. */
async function fetchAdminAccessToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(requireEnv('COGNITO_TOKEN_URL'), {
    form: {
      grant_type: 'client_credentials',
      client_id: requireEnv('COGNITO_TEST_CLIENT_ID'),
      client_secret: requireEnv('COGNITO_TEST_CLIENT_SECRET'),
      scope: requireEnv('COGNITO_TEST_SCOPE'),
    },
  })
  const body = await response.json()
  if (!body.access_token) {
    throw new Error(`Cognito token endpoint returned no access_token: ${JSON.stringify(body)}`)
  }
  return body.access_token as string
}

const CREATE_MEETING = `
  mutation CreateMeeting($meeting: MeetingInput!) {
    createMeeting(meeting: $meeting) { meeting { id } errors }
  }
`

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

const UPDATE_MEETING = `
  mutation UpdateMeeting($id: ID!, $meeting: MeetingInput!) {
    updateMeeting(id: $id, meeting: $meeting) { meeting { id } errors }
  }
`

const CANCEL_MEETING = `
  mutation CancelMeeting($id: ID!) {
    cancelMeeting(id: $id) { errors }
  }
`

/** Opens a meeting's detail sheet via Room Availability, matching
 * meeting-detail-survives-refetch.spec.ts's and meeting-edit-and-cancel.spec.ts's own established
 * pattern - shows every meeting in a room that day regardless of the viewer's own relationship to
 * it, which every test below needs since the observer here is always the meeting's organiser but
 * the pattern is deliberately kept identical to the Integration layer's own for the same reason it
 * was chosen there. Assumes `page` is already on `/rooms/<date>/availability`. */
async function openMeetingDetail(page: Page, roomName: string, subject: string): Promise<void> {
  const roomCard = page
    .getByText(roomName, { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
  await roomCard.getByRole('button', { name: /'s meetings/ }).click()
  await roomCard.getByRole('button', { name: subject, exact: false }).click()
  await expect(page.getByRole('main').getByRole('button', { name: 'Close' })).toBeVisible()
}

test('O.116 - a user who is neither organiser nor admin calling updateMeeting/cancelMeeting directly is rejected server-side', async ({
  page,
  request,
  browser,
}) => {
  const id = uniqueId()
  const room = `O116 Room ${id}`
  const subject = `O116 meeting ${id}`
  const pinnedNow = pinnedWeekday('Tuesday')
  const date = formatDateParam(pinnedNow)

  // Organiser: the demo user, a genuinely real account with a linked Person.
  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, room, 4)
  const organiserToken = await getIdToken(page)
  const organiserId = await myPersonId(page, organiserToken)

  const reference = await graphql<{ workspace: { rooms: { id: string; name: string }[] } }>(
    page,
    organiserToken,
    `query { workspace { rooms { id name } } }`,
    {},
  )
  const roomId = reference.workspace.rooms.find((r) => r.name === room)!.id

  const meetingId = await createMeetingViaApi(page, organiserToken, {
    roomId,
    organiserId,
    attendeeIds: [],
    subject,
    date,
  })

  // A genuinely third-party account - neither this meeting's organiser nor an admin. A fresh,
  // separate context so signing it in does not clobber the organiser's own session in `page`.
  const strangerContext = await browser.newContext()
  try {
    const account = freshTestAccount()
    await createConfirmedTestAccount(account)
    const strangerPage = await strangerContext.newPage()
    await signIn(strangerPage, account.email, account.password)
    const strangerToken = await extractIdToken(strangerPage)

    const updateResult = await rawGraphql(request, strangerToken, UPDATE_MEETING, {
      id: meetingId,
      meeting: {
        roomId,
        organiserId,
        attendeeIds: [],
        subject: `${subject} (hijacked)`,
        startTime: `${date}T10:00:00`,
        endTime: `${date}T10:30:00`,
      },
    })
    const cancelResult = await rawGraphql(request, strangerToken, CANCEL_MEETING, { id: meetingId })

    // Identity's organiser-or-admin check throws, surfaced as a top-level GraphQL `errors` array -
    // the same channel L.90/L.91 already proved for requireAdmin and the isAdmin-or-self check, not
    // a structured UpdateMeetingResult.errors/CancelMeetingResult.errors entry.
    for (const body of [updateResult, cancelResult]) {
      expect(Array.isArray(body.errors) && body.errors.length > 0).toBe(true)
    }
    expect(updateResult.data?.updateMeeting ?? null).toBeNull()
    expect(cancelResult.data?.cancelMeeting ?? null).toBeNull()
  } finally {
    await strangerContext.close()
  }

  // The meeting is unchanged afterward - confirming the rejection wasn't just a response-shape
  // artefact, using the organiser's own token to re-read it.
  const after = await graphql<{ meeting: { subject: string } | null }>(
    page,
    organiserToken,
    `query($id: ID!) { meeting(id: $id) { subject } }`,
    { id: meetingId },
  )
  expect(after.meeting).not.toBeNull()
  expect(after.meeting!.subject).toBe(subject)
})

test('O.119 - the second of two cancellations of the same meeting gets MeetingNotFound, not a crash or silent success', async ({
  page,
  request,
}) => {
  const id = uniqueId()
  const room = `O119 Room ${id}`
  const subject = `O119 meeting ${id}`
  const pinnedNow = pinnedWeekday('Wednesday')
  const date = formatDateParam(pinnedNow)

  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, room, 4)
  const token = await getIdToken(page)
  const organiserId = await myPersonId(page, token)

  const reference = await graphql<{ workspace: { rooms: { id: string; name: string }[] } }>(
    page,
    token,
    `query { workspace { rooms { id name } } }`,
    {},
  )
  const roomId = reference.workspace.rooms.find((r) => r.name === room)!.id

  const meetingId = await createMeetingViaApi(page, token, { roomId, organiserId, attendeeIds: [], subject, date })

  const adminToken = await fetchAdminAccessToken(request)

  const first = await rawGraphql(request, adminToken, CANCEL_MEETING, { id: meetingId })
  const firstErrors = (first.data?.cancelMeeting as { errors: string[] } | undefined)?.errors
  expect(firstErrors).toEqual([])

  // Sequential, deliberately - a genuine simultaneous race is DayRepository's own retry-under-
  // ConditionalCheckFailedException concern (proved against a real table at mootmaker-api's own
  // DayRepositoryTest against a fake client, and structurally identical to what M.109/M.110 prove
  // for respondToMeeting here). This is about the OUTCOME of the meeting already being gone by the
  // time the second call runs, not the storage-layer mechanics of two writers landing at once.
  const second = await rawGraphql(request, adminToken, CANCEL_MEETING, { id: meetingId })
  const secondErrors = (second.data?.cancelMeeting as { errors: string[] } | undefined)?.errors
  expect(secondErrors).toEqual(['MeetingNotFound'])
})

test('O.121 - editing a meeting to a different date moves it there, without changing its identity', async ({
  page,
}) => {
  const id = uniqueId()
  const room = `O121 Room ${id}`
  const subject = `O121 meeting ${id}`
  const pinnedNow = pinnedWeekday('Thursday')
  const dateA = formatDateParam(pinnedWeekday('Thursday'))
  const dateB = formatDateParam(pinnedWeekday('Friday'))

  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, room, 4)
  const token = await getIdToken(page)
  const organiserId = await myPersonId(page, token)

  const reference = await graphql<{ workspace: { rooms: { id: string; name: string }[] } }>(
    page,
    token,
    `query { workspace { rooms { id name } } }`,
    {},
  )
  const roomId = reference.workspace.rooms.find((r) => r.name === room)!.id

  const meetingId = await createMeetingViaApi(page, token, { roomId, organiserId, attendeeIds: [], subject, date: dateA })

  const moved = await graphql<{ updateMeeting: { meeting: { id: string } | null; errors: string[] } }>(
    page,
    token,
    UPDATE_MEETING,
    {
      id: meetingId,
      meeting: {
        roomId,
        organiserId,
        attendeeIds: [],
        subject,
        startTime: `${dateB}T10:00:00`,
        endTime: `${dateB}T10:30:00`,
      },
    },
  )
  expect(moved.updateMeeting.errors).toEqual([])
  expect(moved.updateMeeting.meeting?.id).toBe(meetingId)

  const days = await graphql<{ workspace: { days: { date: string; meetings: { id: string }[] }[] } }>(
    page,
    token,
    `query($dates: [String!]) { workspace(dates: $dates) { days { date meetings { id } } } }`,
    { dates: [dateA, dateB] },
  )
  const dayA = days.workspace.days.find((d) => d.date === dateA)!
  const dayB = days.workspace.days.find((d) => d.date === dateB)!
  expect(dayA.meetings.map((m) => m.id)).not.toContain(meetingId)
  expect(dayB.meetings.map((m) => m.id)).toContain(meetingId)

  const byId = await graphql<{ meeting: { id: string; startTime: string } | null }>(
    page,
    token,
    `query($id: ID!) { meeting(id: $id) { id startTime } }`,
    { id: meetingId },
  )
  expect(byId.meeting).not.toBeNull()
  expect(byId.meeting!.startTime.slice(0, 10)).toBe(dateB)

  // The meeting is still fully editable immediately afterward, not left in some half-migrated
  // state by the two-write move.
  const secondEdit = await graphql<{ updateMeeting: { errors: string[] } }>(page, token, UPDATE_MEETING, {
    id: meetingId,
    meeting: {
      roomId,
      organiserId,
      attendeeIds: [],
      subject: `${subject} (edited again)`,
      startTime: `${dateB}T10:00:00`,
      endTime: `${dateB}T10:30:00`,
    },
  })
  expect(secondEdit.updateMeeting.errors).toEqual([])
})

test('M.112 - an edit made by another client is reflected live on an already-open meeting detail sheet', async ({
  page,
  request,
}) => {
  const id = uniqueId()
  const room = `M112 Room ${id}`
  const subject = `M112 meeting ${id}`
  const pinnedNow = pinnedWeekday('Monday', { weeks: 2 })
  const date = formatDateParam(pinnedNow)

  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, room, 4)
  const token = await getIdToken(page)
  const organiserId = await myPersonId(page, token)

  const reference = await graphql<{ workspace: { rooms: { id: string; name: string }[] } }>(
    page,
    token,
    `query { workspace { rooms { id name } } }`,
    {},
  )
  const roomId = reference.workspace.rooms.find((r) => r.name === room)!.id

  const meetingId = await createMeetingViaApi(page, token, { roomId, organiserId, attendeeIds: [], subject, date })

  // Watching the meeting's own detail sheet before the edit, never reloading after.
  await page.goto(`/rooms/${date}/availability`)
  await openMeetingDetail(page, room, subject)
  await expect(page.getByRole('heading', { name: subject, exact: true })).toBeVisible()

  const newSubject = `${subject} (edited elsewhere)`
  const adminToken = await fetchAdminAccessToken(request)
  const editResult = await rawGraphql(request, adminToken, UPDATE_MEETING, {
    id: meetingId,
    meeting: {
      roomId,
      organiserId,
      attendeeIds: [],
      subject: newSubject,
      startTime: `${date}T10:00:00`,
      endTime: `${date}T10:30:00`,
    },
  })
  const editErrors = (editResult.data?.updateMeeting as { errors: string[] } | undefined)?.errors
  expect(editErrors).toEqual([])

  // No reload, no navigation: only the real daysInvalidated broadcast + refetch can make this
  // change, since this page never re-requested anything itself.
  await expect(page.getByRole('heading', { name: newSubject, exact: true })).toBeVisible({ timeout: 30_000 })
})

test('M.113 - a cancellation made by another client is reflected live on an already-open meeting detail sheet', async ({
  page,
  request,
}) => {
  const id = uniqueId()
  const room = `M113 Room ${id}`
  const subject = `M113 meeting ${id}`
  const pinnedNow = pinnedWeekday('Tuesday', { weeks: 2 })
  const date = formatDateParam(pinnedNow)

  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await page.clock.setFixedTime(pinnedNow)
  await signInAsDemo(page)
  await createRoom(page, room, 4)
  const token = await getIdToken(page)
  const organiserId = await myPersonId(page, token)

  const reference = await graphql<{ workspace: { rooms: { id: string; name: string }[] } }>(
    page,
    token,
    `query { workspace { rooms { id name } } }`,
    {},
  )
  const roomId = reference.workspace.rooms.find((r) => r.name === room)!.id

  const meetingId = await createMeetingViaApi(page, token, { roomId, organiserId, attendeeIds: [], subject, date })

  await page.goto(`/rooms/${date}/availability`)
  await openMeetingDetail(page, room, subject)
  await expect(page.getByRole('heading', { name: subject, exact: true })).toBeVisible()

  const adminToken = await fetchAdminAccessToken(request)
  const cancelResult = await rawGraphql(request, adminToken, CANCEL_MEETING, { id: meetingId })
  const cancelErrors = (cancelResult.data?.cancelMeeting as { errors: string[] } | undefined)?.errors
  expect(cancelErrors).toEqual([])

  // Scoped to the paragraph, not a bare getByText - EmptyState's icon also carries this text as
  // its accessible <title>, which a plain getByText would match too (strict-mode ambiguity, not a
  // second real occurrence - see meeting-edit-and-cancel.spec.ts's own identical note).
  await expect(page.getByRole('paragraph').filter({ hasText: 'This meeting was cancelled.' })).toBeVisible({
    timeout: 30_000,
  })
  // Stays open with that message rather than auto-closing or erroring (Decision 11) - the sheet's
  // own Close button is still there.
  await expect(page.getByRole('main').getByRole('button', { name: 'Close' })).toBeVisible()
  expect(pageErrors).toEqual([])
})
