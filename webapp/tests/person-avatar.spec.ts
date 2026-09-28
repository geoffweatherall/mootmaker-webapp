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
 * The assertion that matters. An <img> being PRESENT proves nothing: the bug this guards against
 * left the element in place and merely failed to decode, because an SPA serves index.html (HTTP
 * 200, text/html) for an unmatched path rather than a visible 404. Only naturalWidth proves real
 * image bytes arrived and decoded.
 */
async function expectImageActuallyLoaded(img: Locator) {
  await expect(img).toHaveCount(1)
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 5000 })
    .toBeGreaterThan(0)
}

// See designs/archive/person-avatar-photos.md. fixtures.ts gives Carol Chen a leading-slash photo,
// Alice Anderson a bare one, Erin Fisher one pointing at a file that doesn't exist, and everyone
// else none - between them they cover every branch PersonAvatar has.
test.describe('Person avatar photos', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows a photo for a person who has one, and initials for one who does not', async ({ page }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()

    await expectImageActuallyLoaded(personCard(page, 'Carol Chen').locator('img'))
    // Bob Brown has no photoUrl - PersonAvatar falls back to initials, with no <img> at all.
    await expect(personCard(page, 'Bob Brown').locator('img')).toHaveCount(0)
    await expect(personCard(page, 'Bob Brown').getByText('BB', { exact: true })).toBeVisible()
  })

  // Regression test for the bug that shipped in the first cut of this feature: the stored path was
  // resolved against the current DOCUMENT, so it only worked on depth-1 routes like /persons. From
  // anything deeper the browser requested e.g. /persons/<id>/avatars/x.jpg, got index.html back at
  // status 200, and the initials fallback hid the failure. Both stored forms are checked from a
  // two-segment route, since nothing across the repo boundary enforces which one arrives.
  test('a photo still loads from a route deeper than one segment, leading slash or not', async ({
    page,
  }) => {
    await signIn(page, ADMIN_USER)
    await page.goto('/persons/person-carol/calendar')
    expect(new URL(page.url()).pathname.split('/').filter(Boolean).length).toBeGreaterThan(1)

    await page.getByRole('combobox', { name: 'Person' }).click()

    // Carol's fixture path carries the leading slash; Alice's deliberately does not.
    await expectImageActuallyLoaded(
      page.getByRole('option', { name: 'Carol Chen', exact: true }).locator('img'),
    )
    await expectImageActuallyLoaded(
      page.getByRole('option', { name: 'Alice Anderson', exact: true }).locator('img'),
    )
  })

  test('falls back to initials if the photo fails to load', async ({ page }) => {
    // Erin Fisher's fixture photoUrl points at a file this webapp build doesn't actually have (see
    // fixtures.ts) - a real 404 from the dev server, not a mocked one, so this exercises the same
    // MUI Avatar load-failure path a real deployment would hit on a filename drift.
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()

    await expect(personCard(page, 'Erin Fisher').locator('img')).toHaveCount(0)
    await expect(personCard(page, 'Erin Fisher').getByText('EF', { exact: true })).toBeVisible()
  })
})
