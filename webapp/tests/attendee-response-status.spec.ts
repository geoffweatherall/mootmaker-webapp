import { test, expect } from '@playwright/test'
import { DEMO_USER } from '../src/auth/cognito.mock'
import { people, rooms } from '../src/testSupport/mocks/fixtures'

// Covers designs/attendee-response-status.md's webapp piece at the mocked-integration layer:
// the status badge/control in the meeting-detail sheet, and the Home page's "Needs your
// response" section reacting live to a respondToMeeting call. The saved session (auth.setup.ts)
// signs in as the mock e2e test user, who has no linked Person - these need one, so every test
// here signs in as DEMO_USER instead (same override calendar-menu.spec.ts uses). DEMO_USER is
// then auto-selected as organiser by Add Meeting's own default, so createMeetingAsAttendee
// explicitly picks a different organiser first to make DEMO_USER available as an attendee
// instead - see organiser-attendee-exclusivity.spec.ts for that same mechanic.
test.describe('Attendee response status', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Email').fill(DEMO_USER.email)
    await page.getByLabel('Password').fill(DEMO_USER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  async function createMeetingAsAttendee(
    page: import('@playwright/test').Page,
    subject: string,
    dateOffsetDays?: number,
  ) {
    await page.goto('/meetings/add')
    await expect(page.getByLabel('Subject')).toBeVisible()
    await page.getByLabel('Subject').fill(subject)

    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await page.getByRole('option', { name: people[0].name, exact: true }).click()

    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await page.getByRole('option', { name: 'Demo User', exact: true }).click()
    await page.keyboard.press('Escape')

    await page.getByRole('combobox', { name: 'Room' }).click()
    await page.getByRole('option', { name: rooms[0].name, exact: false }).click()

    if (dateOffsetDays !== undefined) {
      const date = new Date()
      date.setDate(date.getDate() + dateOffsetDays)
      await page.getByRole('group', { name: 'Date' }).getByRole('spinbutton', { name: 'Year' }).click()
      await page.keyboard.type(
        `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`,
      )
    }

    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(/\/rooms\/.+\/availability/)
  }

  test('appears in Home page "Needs your response", and a quick-respond button clears it live', async ({ page }) => {
    const subject = `Needs response test ${Date.now()}`
    await createMeetingAsAttendee(page, subject)

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Needs your response' })).toBeVisible()
    const card = page.getByRole('region', { name: subject, exact: true })
    await expect(card.getByText(people[0].name, { exact: false })).toBeVisible()

    await card.getByRole('button', { name: 'Going', exact: true }).click()

    // The card leaves "Needs your response" - Apollo's normalised cache overwrites Meeting:<id>
    // from the mutation's own response, so this needs no reload or refetch to reflect it.
    await expect(page.getByRole('region', { name: subject, exact: true })).toHaveCount(0)

    // And the same meeting's Today card now carries a "Going" status badge.
    const todayCard = page.getByRole('button', { name: new RegExp(subject) })
    await expect(todayCard.getByRole('img', { name: 'Going', exact: true })).toBeVisible()
  })

  // mootmaker-webapp#122: the sibling test above only ever exercises `initialNeedsResponse`
  // (HomePage.tsx's default 3-day window, reactively derived from the PAGE_LOAD query's own
  // cache-backed data) - it passed while this exact scenario was broken in production, because
  // nothing exercised "Search further ahead"'s own `extraEntries` state at all. That state is a
  // plain useState snapshot taken once per click and never re-filtered afterward, unlike
  // initialNeedsResponse, so a card found this way stays stuck showing as pending even after a
  // successful response. This is the Integration-layer test that would have caught it: no real
  // AWS needed, since the bug is pure client-side state staleness, not a server or wiring problem
  // between real services - see the issue for the layer analysis.
  test('a card found via "Search further ahead" also clears live after responding', async ({ page }) => {
    const subject = `Search further ahead response test ${Date.now()}`
    // 6 days out: past the initial window (offsets 0-2) and past the first "Search further
    // ahead" click's own new window (offsets 3-5) - matches acceptance/tests/home-page.spec.ts's
    // D.112 same choice of offset, for the same reason (exercises a click that finds nothing
    // before the click that does).
    await createMeetingAsAttendee(page, subject, 6)

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Needs your response' })).toBeVisible()
    await expect(page.getByRole('region', { name: subject, exact: true })).toHaveCount(0)

    const searchButton = page.getByRole('button', { name: 'Search further ahead' })
    const card = page.getByRole('region', { name: subject, exact: true })
    for (let attempt = 0; attempt < 5 && (await card.count()) === 0; attempt++) {
      await searchButton.click()
      await page.waitForTimeout(300)
    }
    await expect(card).toBeVisible()

    await card.getByRole('button', { name: 'Going', exact: true }).click()

    // The mutation itself succeeds either way (asserted structurally: the button click doesn't
    // throw, and the sibling test above already proves respondToMeeting's own mock handler
    // works) - what's under test is specifically whether the CARD reflects it, which is exactly
    // what stayed broken for an extra-window entry.
    await expect(page.getByRole('region', { name: subject, exact: true })).toHaveCount(0)
  })

  test('meeting detail sheet shows "You" and a working self-response control, not a badge, on the caller\'s own row', async ({
    page,
  }) => {
    const subject = `Detail control test ${Date.now()}`
    await createMeetingAsAttendee(page, subject)

    await page.goto('/')
    await page.getByRole('button', { name: new RegExp(subject) }).first().click()

    // "Attendees · N" heading anchors the sheet's attendee list, which is where "You" and the
    // control below must appear - scoped rather than a bare page-wide getByText, since the
    // signed-in user's own name ("Demo User") also appears in the app's own header/sidebar chrome.
    const attendeesSection = page.getByText(/^Attendees ·/).locator('xpath=..')
    await expect(attendeesSection.getByText('You', { exact: true })).toBeVisible()

    const control = page.getByRole('group', { name: 'Your response' })
    await expect(control).toBeVisible()
    await control.getByRole('button', { name: 'Maybe', exact: true }).click()

    // Reopen fresh (key={meeting.id} on MeetingDetailContent - see useMeetingDetailOverlay.tsx)
    // and confirm the change actually persisted through respondToMeeting, not just local state.
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: new RegExp(subject) }).first().click()
    await expect(
      page.getByRole('group', { name: 'Your response' }).getByRole('button', { name: 'Maybe', exact: true, pressed: true }),
    ).toBeVisible()
  })
})
