import { test, expect, type Page } from '@playwright/test'

// mootmaker-webapp#85: choosing a date in Room Availability's picker changes the day shown, and only
// once the date is committed. Typing "17" must not visit the 1st on the way.

const START = '/rooms/2026-10-14/availability'

async function open(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-14T10:00:00'))
  await page.goto(START)
  await expect(page.getByRole('spinbutton', { name: 'Day', exact: true })).toBeVisible()
}

test('typing a day goes straight to it, never through the days on the way', async ({ page }) => {
  await open(page)
  const visited: string[] = []
  page.on('framenavigated', (frame) => frame === page.mainFrame() && visited.push(new URL(frame.url()).pathname))

  await page.getByRole('spinbutton', { name: 'Day', exact: true }).click()
  await page.keyboard.type('17')
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL('/rooms/2026-10-17/availability')
  expect(visited).toEqual(['/rooms/2026-10-17/availability'])
})

test('choosing a day from the calendar changes the page', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: /choose date/i }).click()
  await page.getByRole('gridcell', { name: '17' }).click()
  await expect(page).toHaveURL('/rooms/2026-10-17/availability')
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true })

  test('choosing a day and confirming changes the page', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: /choose date/i }).tap()
    await page.getByRole('gridcell', { name: '17' }).tap()
    const ok = page.getByRole('button', { name: 'OK' })
    if (await ok.isVisible()) await ok.tap()
    await expect(page).toHaveURL('/rooms/2026-10-17/availability')
  })
})
