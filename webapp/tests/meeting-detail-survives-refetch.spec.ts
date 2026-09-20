import { test, expect } from '@playwright/test'
import { people, rooms } from '../src/testSupport/mocks/fixtures'

// mootmaker-webapp#98: companion to the acceptance-level proof (a real second client's broadcast
// triggers the refetch there). This layer has no real subscription (useDaysInvalidated's socket
// needs a real AppSync endpoint, not available under `vite --mode mock`), but the SAME
// refetchQueries({ include: 'active' }) call also fires from the tab-visibility handler
// (useDaysInvalidated.ts's onVisible) - simulating that is enough to exercise the same "every
// active query refetches while a meeting detail sheet is open" path within one mocked session.
test.describe('Meeting detail sheet - survives a background refetch', () => {
  test('stays open and correct through a visibility-triggered refetch of every active query', async ({ page }) => {
    const room = rooms[0]
    const subject = `Refetch survival test ${Date.now()}`

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
    await roomCard.getByRole('button', { name: /'s meetings/ }).click()
    await roomCard.getByRole('button', { name: subject, exact: false }).click()
    // Scoped to <main> - a lingering "Meeting created" success toast has its own Close button
    // (title="Close") outside <main>, ambiguous against an unscoped query.
    const main = page.getByRole('main')
    await expect(main.getByRole('button', { name: 'Close' })).toBeVisible()
    await expect(page.getByText(subject).first()).toBeVisible()

    // Simulate the tab going to the background and back - the same trigger
    // useDaysInvalidated.ts's onVisible reacts to, independent of the WebSocket.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Still open, still correct - not blanked, not force-closed.
    await expect(main.getByRole('button', { name: 'Close' })).toBeVisible()
    await expect(page.getByText(subject).first()).toBeVisible()
  })
})
