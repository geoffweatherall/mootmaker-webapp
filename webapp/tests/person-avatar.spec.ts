import { test, expect, type Page, type Locator } from '@playwright/test'
import { ADMIN_USER } from '../src/auth/cognito.mock'

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

function personCard(page: Page, name: string) {
  return page
    .getByText(name, { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
}

/**
 * The assertion that matters. An <img> being PRESENT proves nothing: MUI's Avatar swaps in the
 * initials when its image fails, and before it does the element is simply there, undecoded. Only
 * naturalWidth proves real image bytes arrived and decoded.
 */
async function expectImageActuallyLoaded(img: Locator) {
  await expect(img).toHaveCount(1)
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 5000 })
    .toBeGreaterThan(0)
}

// fixtures.ts gives Alice Anderson and Carol Chen an avatar, Erin Fisher one the avatar host
// refuses, and everyone else none - between them they cover every branch PersonAvatar has. The
// URLs are absolute and on another origin, as the API returns them; handlers.ts plays the host.
test.describe('Person avatars', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows an avatar for a person who has one, and initials for one who does not', async ({ page }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()

    await expectImageActuallyLoaded(personCard(page, 'Carol Chen').locator('img'))
    // Bob Brown has no avatarUrl - PersonAvatar falls back to initials, with no <img> at all.
    await expect(personCard(page, 'Bob Brown').locator('img')).toHaveCount(0)
    await expect(personCard(page, 'Bob Brown').getByText('BB', { exact: true })).toBeVisible()
  })

  // An avatar is an absolute URL, so where it is rendered from cannot matter - which is the point.
  // This used to be a regression test for a path resolved against the current document, which
  // only worked on routes one segment deep; that rule is gone, and with it the failure. What is
  // left is the plain check that an avatar appears somewhere other than the Persons page.
  test('shows avatars in the person picker too', async ({ page }) => {
    await signIn(page, ADMIN_USER)
    await page.goto('/persons/person-carol/calendar')

    await page.getByRole('combobox', { name: 'Person' }).click()

    await expectImageActuallyLoaded(
      page.getByRole('option', { name: 'Carol Chen', exact: true }).locator('img'),
    )
    await expectImageActuallyLoaded(
      page.getByRole('option', { name: 'Alice Anderson', exact: true }).locator('img'),
    )
  })

  test('falls back to initials if the avatar fails to load', async ({ page }) => {
    // Erin Fisher's avatarUrl names an image the mocked avatar host refuses (see fixtures.ts and
    // handlers.ts), as the real host does for a key that is not there. That exercises the same
    // MUI Avatar load-failure path a deployment would hit on a deleted or unreachable avatar.
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()

    await expect(personCard(page, 'Erin Fisher').locator('img')).toHaveCount(0)
    await expect(personCard(page, 'Erin Fisher').getByText('EF', { exact: true })).toBeVisible()
  })
})
