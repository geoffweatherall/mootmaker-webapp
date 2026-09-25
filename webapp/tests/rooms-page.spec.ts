import { test, expect, type Page } from '@playwright/test'
import { ADMIN_USER, DEMO_USER } from '../src/auth/cognito.mock'

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

test.describe('Rooms page', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a standard user has no Rooms link and cannot reach the page directly', async ({ page }) => {
    await signIn(page, DEMO_USER)
    await expect(page.getByRole('link', { name: 'Rooms' })).toHaveCount(0)

    // The real boundary is server-side (see the design doc's "No AppSync schema-level
    // authorization directives") - this only checks the client-side courtesy redirect.
    await page.goto('/rooms')
    await expect(page).toHaveURL('/')
  })

  test('an admin can add, edit and remove a room', async ({ page }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Rooms' }).click()
    await expect(page.getByRole('heading', { name: 'Rooms', level: 1 })).toBeVisible()
    await expect(page.getByText('Boardroom')).toBeVisible()

    await page.getByRole('button', { name: 'Add room' }).click()
    await page.getByRole('textbox', { name: 'Name' }).fill('Beehive')
    await page.getByRole('spinbutton', { name: 'Capacity' }).fill('6')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Beehive')).toBeVisible()
    await expect(page.getByText('Capacity 6')).toBeVisible()

    await page.getByRole('button', { name: 'Edit Beehive' }).click()
    await page.getByRole('textbox', { name: 'Name' }).fill('Beehive Annex')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Beehive Annex')).toBeVisible()
    await expect(page.getByText('Beehive', { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Remove Beehive Annex' }).click()
    await expect(page.getByRole('heading', { name: 'Remove Beehive Annex?' })).toBeVisible()
    await page.getByRole('button', { name: 'Remove room' }).click()
    await expect(page.getByText('Beehive Annex')).toHaveCount(0)
  })

  test('rejects an empty name', async ({ page }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Rooms' }).click()
    await page.getByRole('button', { name: 'Add room' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Name must not be blank.')).toBeVisible()
  })

  // mootmaker-api#75. "None" (no explicit colour) is the default and isn't itself asserted here -
  // every other test in this file already exercises it implicitly, since none of them touch this
  // control at all.
  test('an admin can choose a room colour from the fixed palette, and later clear it back to none', async ({
    page,
  }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Rooms' }).click()

    await page.getByRole('button', { name: 'Add room' }).click()
    await page.getByRole('textbox', { name: 'Name' }).fill('Beehive')
    await page.getByRole('spinbutton', { name: 'Capacity' }).fill('6')
    await page.getByRole('button', { name: 'Violet' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Beehive')).toBeVisible()

    // Re-opening Edit shows the same choice already selected, proving it round-tripped through
    // the mutation and back, not just that the button could be clicked.
    await page.getByRole('button', { name: 'Edit Beehive' }).click()
    await expect(page.getByRole('button', { name: 'Violet', pressed: true })).toBeVisible()

    await page.getByRole('button', { name: 'No colour' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Edit Beehive' }).click()
    await expect(page.getByRole('button', { name: 'No colour', pressed: true })).toBeVisible()
  })
})
