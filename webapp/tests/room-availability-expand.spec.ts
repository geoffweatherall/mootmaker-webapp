import { test, expect } from '@playwright/test'
import { rooms } from '../src/testSupport/mocks/fixtures'

// mootmaker-webapp#116: expanding a room's meetings belongs to the day being viewed. Changing day
// only changes the URL, so the page stays mounted - each day must still start collapsed.
test.describe('Room Availability - expanded rooms', () => {
  test('every room starts collapsed on a new day, including one revisited', async ({ page }) => {
    await page.goto('/rooms/2026-08-19/availability')
    const toggle = page
      .getByText(rooms[0].name, { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
      .getByRole('button', { name: /'s meetings/ })

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page).toHaveURL(/\/rooms\/2026-08-20\/availability/)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page).toHaveURL(/\/rooms\/2026-08-19\/availability/)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
