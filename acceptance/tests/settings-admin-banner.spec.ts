import { signInAsAdminUser, signInAsStandardUser } from './support/accounts'
import { expect, test } from './support/test'

// Settings tells an admin where room and person management went (they moved out of Settings to
// their own Rooms and Persons pages), and tells nobody else, since a standard user never had them.
// Admin-only UI, so the admin half is the admin user (mootmaker-webapp#138).

const BANNER = 'Room and person management has moved.'

test('Settings shows an admin where Rooms and Persons moved to', async ({ page }) => {
  await signInAsAdminUser(page)
  await page.goto('/settings')

  const banner = page.getByRole('alert').filter({ hasText: BANNER })
  await expect(banner).toBeVisible()
  await banner.getByRole('link', { name: 'Rooms' }).click()
  await expect(page).toHaveURL('/rooms')
})

test('Settings shows a standard user no such banner', async ({ page }) => {
  await signInAsStandardUser(page)
  await page.goto('/settings')

  await expect(page.getByRole('heading', { name: 'Your name' })).toBeVisible()
  await expect(page.getByText(BANNER)).toHaveCount(0)
})
