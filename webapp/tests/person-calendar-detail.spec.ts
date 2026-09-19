import { test, expect } from '@playwright/test'
import { people } from '../src/testSupport/mocks/fixtures'

// Covers the new tap-to-detail behaviour on Person Calendar (see designs/room-availability-and-
// person-calendar-redesign.md): the FAB hiding while a meeting's detail is open, and the same tap
// opening a different surface depending on viewport width (a modal bottom sheet under md, a
// non-modal side panel at/above it) - both explicitly called out in that design's Testing impacts.

test.describe('Person Calendar - meeting detail', () => {
  test('the Add Meeting FAB hides while a meeting detail is open and reappears once closed', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))
    const subject = `Detail FAB test ${Date.now()}`
    const organiser = people[0]

    await page.goto('/meetings/add')
    await page.getByLabel('Subject').fill(subject)
    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await page.getByRole('option', { name: organiser.name, exact: true }).click()
    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await page.getByRole('option').first().click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Suggest a room' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(/\/rooms\/.+\/availability/)

    await page.goto(`/persons/${organiser.id}/calendar`)
    const fab = page.getByRole('link', { name: 'Add Meeting' })
    await expect(fab).toBeVisible()

    await page.getByRole('button', { name: new RegExp(subject) }).click()
    await expect(page.getByText(subject).first()).toBeVisible()
    await expect(fab).toHaveCount(0)

    // Wide viewport (this config's default, >=md): dismiss via the panel's own Close button -
    // there's deliberately no backdrop here, see PersonCalendarPage.tsx's own comment on why.
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(fab).toBeVisible()
  })

  test('opens as a bottom sheet under md, a side panel at/above it - same tap, different surface', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))
    const subject = `Detail surface test ${Date.now()}`
    const organiser = people[0]

    await page.goto('/meetings/add')
    await page.getByLabel('Subject').fill(subject)
    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await page.getByRole('option', { name: organiser.name, exact: true }).click()
    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await page.getByRole('option').first().click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Suggest a room' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(/\/rooms\/.+\/availability/)

    // Narrow first (under MUI's md breakpoint, 900px) - the modal bottom sheet, with a Close
    // button and a dark scrim that dismisses on click, same as any other modal in this app.
    await page.setViewportSize({ width: 400, height: 800 })
    await page.goto(`/persons/${organiser.id}/calendar`)
    await page.getByRole('button', { name: new RegExp(subject) }).click()
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible()
    // MUI's Drawer backdrop - clicking it dismisses, confirming this surface really is modal.
    // Not the top-left corner: the fixed AppBar sits there and intercepts the click.
    // Checking the Close button (not the subject text) disappears - the day list's own row for
    // this meeting keeps showing the subject regardless of whether its detail sheet is open.
    await page.locator('.MuiBackdrop-root').click({ position: { x: 200, y: 400 } })
    await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0)

    // Wide next (>=900px) - the same tap now opens the non-modal side panel: no backdrop element
    // at all, and the day list stays clickable (its own meeting rows aren't covered by anything).
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.getByRole('button', { name: new RegExp(subject) }).click()
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible()
    await expect(page.locator('.MuiBackdrop-root')).toHaveCount(0)
  })
})
