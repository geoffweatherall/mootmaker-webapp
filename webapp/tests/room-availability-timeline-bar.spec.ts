import { test, expect } from '@playwright/test'
import { people, rooms } from '../src/testSupport/mocks/fixtures'

// mootmaker-webapp#95: segmentsForRoom's pure math is unit-tested (roomAvailabilityLogic.test.ts),
// but nothing proved RoomAvailabilityPage actually wires a room's meetings into the right number
// of rendered segments in the busy/free timeline bar. Complements the acceptance-level proof
// (mootmaker-webapp#94) that the bar updates live from a real cross-client broadcast - this layer
// instead isolates the simpler, cheaper question: given query data, is the render correct.
test.describe('Room Availability - timeline bar', () => {
  test('renders one segment per meeting the room actually has', async ({ page }) => {
    const room = rooms[0]
    const subject = `Timeline bar test ${Date.now()}`

    // AddMeetingPage defaults the start time to the next 15-minute boundary from "now" - fine most
    // of the time, but the timeline bar only renders meetings inside its 08:00-18:00 window
    // (mootmaker-webapp#114), so this test would flake whenever it happened to run outside that
    // window. Pinning just Date.now()/new Date() (not the timers - setFixedTime keeps those running
    // normally, unlike clock.install()) to a known time safely inside the window, as
    // meeting-details.spec.ts already does for business hours generally, makes that deterministic.
    await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))

    await page.goto('/meetings/add')
    await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
    await page.getByLabel('Subject').fill(subject)
    // The mock e2e user has no default organiser (unlike the real deployed demo user this
    // repo's acceptance suite signs in as), so this must be picked explicitly.
    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await page.getByRole('option', { name: people[0].name, exact: true }).click()
    await page.getByRole('combobox', { name: 'Room' }).click()
    await page.getByRole('option', { name: room.name, exact: false }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(/\/rooms\/.+\/availability/)

    const roomCard = page
      .getByText(room.name, { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')

    // The bar is deliberately aria-hidden (a purely visual summary of information already
    // available as text elsewhere on the card), so it has no accessible role to query by -
    // located structurally instead, as the element immediately before the "...'s meetings" toggle
    // button (same approach as the acceptance-level test, #94).
    const bar = roomCard.getByRole('button', { name: /'s meetings/ }).locator('xpath=preceding-sibling::*[1]')
    await expect(bar.locator('> div')).toHaveCount(1)
  })
})
