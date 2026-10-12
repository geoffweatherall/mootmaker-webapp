import { pinnedWeekday } from './support/pinnedDates'
import { standardUser } from './support/accounts'
import { uniqueId } from './support/env'
import { expect, test } from './support/test'

// mootmaker-webapp#4: the main booking flow on a 360px touch screen, against a real deployment.
// The mocked integration suite (webapp/tests/phone.spec.ts) covers each page's layout in detail;
// this proves the same flow end to end on the real stack.

test.use({ viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true })

test('on a phone: book a meeting, open it, and edit it', async ({ page, api }) => {
  const id = uniqueId()
  const room = `Phone Room ${id}`
  await api.createRoom(room, 6)
  await page.clock.setFixedTime(pinnedWeekday('Wednesday', { hour: 10 }))
  // Not signInAsStandardUser: it waits for "Sign out", which on a phone is inside the closed menu.
  const account = standardUser()
  await page.goto('/signin')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).tap()
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible()

  await page.goto('/meetings/add')
  await page.getByLabel('Subject').fill(`Phone meeting ${id}`)
  await page.getByRole('combobox', { name: 'Room' }).tap()
  await page.getByRole('option', { name: new RegExp(room) }).tap()
  const save = page.getByRole('button', { name: 'Save' })
  await save.scrollIntoViewIfNeeded()
  await save.tap()

  // Room Availability opens at its top, not at the form's scroll position.
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
  await expect(page.getByRole('button', { name: 'Previous day' })).toBeInViewport()

  const card = page
    .getByText(room, { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
  await card.getByRole('button', { name: /'s meetings/ }).tap()
  await card.getByRole('button', { name: new RegExp(`Phone meeting ${id}`) }).tap()

  const edit = page.getByRole('link', { name: 'Edit meeting' })
  await expect(edit).toBeInViewport()
  await edit.tap()
  await expect(page.getByRole('heading', { name: 'Edit Meeting' })).toBeVisible()
  await page.getByLabel('Subject').fill(`Phone meeting ${id}, edited`)
  await page.getByRole('button', { name: 'Save' }).tap()
  await expect(page.getByText(`Phone meeting ${id}, edited`).first()).toBeVisible()

  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ])
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})
