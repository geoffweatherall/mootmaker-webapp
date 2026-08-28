import { expect, test, type Page } from '@playwright/test'

// mootmaker/use-cases.md, section F (Add Meeting), cases 38-58. Signs in as the demo user rather
// than creating a fresh account for most cases: it's a real, pre-verified Cognito account that
// already exists in every environment (see mootmaker-api/deploy/terraform/cognito.tf, "the demo
// user is the one always-present admin") with a linked Person already resolved, so most of these
// tests can go straight to the thing they're actually about - adding a meeting - without needing
// sign-up or email verification at all (see acceptance/README.md's "Which account to sign in as").
// A few cases (F.48, F.51) specifically need the e2e user instead, since they depend on a
// no-linked-Person account.
//
// A fresh ephemeral environment has no rooms/people yet, so creating them via the real Settings UI
// is these tests' own precondition - there's no Admin-API-style bypass for app data the way there
// is for Cognito accounts, and doing it through the real UI is no less realistic than a real admin
// would be. Every room/person name below is suffixed with a fresh uniqueId() so repeated runs
// against the same shared environment, and other agents' concurrent runs against sections other
// than F, never collide.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

// Real Date.now()/Math.random(), deliberately not derived from any pinned clock - see each test's
// own reasoning for why it needs a fresh value every run even against an already-deployed,
// repeatedly-iterated-against environment.
function uniqueId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
}

// The Room field's combobox is now an Autocomplete <input> (see AddMeetingPage.tsx), whose
// displayed text lives in its `value` attribute, not textContent - so matching a suggested room's
// name needs toHaveValue(regex), not toContainText (which checks textContent, always empty for an
// <input>, and would silently never match here). The regex form does the same "contains" check
// toContainText used to, since the field's full value also has " (capacity N)" appended.
function containsValue(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
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

async function signInAsE2eUser(page: Page): Promise<void> {
  const email = requireEnv('E2E_USER_EMAIL')
  const password = requireEnv('E2E_USER_PASSWORD')
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
}

async function signOut(page: Page): Promise<void> {
  await page.getByText('Sign out').click()
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

async function goToAddMeeting(page: Page): Promise<void> {
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
}

async function selectRoom(page: Page, roomName: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: roomName, exact: false }).click()
}

async function selectOrganiser(page: Page, personName: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Organiser' }).click()
  await page.getByRole('option', { name: personName, exact: true }).click()
}

// The multi-select Attendees dropdown stays open across multiple option clicks (it only closes on
// Escape/outside-click), so every name here is selected from a single opening - matches
// organiser-attendee-exclusivity.spec.ts's own mocked-layer equivalent.
async function selectAttendees(page: Page, names: string[]): Promise<void> {
  await page.getByRole('combobox', { name: 'Attendees' }).click()
  for (const name of names) {
    await page.getByRole('option', { name, exact: true }).click()
  }
  await page.keyboard.press('Escape')
  // Escape closes the Autocomplete's open listbox but does not blur the input itself - it stays
  // focused (confirmed via a real deployed environment: screenshotting right before the next
  // click still showed the field with focus styling). Against real network latency (never against
  // the near-instant mocked layer, which is why this never surfaced there), a single subsequent
  // click elsewhere - e.g. the "Suggest a room" button right after selectAttendees - can land while
  // the field is still focused and simply not register on the intended target: no error, no
  // network call, no re-render, just a silently absorbed click. Explicitly clicking a neutral,
  // always-present element blurs the field for real before any caller's next interaction.
  await page.getByRole('heading', { name: 'Add Meeting' }).click()
}

// MUI X's TimePicker renders each field as several keyboard-editable sections (Hours/Minutes/
// Meridiem) rather than a single fillable input - typing a 4-digit 24-hour time into the Hours
// section auto-advances through Hours then Minutes, and a further "AM"/"PM" keystroke sets the
// Meridiem section. Confirmed empirically against the real deployed picker before relying on it
// here (typing "0200" then "PM" into a fresh Hours section reliably produces "02:00 PM").
async function setTime(page: Page, groupName: 'Start time' | 'End time', hour24: number, minute: number): Promise<void> {
  const group = page.getByRole('group', { name: groupName })
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const meridiem = hour24 < 12 ? 'AM' : 'PM'
  await group.getByRole('spinbutton', { name: 'Hours' }).click()
  await page.keyboard.type(`${String(hour12).padStart(2, '0')}${String(minute).padStart(2, '0')}`)
  await page.keyboard.type(meridiem)
}

