import { test, expect, type Page } from '@playwright/test'
import { ADMIN_USER, DEMO_USER } from '../src/auth/cognito.mock'
import { people, rooms } from '../src/testSupport/mocks/fixtures'

// Covers designs/edit-and-cancel-meetings.md's webapp piece at the Integration layer (Playwright +
// MSW, one browser, no real deployed environment - see that doc's own "Testing impacts" for why
// this is the right layer for each case, and what it leaves for the acceptance layer instead).
// The saved session (auth.setup.ts) signs in as the mock e2e test user, who has no linked Person -
// used deliberately below for the "not the organiser, not admin" case, since it guarantees canEdit
// is false regardless of who organises. Every other case needs a linked Person, so signs in as
// DEMO_USER or ADMIN_USER explicitly, same override attendee-response-status.spec.ts uses.
test.describe('Edit and cancel meetings', () => {
  async function signIn(page: Page, user: { email: string; password: string }) {
    await page.goto('/signin')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  }

  async function createMeeting(
    page: Page,
    subject: string,
    options: { room?: string; organiser?: string; start?: string; end?: string } = {},
  ) {
    await page.goto('/meetings/add')
    await expect(page.getByLabel('Subject')).toBeVisible()
    await page.getByLabel('Subject').fill(subject)

    if (options.organiser) {
      await page.getByRole('combobox', { name: 'Organiser' }).click()
      await page.getByRole('option', { name: options.organiser, exact: true }).click()
    }

    await page.getByRole('combobox', { name: 'Room' }).click()
    await page.getByRole('option', { name: options.room ?? rooms[0].name, exact: false }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(/\/rooms\/.+\/availability/)
  }

  // Room Availability, not Home's Today/Tomorrow agenda - Home is scoped to the VIEWER's own
  // meetings (organiser or attendee), which is exactly wrong for the admin/stranger cases below,
  // where the viewer is deliberately neither. Room Availability shows every meeting in that room
  // that day regardless of the viewer's own relationship to it, matching
  // meeting-detail-survives-refetch.spec.ts's own proven pattern. Assumes the current page is
  // already the room-availability page for the right date - true immediately after createMeeting,
  // or after an edit's own save-and-navigate, both of which land there the same way create does.
  async function openMeetingDetail(page: Page, subject: string, room = rooms[0]) {
    const roomCard = page
      .getByText(room.name, { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
    await roomCard.getByRole('button', { name: /'s meetings/ }).click()
    await roomCard.getByRole('button', { name: subject, exact: false }).click()
    // Scoped to <main> - a lingering success toast has its own Close button outside <main>.
    await expect(page.getByRole('main').getByRole('button', { name: 'Close' })).toBeVisible()
  }

  test.describe('canEdit gates the Edit/Cancel buttons', () => {
    test.describe('signed in as the organiser or an admin', () => {
      test.use({ storageState: { cookies: [], origins: [] } })

      test('the organiser sees Edit and Cancel on their own meeting', async ({ page }) => {
        await signIn(page, DEMO_USER)
        const subject = `Organiser sees buttons ${Date.now()}`
        await createMeeting(page, subject) // DEMO_USER auto-fills as organiser
        await openMeetingDetail(page, subject)

        await expect(page.getByRole('link', { name: 'Edit meeting' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Cancel meeting' })).toBeVisible()
      })

      test('an admin sees Edit and Cancel on a meeting they do not organise', async ({ page }) => {
        await signIn(page, ADMIN_USER)
        const subject = `Admin sees buttons ${Date.now()}`
        await createMeeting(page, subject, { organiser: people[0].name })
        await openMeetingDetail(page, subject)

        await expect(page.getByRole('link', { name: 'Edit meeting' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Cancel meeting' })).toBeVisible()
      })
    })

    // Deliberately NOT overriding storageState here - keeps the default saved session (auth.setup.ts,
    // E2E_USER, no linked Person), so canEdit is false unconditionally regardless of who organises.
    test('someone who is neither the organiser nor admin sees neither button', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
      const subject = `Stranger sees nothing ${Date.now()}`
      await createMeeting(page, subject, { organiser: people[0].name })
      await openMeetingDetail(page, subject)

      await expect(page.getByRole('link', { name: 'Edit meeting' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Cancel meeting' })).toHaveCount(0)
    })
  })

  test.describe('editing', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('the organiser can edit their own meeting - the form is prefilled, and saving updates it', async ({
      page,
    }) => {
      await signIn(page, DEMO_USER)
      const subject = `Edit prefill test ${Date.now()}`
      await createMeeting(page, subject)
      await openMeetingDetail(page, subject)

      await page.getByRole('link', { name: 'Edit meeting' }).click()
      await expect(page.getByRole('heading', { name: 'Edit Meeting' })).toBeVisible()
      await expect(page.getByLabel('Subject')).toHaveValue(subject)

      const newSubject = `${subject} (edited)`
      await page.getByLabel('Subject').fill(newSubject)
      await page.getByRole('button', { name: 'Save' }).click()
      await page.waitForURL(/\/rooms\/.+\/availability/)

      await expect(page.getByText(newSubject).first()).toBeVisible()
      await expect(page.getByText(subject, { exact: true })).toHaveCount(0)
    })

    test(
      'editing a meeting’s time within its own room, overlapping its own prior slot, succeeds - ' +
        'and Suggest a room offers the same room, not a different one',
      async ({ page }) => {
        await signIn(page, DEMO_USER)
        const subject = `Self-overlap edit test ${Date.now()}`
        const room = rooms[0]
        await createMeeting(page, subject, { room: room.name })
        await openMeetingDetail(page, subject, room)
        await page.getByRole('link', { name: 'Edit meeting' }).click()
        await expect(page.getByRole('heading', { name: 'Edit Meeting' })).toBeVisible()

        // Re-saves the SAME room and time unchanged - a full, exact overlap with the meeting's
        // own prior slot, which must not spuriously reject as TimeRangeUnavailable (the exact
        // bug this covers - see MeetingValidatorTest/RoomAvailabilityTest in mootmaker-api for
        // the same case at the unit layer). A perfect overlap is a sharper case than a partial
        // one, not a weaker one, and avoids driving the MUI time picker's own widget here.
        const newSubject = `${subject} (unchanged time, re-saved)`
        await page.getByLabel('Subject').fill(newSubject)
        await page.getByRole('button', { name: 'Save' }).click()
        // No TimeRangeUnavailable error banner - a successful save navigates away.
        await page.waitForURL(/\/rooms\/.+\/availability/)
        await expect(page.getByText(newSubject, { exact: false }).first()).toBeVisible()

        // Re-open and confirm "Suggest a room" offers this same room, not a different one.
        await openMeetingDetail(page, newSubject, room)
        await page.getByRole('link', { name: 'Edit meeting' }).click()
        await page.getByRole('button', { name: 'Suggest a room' }).click()
        await expect(page.getByRole('combobox', { name: 'Room' })).toHaveValue(new RegExp(room.name))
      },
    )
  })

  test.describe('cancelling', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('the confirmation dialog keeps the meeting’s own details visible behind it, and confirming removes it', async ({
      page,
    }) => {
      await signIn(page, DEMO_USER)
      const subject = `Cancel dialog visibility test ${Date.now()}`
      await createMeeting(page, subject)
      await openMeetingDetail(page, subject)

      await page.getByRole('button', { name: 'Cancel meeting' }).click()
      await expect(page.getByRole('heading', { name: 'Cancel this meeting?' })).toBeVisible()
      // The sheet's own heading (the meeting's subject) is still in the DOM and visually present,
      // dimmed behind the dialog's backdrop - not unmounted. This is Decision 5's explicit
      // assertion, not just "a dialog appears". A plain text locator, not getByRole: MUI's Dialog
      // correctly marks the rest of the page aria-hidden while open (real accessibility practice
      // for a modal), so a role-based query would report "not found" even though the heading is
      // still there and visible - that aria-hidden is the expected, correct behaviour, not what
      // this assertion exists to catch.
      await expect(page.locator('h2', { hasText: subject })).toBeVisible()

      await page.getByRole('button', { name: 'Cancel meeting', exact: true }).last().click()
      await expect(page.getByRole('heading', { name: 'Cancel this meeting?' })).toHaveCount(0)
      await expect(page.getByText(subject, { exact: true })).toHaveCount(0)
    })
  })

  test.describe('live update within one open sheet', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    // Mirrors meeting-detail-survives-refetch.spec.ts's own technique: no real AppSync
    // subscription exists under `vite --mode mock`, so a visibility-triggered refetch (the SAME
    // refetchQueries call useDaysInvalidated.ts's onVisible fires) stands in for a real broadcast,
    // exercising the same "every active query refetches while a meeting detail sheet is open"
    // path this layer already established as the right one to use.
    async function triggerVisibilityRefetch(page: Page) {
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
    }

    interface FixtureMeeting {
      id: string
      subject: string
      startTime: string
      endTime: string
      room: { id: string }
      organiser: { id: string }
      attendees: { person: { id: string } }[]
    }

    /** Reads the mock "database" directly - read-only, just to find the id and current field
     * values a subsequent mutation call needs. Never used to write: a write here would bypass the
     * mock's own handler logic (attendee-status preservation, day-shape response, etc.) entirely. */
    async function findFixtureMeeting(page: Page, subject: string): Promise<FixtureMeeting> {
      const meeting = await page.evaluate((targetSubject) => {
        const stored = JSON.parse(sessionStorage.getItem('mootmaker-mock-meetings') ?? '[]') as FixtureMeeting[]
        return stored.find((candidate) => candidate.subject === targetSubject) ?? null
      }, subject)
      if (!meeting) throw new Error(`fixture meeting "${subject}" not found`)
      return meeting
    }

    /** Simulates "another client" by calling the same mocked GraphQL endpoint directly from
     * within the page's own JS runtime (so MSW's service worker still intercepts it) - not
     * through this component's own UI - exercising the real UpdateMeeting/CancelMeeting mock
     * handlers exactly as a genuine second session would, rather than poking the fixture's
     * storage directly and bypassing that handler logic (attendee-status preservation, the
     * response's own `day` shape) entirely. */
    async function callMutationDirectly(
      page: Page,
      operationName: 'UpdateMeeting' | 'CancelMeeting',
      variables: Record<string, unknown>,
    ) {
      const response = await page.evaluate(
        async ({ operationName, variables }) => {
          const session = JSON.parse(localStorage.getItem('mootmaker-mock-auth-session') ?? 'null') as {
            email: string
          } | null
          if (!session) throw new Error('no signed-in mock session')
          const result = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `mock-id-token.${session.email}` },
            body: JSON.stringify({ operationName, query: `mutation ${operationName} { __typename }`, variables }),
          })
          return (await result.json()) as { data?: Record<string, { errors?: string[] }>; errors?: unknown[] }
        },
        { operationName, variables },
      )
      const errors = response.data?.[operationName.charAt(0).toLowerCase() + operationName.slice(1)]?.errors
      if (response.errors || (errors && errors.length > 0)) {
        throw new Error(`${operationName} failed: ${JSON.stringify(response.errors ?? errors)}`)
      }
    }

    test('an edit made elsewhere is reflected on an already-open meeting detail sheet', async ({ page }) => {
      await signIn(page, DEMO_USER)
      const subject = `Live edit test ${Date.now()}`
      await createMeeting(page, subject)
      await openMeetingDetail(page, subject)
      const newSubject = `${subject} (changed elsewhere)`

      const existing = await findFixtureMeeting(page, subject)
      await callMutationDirectly(page, 'UpdateMeeting', {
        id: existing.id,
        meeting: {
          subject: newSubject,
          roomId: existing.room.id,
          organiserId: existing.organiser.id,
          attendeeIds: existing.attendees.map((attendee) => attendee.person.id),
          startTime: existing.startTime,
          endTime: existing.endTime,
        },
      })

      await triggerVisibilityRefetch(page)

      await expect(page.getByRole('heading', { name: newSubject, exact: true })).toBeVisible()
    })

    test('a cancellation made elsewhere shows "This meeting was cancelled" on an already-open sheet', async ({
      page,
    }) => {
      await signIn(page, DEMO_USER)
      const subject = `Live cancel test ${Date.now()}`
      await createMeeting(page, subject)
      await openMeetingDetail(page, subject)

      const existing = await findFixtureMeeting(page, subject)
      await callMutationDirectly(page, 'CancelMeeting', { id: existing.id })

      await triggerVisibilityRefetch(page)

      // Scoped to the paragraph, not a bare getByText: EmptyState's icon also carries the same
      // text as its accessible <title>, which a plain getByText matches too (strict-mode
      // ambiguity, not a second real occurrence).
      await expect(page.getByRole('paragraph').filter({ hasText: 'This meeting was cancelled.' })).toBeVisible()
      // Stays open with that message rather than auto-closing (Decision 11) - the sheet's own
      // Close button is still there.
      await expect(page.getByRole('main').getByRole('button', { name: 'Close' })).toBeVisible()
    })
  })
})
