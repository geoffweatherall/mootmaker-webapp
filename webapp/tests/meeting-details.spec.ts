import { test, expect } from '@playwright/test'

// Covers MeetingDetailsPage's "Date" + "Time" rows - split apart so a meeting's date is shown
// once, rather than the full start and end date-times (each repeating the same date) shown
// separately. This matches the convention already followed everywhere else a meeting's start/end
// appear: RoomAvailabilityPage's tooltip, PersonCalendarPage, and HomePage's agenda lists all show
// a time-only range next to a date that's already established by the surrounding view (the
// selected day, the calendar's day cell, or the "Today"/"Tomorrow" heading).

test.describe('Meeting details - date shown once, not per start/end', () => {
  test('shows a single Date row and a start-end Time row, with no duplicated date', async ({ page }) => {
    // AddMeetingPage defaults the date to "today" and the start time to the next 15-minute
    // boundary - fine most of the time, but PersonCalendarPage only ever shows Monday-Friday (see
    // README.md's Person Calendar section), so this test would flake whenever it happened to run
    // on a weekend. Pinning just Date.now()/new Date() (not the timers - setFixedTime keeps those
    // running normally, unlike clock.install()) to a known weekday, safely inside business hours,
    // makes that deterministic instead of leaving it to whatever day this suite happens to run on.
    await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))

    const subject = `E2E meeting details ${Date.now()}`

    await page.goto('/meetings/add')
    await page.getByLabel('Subject').fill(subject)

    await page.getByRole('combobox', { name: 'Organiser' }).click()
    const organiserOption = page.getByRole('option').first()
    // Captured so this meeting can be found afterwards via the organiser's own Person Calendar
    // (see below) - unlike RoomAvailabilityPage's timeline, that view lists every meeting for the
    // day as plain rows with no business-hours clamping, so it works regardless of what time of
    // day this test happens to run.
    const organiserId = await organiserOption.getAttribute('data-value')
    await organiserOption.click()

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

    await page.goto(`/persons/${organiserId}/calendar`)
    await page.getByRole('link', { name: new RegExp(subject) }).click()
    await page.waitForURL(/\/meetings\/.+/)
    await expect(page.getByRole('heading', { name: subject })).toBeVisible()

    // DetailRow renders as a label immediately followed by its value, so a flattened text dump of
    // the page preserves "Date <value>" / "Time <value>" adjacency without depending on exact DOM
    // nesting - avoids a brittle sibling/structural locator for two plain, role-less Typography
    // elements.
    const pageText = await page.getByRole('main').innerText()

    const dateMatch = pageText.match(/Date\s*\n?(\d{4}-\d{2}-\d{2})/)
    const timeMatch = pageText.match(/Time\s*\n?(\d{2}:\d{2}–\d{2}:\d{2})/)

    expect(dateMatch, 'expected a "Date" row with a YYYY-MM-DD value').not.toBeNull()
    expect(timeMatch, 'expected a "Time" row with an HH:mm–HH:mm value').not.toBeNull()

    // The date appears exactly once (in the Date row) - the Time row's value has no date in it.
    const timeValue = timeMatch![1]
    expect(timeValue).not.toContain('-')
    expect(timeValue).not.toMatch(/\d{4}/)
    expect(pageText.match(new RegExp(dateMatch![1], 'g'))).toHaveLength(1)
  })
})