async function roomFieldIsEmpty(page: Page): Promise<boolean> {
  const value = await page.getByRole('combobox', { name: 'Room' }).inputValue()
  return value.trim().length === 0
}

// The signed-in browser session's real Cognito ID token, as amazon-cognito-identity-js stores it -
// see auth/cognito.ts's currentIdToken() and apolloClient.ts's authLink, which sends this exact
// value (no "Bearer " prefix) as the Authorization header. Needed only by the handful of cases
// that must talk to the GraphQL API directly, bypassing the UI (F.43, F.45b) - see F.45's own Notes
// for why that's sometimes the only way to exercise a purely server-side rule.
async function getIdToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.endsWith('.idToken')) {
        return localStorage.getItem(key)
      }
    }
    return null
  })
  if (!token) {
    throw new Error('Could not find a Cognito idToken in localStorage - is the browser actually signed in?')
  }
  return token
}

interface GraphQlResponse<T> {
  data?: T
  errors?: { message: string }[]
}

async function graphqlRequest<T>(
  page: Page,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<GraphQlResponse<T>> {
  const response = await page.request.post(requireEnv('GRAPHQL_API_URL'), {
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    data: { query, variables },
  })
  return response.json()
}

const CREATE_MEETING_MUTATION = `
  mutation CreateMeeting($meeting: MeetingInput!) {
    createMeeting(meeting: $meeting) {
      meeting { id }
      errors
    }
  }
`

// Shared setup for the two cases that submit a createMeeting mutation directly against the
// GraphQL API rather than through the UI (F.43, F.45b): a room to book (created through the real
// Settings UI, then looked up by name via a direct query since the UI never surfaces its id), and
// the signed-in demo user's own Person id to use as organiserId, both fetched with the same real
// bearer token the mutation itself will use.
async function directApiContext(page: Page, roomName: string): Promise<{ token: string; organiserId: string; roomId: string }> {
  await createRoom(page, roomName, 4)
  const token = await getIdToken(page)

  const personResult = await graphqlRequest<{ myPerson: { id: string } }>(page, token, 'query { myPerson { id } }', {})
  const organiserId = personResult.data?.myPerson.id
  if (!organiserId) {
    throw new Error(`Could not resolve the signed-in user's own Person via myPerson: ${JSON.stringify(personResult)}`)
  }

  const roomsResult = await graphqlRequest<{ rooms: { id: string; name: string }[] }>(page, token, 'query { rooms { id name } }', {})
  const room = roomsResult.data?.rooms.find((candidate) => candidate.name === roomName)
  if (!room) {
    throw new Error(`Room "${roomName}" not found via a direct GraphQL query: ${JSON.stringify(roomsResult)}`)
  }

  return { token, organiserId, roomId: room.id }
}

test('add a meeting with all required fields succeeds and it appears on the room availability schedule', async ({
  page,
}) => {
  const demoEmail = requireEnv('DEMO_USER_EMAIL')
  const demoPassword = requireEnv('DEMO_USER_PASSWORD')
  // Real Date.now(), before pinning the clock below - run.sh supports iterating against an
  // already-deployed environment across repeated runs, so this still needs to be genuinely
  // unique each time, not just once per pinned-clock value.
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const roomName = `Acceptance Test Room ${runId}`
  const subject = `Acceptance test meeting ${runId}`

  // AddMeetingPage defaults the start time to the next 15-minute boundary from now - fine most of
  // the time, but RoomAvailabilityPage only ever renders business hours (08:00-17:00, see that
  // page's own "Showing business hours" note), so this test would flake whenever it happened to
  // run outside that window (caught for real: failed at 17:30 local time, the meeting was created
  // successfully but fell just outside the grid's visible range). Pinning just
  // Date.now()/new Date() (not the timers - setFixedTime keeps those running normally) to a known
  // time safely inside business hours makes that deterministic instead, matching the same fix
  // already used in webapp/tests/meeting-details.spec.ts for the same class of problem.
  await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))

  await page.goto('/signin')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()

  // Precondition: a room to book (see the file-level comment above). Scoped to the dialog - the
  // Settings page's own "Your name" section also has a field labelled "Name", so an unscoped
  // getByLabel('Name') matches both once the "Add room" dialog is open.
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add room' }).click()
  const addRoomDialog = page.getByRole('dialog')
  await addRoomDialog.getByLabel('Name').fill(roomName)
  await addRoomDialog.getByLabel('Capacity').fill('4')
  await addRoomDialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(roomName)).toBeVisible()

  // The use case itself: add a meeting with all required fields. Organiser defaults to the
  // signed-in user's own Person (case 39) and the time fields default sensibly (case 40), so the
  // only fields this test needs to touch are the ones that don't have a usable default.
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()

  await page.getByLabel('Subject').fill(subject)
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: roomName, exact: false }).click()
  await page.getByRole('button', { name: 'Save' }).click()

  // Success navigates to that day's room availability (case 38), with a confirmation toast -
  // both the navigation target and the meeting actually showing up there are asserted, not just
  // the toast text, since a toast passing while the meeting silently failed to persist would be a
  // false positive.
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
  await expect(page.getByText('Meeting was successfully scheduled.')).toBeVisible()
  await expect(page.getByText(subject)).toBeVisible()
})

