import { test, expect } from '@playwright/test'
import { people } from '../src/testSupport/mocks/fixtures'

// Covers MeetingDetailsPage's "Date" + "Time" rows - split apart so a meeting's date is shown
// once, rather than the full start and end date-times (each repeating the same date) shown
// separately. This matches the convention already followed everywhere else a meeting's start/end
// appear: RoomAvailabilityPage's tooltip, PersonCalendarPage, and HomePage's agenda lists all show
// a time-only range next to a date that's already established by the surrounding view (the
// selected day, the calendar's day cell, or the "Today"/"Tomorrow" heading).

test.describe('Meeting details - date shown once, not per start/end', () => {
  test('shows a single date and a start-end time, with no duplicated date', async ({ page, context }) => {
    // AddMeetingPage defaults the date to "today" and the start time to the next 15-minute
    // boundary - fine most of the time, but PersonCalendarPage only ever shows Monday-Friday (see
    // README.md's Person Calendar section), so this test would flake whenever it happened to run
    // on a weekend. Pinning just Date.now()/new Date() (not the timers - setFixedTime keeps those
    // running normally, unlike clock.install()) to a known weekday, safely inside business hours,
    // makes that deterministic instead of leaving it to whatever day this suite happens to run on.
    await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))

    // Forces MeetingDetailContent's Share button down its clipboard-fallback branch
    // deterministically, rather than depending on whether this browser happens to expose
    // navigator.share - see designs/meeting-detail-consolidation.md's Testing impacts, and the
    // identical technique in acceptance/tests/meeting-details.spec.ts's H.74.
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
    })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    const subject = `E2E meeting details ${Date.now()}`

    await page.goto('/meetings/add')
    await page.getByLabel('Subject').fill(subject)

    // A fixed person from the mock data (rather than "whichever option is first"), so the id
    // needed afterwards to reach their Person Calendar (see below) - unlike RoomAvailabilityPage's
    // timeline, that view lists every meeting for the day as plain rows with no business-hours
    // clamping, so it works regardless of what time of day this test happens to run - can be read
    // straight from the fixture instead of an option element's DOM attributes.
    const organiser = people[0]
    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await page.getByRole('option', { name: organiser.name, exact: true }).click()

    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await page.getByRole('option').first().click()
    await page.keyboard.press('Escape')

    // "Suggest a room" rather than picking a room directly - guarantees one that's actually free
    // for the chosen time, the same reasoning as suggest-room.spec.ts's own tests.
    const suggestButton = page.getByRole('button', { name: 'Suggest a room' })
    await suggestButton.click()
    await expect(suggestButton).toBeEnabled()

    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(/\/rooms\/.+\/availability/)

    // Reached via Room Availability, not Person Calendar - a room's meetings sit inside a
    // Collapse'd "See <day>'s meetings" panel by default (see the redesign's room-status-card
    // decision), so the room's own card needs expanding before its meeting row is clickable.
    // getByText(subject) alone would match twice while the room is busy right now (the status
    // pill's own caption also shows the subject, e.g. "Busy until 11:00") - going via the card's
    // "See ... meetings" button keeps this unambiguous.
    const card = page
      .getByText(subject, { exact: true })
      .first()
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
    await card.getByRole('button', { name: /^See .+'s meetings/ }).click()
    // The row now opens the shared sheet/panel in place, not a navigation - see
    // designs/meeting-detail-consolidation.md. Reach MeetingDetailsPage (this test's actual
    // subject) via the sheet's own Share button, the same way a real user would end up there: it
    // writes this meeting's real URL to the clipboard (forced onto that branch above), which is
    // read back and visited directly.
    await card.getByRole('button', { name: new RegExp(subject) }).click()
    await page.getByRole('button', { name: 'Share meeting' }).click()
    const meetingUrl = await page.evaluate(() => navigator.clipboard.readText())
    expect(meetingUrl).toMatch(/\/meetings\/.+/)

    await page.goto(meetingUrl)
    await expect(page.getByRole('heading', { name: subject })).toBeVisible()

    // MeetingDetailContent (shared by the sheet/panel and this full page) shows the date and the
    // start-end time as plain, unlabelled lines - unlike the full page's old DetailRow layout,
    // there is no "Date"/"Time" label to anchor on, so this looks for the shapes themselves within
    // the rendered content instead.
    const pageText = await page.getByRole('main').innerText()

    const dateMatch = pageText.match(/(\d{4}-\d{2}-\d{2})/)
    const timeMatch = pageText.match(/(\d{2}:\d{2}–\d{2}:\d{2})/)

    expect(dateMatch, 'expected a YYYY-MM-DD date somewhere in the content').not.toBeNull()
    expect(timeMatch, 'expected an HH:mm–HH:mm time range somewhere in the content').not.toBeNull()

    // The date appears exactly once - the time range has no date folded into it.
    const timeValue = timeMatch![1]
    expect(timeValue).not.toContain('-')
    expect(timeValue).not.toMatch(/\d{4}/)
    expect(pageText.match(new RegExp(dateMatch![1], 'g'))).toHaveLength(1)
  })
})
