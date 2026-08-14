import { test, expect, type Page } from '@playwright/test'
import { DEMO_USER } from '../src/auth/cognito.mock'

// No leading `^`: expect(page).toHaveURL(regExp) matches the full absolute URL (including the
// origin), unlike a plain string argument, which resolves relative to baseURL.
const CALENDAR_PATH_PATTERN = /\/persons\/[^/]+\/calendar$/

/**
 * The "Calendar" nav item's target depends on the signed-in user's own personId, which resolves
 * asynchronously (a MyPerson query AuthProvider fires after sign-in) - unlike every other nav
 * item, whose target needs no lookup. These tests hold that one GraphQL operation open on demand
 * so the still-resolving window is observable deterministically, instead of racing the mocked
 * network (which normally resolves near-instantly).
 *
 * Implemented via a gate the MSW handler (src/testSupport/mocks/handlers.ts) checks before
 * resolving the "MyPerson" operation, armed through `page.addInitScript` - which runs before any
 * of the page's own scripts, so the gate is in place before AuthProvider's first render can fire
 * the query - and released through `page.evaluate` once the test is done observing the
 * still-loading state.
 */
async function gateMyPersonQuery(page: Page): Promise<() => Promise<void>> {
  await page.addInitScript(() => {
    window.__mockControls = {
      myPersonGate: new Promise<void>((resolve) => {
        // Stashed on window so `release()` below (a separate page.evaluate call) can reach it.
        ;(window as unknown as { __releaseMyPersonGate: () => void }).__releaseMyPersonGate = resolve
      }),
    }
  })
  return () =>
    page.evaluate(() => (window as unknown as { __releaseMyPersonGate: () => void }).__releaseMyPersonGate())
}

test.describe('Calendar nav item while personId is still resolving', () => {
  test('stays enabled before myPerson resolves, shows a spinner instead of navigating early if clicked, then falls back to disabled once resolved with no linked Person', async ({
    page,
  }) => {
    // The saved session (auth.setup.ts) signs in as the mock e2e test user, who has no linked
    // Person - myPerson resolves to null for them, so this also covers the "confirmed
    // unavailable" path.
    const releaseMyPerson = await gateMyPersonQuery(page)

    await page.goto('/')

    // Scoped to the sidebar's <nav> landmark - HomePage's own main-content area also has a
    // "Calendar" button once signed in with a linked Person (see the other describe block below),
    // so an unscoped query would be ambiguous there even though this particular test (the e2e
    // user has no linked Person) never renders that second one.
    const calendarItem = page.getByRole('navigation').getByRole('button', { name: 'Calendar', exact: true })
    await expect(calendarItem).toBeVisible()
    await expect(calendarItem).toBeEnabled()

    await calendarItem.click()

    await expect(calendarItem).toBeDisabled()
    await expect(calendarItem.getByRole('progressbar')).toBeVisible()
    await expect(page).toHaveURL('/')

    await releaseMyPerson()

    await expect(calendarItem.getByRole('progressbar')).not.toBeVisible()
    await expect(calendarItem).toBeDisabled()
    await expect(page).toHaveURL('/')
  })
})

test.describe('Calendar nav item once personId resolves', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("navigates to the signed-in user's calendar once myPerson resolves, if clicked first", async ({ page }) => {
    // The demo user (unlike the mock e2e test user) has a linked Person - see
    // src/auth/cognito.mock.ts - which is what this test needs.
    const releaseMyPerson = await gateMyPersonQuery(page)

    await page.goto('/')
    await page.getByLabel('Email').fill(DEMO_USER.email)
    await page.getByLabel('Password').fill(DEMO_USER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

    // Scoped to the sidebar's <nav> landmark - see the comment in the describe block above.
    const calendarItem = page.getByRole('navigation').getByRole('button', { name: 'Calendar', exact: true })
    await expect(calendarItem).toBeEnabled()

    await calendarItem.click()

    await expect(calendarItem).toBeDisabled()
    await expect(calendarItem.getByRole('progressbar')).toBeVisible()
    await expect(page).toHaveURL('/')

    await releaseMyPerson()

    await expect(page).toHaveURL(CALENDAR_PATH_PATTERN)
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible()
  })
})