test('organiser defaults to the signed-in user\'s own Person without any interaction', async ({ page }) => {
  await signInAsDemo(page)
  await goToAddMeeting(page)

  // Cheapest possible version of this check - no submission needed, just reading the field's
  // initial state (see F.39's catalog Notes). Uses toHaveValue (auto-retrying) rather than a raw
  // inputValue() read: the default is applied by a useEffect once personId resolves, which can
  // genuinely lag the initial render by a tick or two.
  await expect(page.getByRole('combobox', { name: 'Organiser' })).toHaveValue('Demo Strater')
})

test('start and end time default to the next 15-minute boundary and one hour later, same day', async ({ page }) => {
  await signInAsDemo(page)
  // A known, non-boundary time - see F.40's catalog Given.
  await page.clock.setFixedTime(new Date('2026-08-24T10:07:00'))
  await goToAddMeeting(page)

  await expect(page.getByRole('group', { name: 'Start time' }).locator('input')).toHaveValue('10:15 AM')
  await expect(page.getByRole('group', { name: 'End time' }).locator('input')).toHaveValue('11:15 AM')
})

test('start/end time pickers only ever offer 15-minute-boundary minutes', async ({ page }) => {
  await signInAsDemo(page)
  await goToAddMeeting(page)

  for (const groupName of ['Start time', 'End time'] as const) {
    const group = page.getByRole('group', { name: groupName })
    await group.getByRole('button', { name: /Choose time/i }).click()
    // Both Start/End dialogs stay mounted in the DOM even when closed (only one is actually
    // open at a time), so the listbox query must be scoped to this field's own dialog - an
    // unscoped page-wide query matches both and trips Playwright's strict mode.
    const dialog = page.getByRole('dialog', { name: groupName })
    const minuteOptions = dialog.getByRole('listbox', { name: 'Select minutes' })
    await expect(minuteOptions).toBeVisible()
    const minutes = await minuteOptions.getByRole('option').allTextContents()
    // Exactly {00, 15, 30, 45} - not just "some multiple of 15" - see F.41's catalog Notes.
    expect(minutes).toEqual(['00', '15', '30', '45'])
    await page.keyboard.press('Escape')
  }
})

// F.42 - now a real, fixed rule (see CreateMeetingHandler.java's EndBeforeStart check, added
// alongside this catalog): reversed or zero-length start/end pairs on the same calendar date are
// rejected, distinctly from SpansMultipleDays (genuinely different calendar dates - see F.43).
test('an end time before the start time is rejected with EndBeforeStart', async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Acceptance Test Room F42a ${runId}`
  await signInAsDemo(page)
  await page.clock.setFixedTime(new Date('2026-08-24T08:00:00'))
  await createRoom(page, roomName, 4)

  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(`F42a end before start ${runId}`)
  await selectRoom(page, roomName)
  await setTime(page, 'Start time', 14, 0)
  await setTime(page, 'End time', 10, 0)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('End time must be after the start time.')).toBeVisible()
  await expect(page).toHaveURL(/\/meetings\/add$/)
})

test('an end time equal to the start time is rejected with EndBeforeStart', async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Acceptance Test Room F42b ${runId}`
  await signInAsDemo(page)
  await page.clock.setFixedTime(new Date('2026-08-24T08:00:00'))
  await createRoom(page, roomName, 4)

  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(`F42b end equals start ${runId}`)
  await selectRoom(page, roomName)
  await setTime(page, 'Start time', 10, 0)
  await setTime(page, 'End time', 10, 0)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('End time must be after the start time.')).toBeVisible()
  await expect(page).toHaveURL(/\/meetings\/add$/)
})

