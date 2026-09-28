import { test, expect, type Page } from '@playwright/test'
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

// See designs/person-avatar-photos.md. fixtures.ts gives Carol Chen a photoUrl and every other
// fixture person photoUrl: null, so together they already cover both PersonAvatar branches
// wherever a person renders - this spec targets the Persons page (36px) since it's the simplest
// place to see both side by side.
test.describe('Person avatar photos', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows a photo for a person who has one, and initials for one who does not', async ({ page }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()

    await expect(personCard(page, 'Carol Chen').locator('img[src*="avatars/female-05.jpg"]')).toBeVisible()
    // Bob Brown has no photoUrl - PersonAvatar falls back to initials, with no <img> at all.
    await expect(personCard(page, 'Bob Brown').locator('img')).toHaveCount(0)
    await expect(personCard(page, 'Bob Brown').getByText('BB', { exact: true })).toBeVisible()
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
