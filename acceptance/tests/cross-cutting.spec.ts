import { expect, test, type Page } from '@playwright/test'
import { darkTokens, lightTokens } from '../../webapp/src/theme/tokens'

// mootmaker/use-cases.md, section M (Cross-cutting / non-functional), cases 92-99. M.98 is
// deliberately NOT re-implemented here - the catalog explicitly treats J.81's own test as already
// satisfying it (same Apollo InMemoryCache-normalization mechanism, same fixture shape), rather
// than writing a second, separately-fixtured copy - see m-cross-cutting.md's own Notes on tc-m98.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

async function signInAsDemo(page: Page) {
  const demoEmail = requireEnv('DEMO_USER_EMAIL')
  const demoPassword = requireEnv('DEMO_USER_PASSWORD')
  await page.goto('/signin')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
}

// Converts a theme token's hex colour into the "rgb(r, g, b)" form getComputedStyle() returns,
// since MUI's CssBaseline sets a literal backgroundColor from the theme palette (this app doesn't
// use MUI's CSS-variables mode) rather than leaving the hex string intact in computed style.
function hexToRgb(hex: string): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgb(${r}, ${g}, ${b})`
}

test('M.92 - a first cold visit shows a full spinner; a same-session revisit shows stale data plus a slim progress bar', async ({
  page,
}) => {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const roomName = `M92 Room ${runId}`
  const subject = `M92 meeting ${runId}`
  const dateStr = '2026-08-19'
  const availabilityUrl = new RegExp(`/rooms/${dateStr}/availability`)

  // Wednesday, safely inside business hours (08:00-17:00) - see add-meeting.spec.ts's identical
  // pinning for why this matters (RoomAvailabilityPage only ever renders business hours).
  await page.clock.setFixedTime(new Date(`${dateStr}T10:00:00`))

  await signInAsDemo(page)

  // Precondition room, created fast (no artificial delay yet) - same pattern as
  // add-meeting.spec.ts. This also happens to warm LIST_ROOMS' cache-first cache, which is fine:
  // this use case's "first load" half is specifically about *meetings* for a not-yet-visited day,
  // not rooms - see this test's own comments below for why that still exercises showSpinner.
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add room' }).click()
  const addRoomDialog = page.getByRole('dialog')
  await addRoomDialog.getByLabel('Name').fill(roomName)
  await addRoomDialog.getByLabel('Capacity').fill('4')
  await addRoomDialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(roomName)).toBeVisible()

  // From here on, every GraphQL round trip (including the createMeeting mutation below, and both
  // queries RoomAvailabilityPage fires on mount) is artificially delayed - a real deployed
  // environment is normally too fast to reliably catch a transient loading state otherwise. See
  // m-cross-cutting.md's own Notes on tc-m92.
  const graphqlUrl = requireEnv('GRAPHQL_API_URL')
  await page.route(graphqlUrl, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800))
    await route.continue()
  })

  const circularProgress = page.locator('.MuiCircularProgress-root')
  const linearProgress = page.locator('.MuiLinearProgress-root')

  // (a) Submitting the meeting redirects straight to that day's Room Availability - the first
  // time this session anything has queried *meetings* for this specific day (LIST_MEETINGS is
  // cache-and-network, so there's no cached data for this day's filter yet, regardless of rooms
  // already being cached) - so showSpinner's "meetingsLoading && !meetingsData" half is true,
  // and the full-page CircularProgress shows.
  await page.goto('/meetings/add')
  await page.getByLabel('Subject').fill(subject)
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: roomName, exact: false }).click()
  await page.getByRole('button', { name: 'Save' }).click()

  await page.waitForURL(availabilityUrl)
  await expect(circularProgress).toBeVisible()
  await expect(circularProgress).toBeHidden()
  await expect(page.getByText(subject)).toBeVisible()

  // (b) Navigating away and back to the exact same day - via real in-app link clicks, not
  // page.goto (a full page.goto would be a hard navigation that resets Apollo's whole in-memory
  // cache itself, defeating the entire premise of this half of the test). The sidebar's own
  // "Room Availability" link always points at today's date, which - with the clock pinned above -
  // is exactly this same dateStr. LIST_ROOMS and this day's LIST_MEETINGS are both already
  // cached, so the stale meeting renders immediately while cache-and-network's background refetch
  // runs behind a slim LinearProgress - no full-page spinner, no flash of empty content.
  await page.getByRole('link', { name: 'Home' }).click()
  await page.getByRole('link', { name: 'Room Availability' }).click()
  await page.waitForURL(availabilityUrl)

  await expect(page.getByText(subject)).toBeVisible()
  await expect(linearProgress).toBeVisible()
  await expect(circularProgress).toHaveCount(0)
  await expect(linearProgress).toBeHidden()
})

test('M.93 - a transport error (API unreachable) shows a readable ErrorBanner, not a blank page', async ({
  page,
}) => {
  await signInAsDemo(page)

  const graphqlUrl = requireEnv('GRAPHQL_API_URL')
  // Scoped to this one page/test only - see m-cross-cutting.md's own Notes on why this is safe
  // even in a workers:1 suite against a real, possibly-shared environment.
  await page.route(graphqlUrl, (route) => route.abort())

  await page.goto(`/rooms/${new Date().toISOString().slice(0, 10)}/availability`)

  // The page's own static chrome still renders - not a blank page or an unhandled React error
  // boundary - alongside a non-empty, readable error message in the banner.
  await expect(page.getByRole('heading', { name: 'Room Availability' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
  const banner = page.getByRole('alert')
  await expect(banner).toBeVisible()
  const bannerText = await banner.textContent()
  expect(bannerText?.trim().length ?? 0).toBeGreaterThan(0)
})

test('M.94 - a corrupted/expired session fails gracefully on the next API call, not with a crash', async ({
  page,
}) => {
  await signInAsDemo(page)

  // Simulates expiry (waiting out a real Cognito token TTL isn't practical in a test): corrupt
  // every amazon-cognito-identity-js token value in localStorage so getSession() can neither
  // treat the cached tokens as valid nor transparently refresh them (see auth/cognito.ts's
  // currentSession()). Matched by suffix rather than a guessed exact key, since the middle
  // segment of the key (<clientId>.<username>) is an internal library detail this test
  // deliberately doesn't hardcode - see m-cross-cutting.md's own Notes on tc-m94.
  const corruptedKeys = await page.evaluate(() => {
    const touched: string[] = []
    for (const key of Object.keys(localStorage)) {
      if (
        key.startsWith('CognitoIdentityServiceProvider.') &&
        (key.endsWith('.idToken') || key.endsWith('.accessToken') || key.endsWith('.refreshToken'))
      ) {
        localStorage.setItem(key, 'corrupted-not-a-real-token')
        touched.push(key)
      }
    }
    return touched
  })
  expect(corruptedKeys.length).toBeGreaterThan(0)

  // Trigger a fresh API call by navigating to another authenticated page - SettingsPage's
  // RoomsSection issues its own LIST_ROOMS query on mount (the demo user is meant to be admin;
  // see this file's sibling authorization-boundaries.spec.ts for a note on this environment's
  // demo user's custom:class currently being broken - that account being non-admin right now
  // doesn't change this test's own reasoning below, since NameSection alone is proof enough of
  // "no crash", and any query erroring is proof enough of "the next API call fails gracefully").
  await page.goto('/settings')

  // Which of the two acceptable outcomes happens depends on amazon-cognito-identity-js's own
  // internals, confirmed against a real run's network trace: getSession() finds the (corrupted but
  // present) refresh token and calls refreshSession(), which retries the doomed request with
  // jitteredExponentialRetry (Client.js) regardless of the error being a definitive 400
  // NotAuthorizedException rather than anything transient - 6 attempts, backing off up to 5s each,
  // ~7.5s of wall-clock time in total - before finally giving up and resolving the session as null.
  // AuthProvider's loadSession() only flips `initialising` to false once that settles, so
  // RequireAuth (which renders nothing while initialising) doesn't decide "no email -> redirect to
  // /signin" until then either.
  //
  // The original version of this test asserted the Settings/Your name headings unconditionally
  // *before* checking for a redirect - which contradicts the redirect outcome it's supposed to
  // tolerate: if the app redirects (confirmed to be exactly what happens here, and the "ideal"
  // outcome the use case itself asks for), SettingsPage never mounts, so those headings correctly
  // never appear, and the original hard assertion just timed out first. Wait for the redirect (with
  // enough headroom for the ~7.5s retry storm above) before deciding which branch applies, rather
  // than assuming the page always stays put.
  const redirectedToSignIn = await page
    .waitForURL('**/signin', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false)

  let bannerVisible = false
  if (!redirectedToSignIn) {
    // Didn't redirect - the other acceptable outcome still requires proof the page rendered safely
    // (no unhandled crash/blank page): the heading and the (still-admin-or-not) "Your name" section
    // both render regardless of what the corrupted session does to any query.
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your name' })).toBeVisible()
    bannerVisible = await page
      .getByRole('alert')
      .first()
      .isVisible()
      .catch(() => false)
  }

  test.info().annotations.push({
    type: 'M.94 observed outcome',
    description: redirectedToSignIn
      ? 'redirected to /signin (the "ideal" outcome)'
      : bannerVisible
        ? 'stayed on the page and showed an ErrorBanner (the generic-error fallback)'
        : 'neither redirected nor showed a visible ErrorBanner - worth a closer look',
  })
  expect(redirectedToSignIn || bannerVisible).toBe(true)
})

test('M.95 - a fresh hard navigation straight to a nested client-side route loads the SPA, not a 404', async ({
  page,
  context,
}) => {
  await signInAsDemo(page)

  // A genuinely fresh page - never loaded the SPA via any client-side navigation - sharing the
  // same context's (and so the same signed-in session's) localStorage, so this exercises the
  // CloudFront rewrite rule itself rather than client-side routing already primed by an earlier
  // "/" visit. See m-cross-cutting.md's own Notes on why this needs a fresh page/context.
  const freshPage = await context.newPage()
  const response = await freshPage.goto('/meetings/add')

  expect(response?.status()).toBe(200)
  await expect(freshPage.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
  await freshPage.close()
})

test('M.96 - light/dark mode follows OS prefers-color-scheme, with no in-app toggle', async ({
  page,
}) => {
  await signInAsDemo(page)

  async function backgroundColorsAcrossPages(): Promise<string[]> {
    const colors: string[] = []
    for (const path of ['/', '/settings', `/rooms/${new Date().toISOString().slice(0, 10)}/availability`]) {
      await page.goto(path)
      const color = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      colors.push(color)
    }
    return colors
  }

  await page.emulateMedia({ colorScheme: 'dark' })
  const darkColors = await backgroundColorsAcrossPages()
  for (const color of darkColors) {
    expect(color).toBe(hexToRgb(darkTokens.bg))
  }

  await page.emulateMedia({ colorScheme: 'light' })
  const lightColors = await backgroundColorsAcrossPages()
  for (const color of lightColors) {
    expect(color).toBe(hexToRgb(lightTokens.bg))
  }

  // Sanity check: emulation actually took effect (the two sets of readings genuinely differ),
  // not just two identical, coincidentally-passing reads.
  expect(darkColors[0]).not.toBe(lightColors[0])
})

test('M.97 - the mobile nav flyout opens on the hamburger tap and auto-closes after navigating', async ({
  page,
}) => {
  // Signs in at the default (desktop) viewport first, then switches to mobile - signInAsDemo's own
  // "Sign out" check targets the sidebar's Drawer, which Layout.tsx hides via CSS (not unmounts) at
  // narrow widths, so doing this the other way around leaves that text attached but never visible
  // (confirmed against a real run: "unexpected value 'hidden'" - the exact same failure mode
  // room-availability.spec.ts's E.36 already documents and works around the same way). This doesn't
  // change what M.97 itself is testing, since sign-in isn't part of this case's own assertions.
  await signInAsDemo(page)
  await page.setViewportSize({ width: 375, height: 667 })

  // The desktop/permanent Drawer's identical copy of this same content (Layout.tsx renders
  // `drawerContent` - MenuContent + AccountBox - once per Drawer) is always in the DOM too, just
  // CSS-hidden (display: none) at this viewport. That CSS hiding does NOT stop Playwright's
  // getByRole/getByLabel from resolving it as a match, though - only .toBeVisible()'s own
  // visibility check (evaluated after strict-mode uniqueness) treats it as invisible - confirmed
  // against a real run: an unscoped getByLabel('Settings') hit "strict mode violation ... resolved
  // to 2 elements", one from each Drawer copy. The temporary Drawer's MUI Modal renders as its own
  // role="dialog" (only mounted at all while open, keepMounted defaults to false), so scoping to it
  // reliably isolates just the open flyout's own copy - and once it closes, this same scoped
  // locator naturally resolves to 0 elements too (its role="dialog" root is gone), preserving the
  // "0 matches means closed" reasoning without depending on CSS-hidden exclusion that doesn't
  // actually apply here.
  const mobileDrawer = page.getByRole('dialog')
  const mobileAvailabilityLink = mobileDrawer.getByRole('link', { name: 'Room Availability' })
  const mobileSettingsShortcut = mobileDrawer.getByLabel('Settings')

  await page.getByLabel('Open menu').click()
  await expect(mobileAvailabilityLink).toBeVisible()

  await mobileAvailabilityLink.click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
  await expect(mobileAvailabilityLink).toHaveCount(0)

  // Reopen, this time via the AccountBox's Settings shortcut specifically - a structurally
  // separate component from MenuContent's own items (see m-cross-cutting.md's own Notes on why
  // this is worth checking independently rather than assuming one implies the other).
  await page.getByLabel('Open menu').click()
  await expect(mobileSettingsShortcut).toBeVisible()
  await mobileSettingsShortcut.click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(mobileSettingsShortcut).toHaveCount(0)
})

test('M.99 - a hard reload picks up a room created in another session; a stale cache-first read does not', async ({
  browser,
}) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const roomName = `M99 Room ${runId}`

  try {
    await signInAsDemo(pageA)
    await signInAsDemo(pageB)

    // Both contexts warm their own independent in-memory Apollo cache for LIST_ROOMS
    // (cache-first) by visiting Settings once each.
    await pageA.goto('/settings')
    await pageB.goto('/settings')

    // Before session A creates anything, session B's already-cached room list must NOT show it -
    // a real, distinct-context precondition, not just an already-shared live cache.
    await expect(pageB.getByText(roomName)).toHaveCount(0)

    // Session A creates a new room.
    await pageA.getByRole('button', { name: 'Add room' }).click()
    const addRoomDialog = pageA.getByRole('dialog')
    await addRoomDialog.getByLabel('Name').fill(roomName)
    await addRoomDialog.getByLabel('Capacity').fill('4')
    await addRoomDialog.getByRole('button', { name: 'Save' }).click()
    await expect(pageA.getByText(roomName)).toBeVisible()

    // Session B, without ever navigating through the SPA (which wouldn't refetch a cache-first
    // query anyway), still doesn't see it - proving the two sessions' caches are genuinely
    // independent, not shared.
    await expect(pageB.getByText(roomName)).toHaveCount(0)

    // A hard reload resets session B's in-memory Apollo cache, so its next LIST_ROOMS fetch goes
    // to the network and picks up the new room.
    await pageB.reload()
    await expect(pageB.getByText(roomName)).toBeVisible()
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