// F.43 - see this file's own F.43 catalog entry (f-add-meeting.md) for the full reasoning: because
// AddMeetingPage always combines both times against one shared `date` value, the form itself has
// no way to submit startTime/endTime on genuinely different calendar dates - typing 23:45/00:15
// through the UI produces the *same* request shape as F.42's "end before start" case (same date,
// end < start), which now hits EndBeforeStart, not SpansMultipleDays. Proving SpansMultipleDays
// specifically therefore needs a direct GraphQL call (the same technique F.45b needs, for the same
// underlying reason: a purely server-side rule the UI cannot be maneuvered into triggering).
test('a start/end pair on genuinely different calendar dates is rejected with SpansMultipleDays (direct GraphQL call - unreachable through the form itself)', async ({
  page,
}) => {
  const runId = uniqueId()
  const roomName = `Acceptance Test Room F43 ${runId}`
  await signInAsDemo(page)
  const { token, organiserId, roomId } = await directApiContext(page, roomName)

  const result = await graphqlRequest<{ createMeeting: { meeting: { id: string } | null; errors: string[] } }>(
    page,
    token,
    CREATE_MEETING_MUTATION,
    {
      meeting: {
        subject: `F43 spans midnight ${runId}`,
        roomId,
        organiserId,
        attendeeIds: [],
        startTime: '2026-08-24T23:45:00',
        endTime: '2026-08-25T00:15:00',
      },
    },
  )

  expect(result.data?.createMeeting.errors).toContain('SpansMultipleDays')
  expect(result.data?.createMeeting.meeting).toBeNull()
})

