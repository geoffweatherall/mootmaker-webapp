import { test, expect } from '@playwright/test'

// Run these tests signed out, ignoring the saved session from auth.setup.ts.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Authentication', () => {
  test('home page is visible without signing in', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Welcome to Room Booking' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  })

  test('signed-out home page offers a one-click demo sign-in when configured', async ({ page }) => {
    await page.goto('/')

    // The embedded form is pre-filled from VITE_DEMO_USER_EMAIL/VITE_DEMO_USER_PASSWORD, which
    // aren't set in every environment (e.g. a .env predating this feature) - skip rather than
    // fail when that's the case, matching the E2E_USER_* skip pattern used elsewhere in this file.
    const prefilledEmail = await page.getByRole('textbox', { name: 'Email' }).inputValue()
    test.skip(!prefilledEmail, 'VITE_DEMO_USER_EMAIL / VITE_DEMO_USER_PASSWORD not configured')

    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  for (const path of [
    '/persons/some-id/calendar',
    '/rooms/add',
    '/rooms/2026-01-01/availability',
    '/bookings/add',
    '/bookings/some-id',
  ]) {
    test(`visiting ${path} while signed out redirects to the sign-in form`, async ({ page }) => {
      await page.goto(path)

      await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
      await expect(page).toHaveURL('/signin')
    })
  }

  test('signing in from a protected page returns to that page after sign-in', async ({ page }) => {
    const email = process.env.E2E_USER_EMAIL
    const password = process.env.E2E_USER_PASSWORD
    test.skip(!email || !password, 'E2E_USER_EMAIL / E2E_USER_PASSWORD not set')

    await page.goto('/rooms/add')
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()

    await page.getByLabel('Email').fill(email!)
    await page.getByLabel('Password').fill(password!)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/rooms/add')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('signing out returns to the home page and protected pages lock again', async ({ page }) => {
    const email = process.env.E2E_USER_EMAIL
    const password = process.env.E2E_USER_PASSWORD
    test.skip(!email || !password, 'E2E_USER_EMAIL / E2E_USER_PASSWORD not set')

    await page.goto('/signin')
    await page.getByLabel('Email').fill(email!)
    await page.getByLabel('Password').fill(password!)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()

    await page.goto('/rooms/add')
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  })

  test('wrong password shows an error and stays on the sign-in form', async ({ page }) => {
    await page.goto('/signin')

    await page.getByLabel('Email').fill('nobody@example.com')
    await page.getByLabel('Password').fill('Wrong-password-1!')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL('/signin')
  })
})
