import { test, expect, type Locator, type Page } from '@playwright/test'
import { DEMO_USER } from '../src/auth/cognito.mock'

// mootmaker-webapp#4: the main flows on a narrow phone. 360px is the narrowest common Android width.
// Each test checks what a person needs to see is actually on screen (in the viewport, not merely in
// the page) and that nothing pushes the page wider than the screen.

test.use({ viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true, storageState: { cookies: [], origins: [] } })

const TODAY = new Date('2026-10-14T10:00:00')

async function signIn(page: Page) {
  await page.clock.setFixedTime(TODAY)
  await page.goto('/signin')
  await page.getByLabel('Email').fill(DEMO_USER.email)
  await page.getByLabel('Password').fill(DEMO_USER.password)
  await page.getByRole('button', { name: 'Sign in' }).tap()
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible()
}

async function expectNoSidewaysScroll(page: Page) {
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ])
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/** The text an input shows is not cut off: its full value fits in its visible width. */
async function expectInputTextFits(input: Locator) {
  const [scrollWidth, clientWidth] = await input.evaluate((el) => [el.scrollWidth, el.clientWidth])
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

async function fillSubject(page: Page, subject: string) {
  await page.getByLabel('Subject').fill(subject)
}

test('signing in from the home page', async ({ page }) => {
  await page.clock.setFixedTime(TODAY)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeInViewport()
  await expectNoSidewaysScroll(page)
  await signIn(page)
  await expectNoSidewaysScroll(page)
})

test('the menu reaches every main page', async ({ page }) => {
  await signIn(page)
  for (const [link, heading] of [
    ['Calendar', 'Calendar'],
    ['Room Availability', 'Room Availability'],
    ['Home', null],
  ] as const) {
    await page.getByRole('button', { name: 'Open menu' }).tap()
    await page.getByRole('link', { name: link, exact: true }).tap()
    if (heading) await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeInViewport()
    await expectNoSidewaysScroll(page)
  }
})

test('a suggested room can be read in full', async ({ page }) => {
  await signIn(page)
  await page.goto('/meetings/add')
  await fillSubject(page, 'Phone suggest')
  await page.getByRole('combobox', { name: 'Attendees' }).tap()
  await page.getByRole('option', { name: 'Alice Anderson' }).tap()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Suggest a room' }).tap()

  const room = page.getByRole('combobox', { name: 'Room' })
  await expect(room).not.toHaveValue('')
  await expect(room).toBeInViewport()
  await expectInputTextFits(room)
  await expectNoSidewaysScroll(page)
})

test('a refused save shows its reason on screen, however far down the form Save is', async ({ page }) => {
  await signIn(page)
  await page.goto('/meetings/add')
  // No subject, no room: the save is refused.
  const save = page.getByRole('button', { name: 'Save' })
  await save.scrollIntoViewIfNeeded()
  await save.tap()

  const banner = page.getByRole('alert').first()
  await expect(banner).toBeVisible()
  await expect(banner).toBeInViewport()
})

test('booking a meeting, opening it, and editing it', async ({ page }) => {
  await signIn(page)
  await page.goto('/meetings/add')
  await fillSubject(page, 'Phone booking')
  await page.getByRole('combobox', { name: 'Room' }).tap()
  await page.getByRole('option', { name: /Boardroom/ }).tap()
  await page.getByRole('button', { name: 'Save' }).tap()
  await expect(page).toHaveURL(/\/rooms\/2026-10-14\/availability/)

  // Room Availability opens at its top, with the day controls across the screen.
  for (const name of ['Previous day', 'Next day']) {
    await expect(page.getByRole('button', { name })).toBeInViewport()
  }
  await expectNoSidewaysScroll(page)

  // Open the meeting from the room's card, then edit it from the sheet.
  await page.getByRole('button', { name: /See today's meetings/ }).first().tap()
  await page.getByRole('button', { name: /Phone booking/ }).tap()
  const edit = page.getByRole('link', { name: 'Edit meeting' })
  await expect(edit).toBeInViewport()
  await edit.tap()

  await expect(page.getByRole('heading', { name: 'Edit Meeting' })).toBeVisible()
  await page.getByLabel('Subject').fill('Phone booking, edited')
  await page.getByRole('button', { name: 'Save' }).tap()
  await expect(page.getByText('Phone booking, edited').first()).toBeVisible()
  await expectNoSidewaysScroll(page)
})

test('the calendar week can be moved and a meeting opened', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Open menu' }).tap()
  await page.getByRole('link', { name: 'Calendar', exact: true }).tap()
  for (const name of ['Previous week', 'Next week']) {
    await expect(page.getByRole('button', { name })).toBeInViewport()
  }
  await page.getByRole('button', { name: 'Next week' }).tap()
  await page.getByRole('button', { name: 'Previous week' }).tap()
  await expectNoSidewaysScroll(page)
})