test.describe('F.44 - Organiser/Attendees mutual exclusivity', () => {
  test('picking someone as an attendee excludes them from Organiser; picking a new organiser excludes them from Attendees; deselecting frees them up again', async ({
    page,
  }) => {
    const runId = uniqueId()
    const aliceName = `Alice F44 ${runId}`
    const bobName = `Bob F44 ${runId}`
    await signInAsDemo(page)
    await createPerson(page, aliceName)
    await createPerson(page, bobName)

    await goToAddMeeting(page)

    await selectAttendees(page, [aliceName])
    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await expect(page.getByRole('option', { name: aliceName, exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: bobName, exact: true }).click()

    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await expect(page.getByRole('option', { name: bobName, exact: true })).toHaveCount(0)
    await expect(page.getByRole('option', { name: aliceName, exact: true }).getByRole('checkbox')).toBeChecked()
    // Deselect Alice (still open from the click above).
    await page.getByRole('option', { name: aliceName, exact: true }).click()
    await page.keyboard.press('Escape')

    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await expect(page.getByRole('option', { name: aliceName, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
  })
})

test.describe('F.45 - Organiser also picked as attendee', () => {
  test('the organiser, once picked, never appears in the Attendees options (UI prevention)', async ({ page }) => {
    const runId = uniqueId()
    const personName = `F45 Person ${runId}`
    await signInAsDemo(page)
    await createPerson(page, personName)

    await goToAddMeeting(page)
    await selectOrganiser(page, personName)

    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await expect(page.getByRole('option', { name: personName, exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  test('organiser duplicated into attendeeIds is rejected server-side with OrganiserIsAttendee (forced via direct GraphQL call)', async ({
    page,
  }) => {
    const runId = uniqueId()
    const roomName = `Acceptance Test Room F45b ${runId}`
    await signInAsDemo(page)
    const { token, organiserId, roomId } = await directApiContext(page, roomName)

    const result = await graphqlRequest<{ createMeeting: { meeting: { id: string } | null; errors: string[] } }>(
      page,
      token,
      CREATE_MEETING_MUTATION,
      {
        meeting: {
          subject: `F45b organiser is attendee ${runId}`,
          roomId,
          organiserId,
          attendeeIds: [organiserId],
          startTime: '2026-08-24T09:00:00',
          endTime: '2026-08-24T10:00:00',
        },
      },
    )

    expect(result.data?.createMeeting.errors).toContain('OrganiserIsAttendee')
    expect(result.data?.createMeeting.meeting).toBeNull()
  })
})

test('blank subject is rejected with SubjectRequired', async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Acceptance Test Room F46 ${runId}`
  await signInAsDemo(page)
  await createRoom(page, roomName, 4)

  await goToAddMeeting(page)
  await selectRoom(page, roomName)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Please enter a subject.')).toBeVisible()
  await expect(page).toHaveURL(/\/meetings\/add$/)
})

test('blank room is rejected with RoomRequired', async ({ page }) => {
  const runId = uniqueId()
  await signInAsDemo(page)

  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(`F47 subject ${runId}`)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Please select a room.')).toBeVisible()
  await expect(page).toHaveURL(/\/meetings\/add$/)
})

test('blank organiser (no linked Person, not manually chosen) is rejected with OrganiserRequired', async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Acceptance Test Room F48 ${runId}`
  // The demo user's Organiser is never blank to begin with (F.39) - this is the one case that
  // specifically needs the e2e user's no-linked-Person starting point, not just as an option (see
  // F.48's catalog Notes). The room still needs an admin to create it first.
  await signInAsDemo(page)
  await createRoom(page, roomName, 4)
  await signOut(page)

  await signInAsE2eUser(page)
  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(`F48 subject ${runId}`)
  await selectRoom(page, roomName)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Please select an organiser.')).toBeVisible()
  await expect(page).toHaveURL(/\/meetings\/add$/)
})

test('room capacity less than organiser+attendees is rejected with InsufficientCapacity', async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Acceptance Test Room F49 ${runId}`
  const carolName = `Carol F49 ${runId}`
  const daveName = `Dave F49 ${runId}`
  await signInAsDemo(page)
  await createRoom(page, roomName, 2)
  await createPerson(page, carolName)
  await createPerson(page, daveName)

  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(`F49 subject ${runId}`)
  await selectRoom(page, roomName)
  // Organiser stays on its default (the demo user) - 1 organiser + 2 attendees = 3 distinct
  // people against a room that only holds 2.
  await selectAttendees(page, [carolName, daveName])
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('The room does not have enough capacity for all attendees.')).toBeVisible()
  await expect(page).toHaveURL(/\/meetings\/add$/)
})

test('an overlapping time slot in the same room is rejected with TimeRangeUnavailable', async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Acceptance Test Room F50 ${runId}`
  const subject1 = `F50 first meeting ${runId}`
  const subject2 = `F50 second meeting ${runId}`
  await signInAsDemo(page)
  await page.clock.setFixedTime(new Date('2026-08-24T08:00:00'))
  await createRoom(page, roomName, 4)

  // First meeting: 10:00-11:00.
  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(subject1)
  await selectRoom(page, roomName)
  await setTime(page, 'Start time', 10, 0)
  await setTime(page, 'End time', 11, 0)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
  await expect(page.getByText(subject1)).toBeVisible()

  // Second meeting: 10:30-11:30, same room - genuinely overlapping (contrast with E.34's legal
  // touching case), not just touching.
  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(subject2)
  await selectRoom(page, roomName)
  await setTime(page, 'Start time', 10, 30)
  await setTime(page, 'End time', 11, 30)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('The room already has a meeting scheduled during that time range.')).toBeVisible()
  await expect(page).toHaveURL(/\/meetings\/add$/)
  await expect(page.getByText(subject2)).toHaveCount(0)
})

test('multiple simultaneous validation failures are listed together in one banner', async ({ page }) => {
  // The e2e user so Organiser starts blank without extra setup (see F.51's catalog Notes).
  await signInAsE2eUser(page)
  await goToAddMeeting(page)

  // Subject, Room, and Organiser all left blank.
  await page.getByRole('button', { name: 'Save' }).click()

  const banner = page.getByRole('alert')
  await expect(banner.getByText('Please enter a subject.')).toBeVisible()
  await expect(banner.getByText('Please select a room.')).toBeVisible()
  await expect(banner.getByText('Please select an organiser.')).toBeVisible()
  // The <ul>-vs-single-string branch in ErrorBanner.tsx specifically - see F.51's catalog Notes.
  await expect(banner.locator('li')).toHaveCount(3)
})

test('suggest a room with none qualifying shows the inline "no room available" message and leaves Room unset', async ({
  page,
}) => {
  const runId = uniqueId()
  // suggestRoom scans every room in this shared environment (see SuggestRoomHandler.java), so
  // "no room qualifies" can't be proven with just one deliberately-busy room the way a dedicated
  // environment could - some unrelated room from another concurrently-running section could
  // easily be free at whatever time this test picks. Pushing the required capacity comfortably
  // above any plausible fixture room's capacity (every capacity used elsewhere in this catalog
  // tops out in the single digits) makes the "nothing qualifies" outcome robust regardless of
  // what else exists in the environment, without needing an actually-empty room list either.
  const attendeeNames = Array.from({ length: 8 }, (_, i) => `F52 Attendee ${i} ${runId}`)
  await signInAsDemo(page)
  // A deliberately unusual date/time, distinct from the round examples used elsewhere in this
  // catalog (e.g. 10:00 on 2026-08-19/24), to further reduce the odds of colliding with some
  // other section's own fixture meeting.
  await page.clock.setFixedTime(new Date('2027-01-05T05:00:00'))
  for (const name of attendeeNames) {
    await createPerson(page, name)
  }

  await goToAddMeeting(page)
  await setTime(page, 'Start time', 5, 47)
  await setTime(page, 'End time', 6, 17)
  await selectAttendees(page, attendeeNames)
  await page.getByRole('button', { name: 'Suggest a room' }).click()

  await expect(
    page.getByText('No suitable room is available for that time - try adjusting the attendees or time.'),
  ).toBeVisible()
  expect(await roomFieldIsEmpty(page)).toBe(true)
})

test('suggest a room fills the best-fit room on first press, then cycles through the ranked list and wraps', async ({
  page,
}) => {
  const runId = uniqueId()
  // 2026-08-27 root cause (previously "under investigation" in f-add-meeting.md's F.53 Notes):
  // this test used to leave Attendees empty (organiser-alone, requiredCapacity 1) on the theory
  // that "distinctive" capacities (7/11/13) would dodge collisions with other fixture rooms. That
  // reasoning was wrong for requiredCapacity 1 specifically: SuggestRoomHandler ranks EVERY room
  // in this shared, never-torn-down-mid-suite environment that simply has capacity >= required
  // and no overlapping meeting - and since nothing ever books this test's own far-future
  // date/time, every room ever created earlier in this same file (e.g. F.49's own capacity-2
  // room, still sitting unbooked at any future date) stays permanently "free" and therefore
  // qualifies too. A smaller pre-existing room (capacity 2) always outranks a "distinctive" but
  // larger capacity-7 fixture on the smallest-surplus rule, no matter how distinctive its number
  // is. Confirmed via error-context.md from a live run: the Room field filled with
  // "Acceptance Test Room F49 ... (capacity 2)" (created by the F.49 test earlier in this same
  // file) instead of this test's own capacity-7 room.
  //
  // Fix: add enough attendees to push requiredCapacity comfortably above every capacity any
  // earlier test in this file creates (observed max 4, see F.49/F.50 above) while staying at or
  // below this test's own smallest fixture room - so only this test's three rooms can possibly
  // qualify, regardless of what else has accumulated in the environment by this point. Still
  // ranked smallest-surplus-first (see SuggestRoomHandler.java): with requiredCapacity 5, capacity
  // 5 is the unambiguous best fit, then 7, then 9.
  const room5 = `Suggest Room 5 ${runId}`
  const room7 = `Suggest Room 7 ${runId}`
  const room9 = `Suggest Room 9 ${runId}`
  const attendeeNames = Array.from({ length: 4 }, (_, i) => `F53 Attendee ${i} ${runId}`)
  await signInAsDemo(page)
  await page.clock.setFixedTime(new Date('2027-01-06T06:00:00'))
  await createRoom(page, room5, 5)
  await createRoom(page, room7, 7)
  await createRoom(page, room9, 9)
  for (const name of attendeeNames) {
    await createPerson(page, name)
  }

  await goToAddMeeting(page)
  await setTime(page, 'Start time', 6, 32)
  await setTime(page, 'End time', 7, 2)
  // Organiser + 4 attendees = requiredCapacity 5 - see comment above for why this (rather than
  // organiser alone) is what makes the ranking deterministic in this shared environment.
  await selectAttendees(page, attendeeNames)

  const suggestButton = page.getByRole('button', { name: 'Suggest a room' })
  const roomCombo = page.getByRole('combobox', { name: 'Room' })

  await suggestButton.click()
  await expect(roomCombo).toHaveValue(containsValue(room5))
  await suggestButton.click()
  await expect(roomCombo).toHaveValue(containsValue(room7))
  await suggestButton.click()
  await expect(roomCombo).toHaveValue(containsValue(room9))
  await suggestButton.click()
  await expect(roomCombo).toHaveValue(containsValue(room5))
})

test('changing the attendee count invalidates the cached suggestion, re-ranking for the new required capacity', async ({
  page,
}) => {
  const runId = uniqueId()
  // 2026-08-27 root cause (previously "under investigation" in f-add-meeting.md's F.54 Notes):
  // same root cause as F.53 just above - this test used to start from organiser-alone
  // (requiredCapacity 1), which any pre-existing free room in this shared, never-torn-down-mid-
  // suite environment (e.g. F.49's capacity-2 room, or F.53's own capacity 5/7/9 rooms, which run
  // immediately before this test in file order and are themselves never booked at this test's
  // date/time) can win purely on being smaller - regardless of how large this test's own fixture
  // rooms are. Confirmed via error-context.md from a live run: the Room field filled with
  // "Acceptance Test Room F49 ... (capacity 2)" instead of this test's own small room.
  //
  // Fix: use the same technique as F.53 - keep requiredCapacity comfortably clear of both the
  // observed cross-test baseline (max capacity 4, see F.49/F.50 above) AND F.53's own leftover
  // rooms (max capacity 9, see the test just above - deliberately staying clear of exactly 9 too,
  // not just "above" it, so a required-capacity level that happens to equal F.53's leftover room's
  // capacity can never tie with this test's own small room and fall back on name-ordering luck).
  const capacitySmall = 11
  const capacityLarge = 13
  const roomSmall = `Cache Room Small ${runId}`
  const roomLarge = `Cache Room Large ${runId}`
  // First press needs requiredCapacity strictly above F.53's leftover max (9) and above the
  // cross-test baseline (4), while staying at or below capacitySmall (11) - so requiredCapacity
  // 10 (organiser + 9 attendees). Second press needs requiredCapacity strictly above capacitySmall
  // (11) while staying at or below capacityLarge (13) - so requiredCapacity 12
  // (organiser + 11 attendees), reached by adding 2 more attendees to the same pool rather than a
  // disjoint set.
  const attendeeNames = Array.from({ length: 11 }, (_, i) => `F54 Attendee ${i} ${runId}`)
  const firstPressAttendees = attendeeNames.slice(0, 9)
  await signInAsDemo(page)
  await page.clock.setFixedTime(new Date('2027-01-07T07:00:00'))
  await createRoom(page, roomSmall, capacitySmall)
  await createRoom(page, roomLarge, capacityLarge)
  for (const name of attendeeNames) {
    await createPerson(page, name)
  }

  await goToAddMeeting(page)
  await setTime(page, 'Start time', 7, 17)
  await setTime(page, 'End time', 7, 47)

  const suggestButton = page.getByRole('button', { name: 'Suggest a room' })
  const roomCombo = page.getByRole('combobox', { name: 'Room' })

  // First press: organiser + 9 attendees = requiredCapacity 10 - the small room (capacity 11) is
  // the best fit (smallest surplus) of the two qualifying rooms.
  await selectAttendees(page, firstPressAttendees)
  await suggestButton.click()
  await expect(roomCombo).toHaveValue(containsValue(roomSmall))

  // Adding 2 more attendees (11 total) pushes requiredCapacity to 12 - the small room (capacity
  // 11) no longer qualifies at all, so a correctly-invalidated cache must re-fetch and offer the
  // large room fresh, not just step to "whatever was next" in the old (stale) ranked list.
  await selectAttendees(page, attendeeNames.slice(9))
  await suggestButton.click()
  await expect(roomCombo).toHaveValue(containsValue(roomLarge))
})

test('Cancel discards the form and returns to the previously-viewed Room Availability page', async ({ page }) => {
  await signInAsDemo(page)
  await page.clock.setFixedTime(new Date('2026-08-24T10:00:00'))

  // Arrive via a real navigation (not page.goto('/meetings/add') directly) so browser history has
  // somewhere sensible to go back to - see F.55's catalog Notes: Cancel's handler is
  // navigate(-1), which needs a real preceding entry.
  const today = new Date().toISOString().slice(0, 10)
  await page.goto(`/rooms/${today}/availability`)
  await expect(page.getByRole('heading', { name: 'Room Availability' })).toBeVisible()

  await page.getByRole('link', { name: 'Add Meeting' }).first().click()
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()

  const discardedSubject = `F55 discarded subject ${uniqueId()}`
  await page.getByLabel('Subject').fill(discardedSubject)
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(page).toHaveURL(new RegExp(`/rooms/${today}/availability`))
  await expect(page.getByText(discardedSubject)).toHaveCount(0)
})

test('double-clicking Save does not double-submit - exactly one meeting is created', async ({ page }) => {
  const runId = uniqueId()
  const roomName = `Acceptance Test Room F56 ${runId}`
  const subject = `F56 double click subject ${runId}`
  await signInAsDemo(page)
  await page.clock.setFixedTime(new Date('2026-08-24T09:00:00'))
  await createRoom(page, roomName, 4)

  await goToAddMeeting(page)
  await page.getByLabel('Subject').fill(subject)
  await selectRoom(page, roomName)

  const saveButton = page.getByRole('button', { name: 'Save' })
  // Best-effort, timing-sensitive: a CircularProgress should appear inside the button immediately
  // after the first click, before the mutation resolves and navigation happens - see F.56's
  // catalog Notes, which explicitly allows omitting this if it proves flaky, since the real
  // network round trip in a live deployed environment can easily outrun this check either way.
  // Two rapid clicks in quick succession, dispatched as a single double-click gesture rather than
  // two independently-awaited clicks, so the second fires before SubmitButton's
  // disabled={disabled || loading} guard has necessarily taken effect yet. Not awaited yet, so the
  // best-effort spinner check below runs concurrently with it rather than after it resolves.
  const clickPromise = saveButton.click({ clickCount: 2 })
  const spinnerCheck = expect(saveButton.locator('.MuiCircularProgress-root'))
    .toBeVisible({ timeout: 1000 })
    .catch(() => {
      // Best-effort only - see comment above.
    })
  await clickPromise
  await spinnerCheck

  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
  // The real, reliable assertion this use case cares about (see F.56's catalog Notes).
  await expect(page.getByText(subject)).toHaveCount(1)
})

test('at mobile width the Save/Cancel actions stack vertically instead of a cramped row', async ({ page }) => {
  await signInAsDemo(page)
  await goToAddMeeting(page)

  const saveButton = page.getByRole('button', { name: 'Save' })
  const actionsStack = saveButton.locator('xpath=..')

  await page.setViewportSize({ width: 375, height: 667 })
  await expect(actionsStack).toHaveCSS('flex-direction', 'column')

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(actionsStack).toHaveCSS('flex-direction', 'row')
})

test('a rejected submission shows the error banner and briefly flashes the Save button red', async ({ page }) => {
  await signInAsDemo(page)
  await goToAddMeeting(page)

  const saveButton = page.getByRole('button', { name: 'Save' })
  const restingColor = await saveButton.evaluate((el) => getComputedStyle(el).backgroundColor)

  // Leave Subject blank; Room is also blank, but only the banner/flash mechanism itself (not
  // which specific rule fired) is under test here - see F.46/F.47 for the individual rules.
  await saveButton.click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('Please enter a subject.')).toBeVisible()

  // Sampled immediately after the error becomes visible (same render as the error state update
  // that also drives SubmitButton's flash), well inside the 600ms FLASH_DURATION_MS window - see
  // F.58's catalog Notes on why this can't tolerate any extra awaiting first.
  const flashedColor = await saveButton.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(flashedColor).not.toBe(restingColor)
  const [r, g, b] = flashedColor.match(/\d+/g)!.map(Number)
  expect(r).toBeGreaterThan(g)
  expect(r).toBeGreaterThan(b)
})
