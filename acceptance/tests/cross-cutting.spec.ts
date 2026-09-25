import { expect, test, type Page } from '@playwright/test'
import { darkTokens, lightTokens } from '../../webapp/src/theme/tokens'
import { formatDateParam, pinnedWeekday } from './support/pinnedDates'

// mootmaker/docs/reference/use-cases.md, section M (Cross-cutting / non-functional), cases 92-99. M.98 is
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
  // A Wednesday inside business hours, derived from now() rather than hardcoded: a literal date
  // expires as soon as the server's retention boundary advances past it. See support/pinnedDates.ts.
  const pinnedNow = pinnedWeekday('Wednesday')
  const dateStr = formatDateParam(pinnedNow)
  const availabilityUrl = new RegExp(`/rooms/${dateStr}/availability`)

  await page.clock.setFixedTime(pinnedNow)

  await signInAsDemo(page)

  // Precondition room, created fast (no artificial delay yet) - same pattern as
  // add-meeting.spec.ts. This also happens to warm LIST_ROOMS' cache-first cache, which is fine:
  // this use case's "first load" half is specifically about *meetings* for a not-yet-visited day,
  // not rooms - see this test's own comments below for why that still exercises showSpinner.
  await page.goto('/rooms')
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

  // (a) The very first visit this session to this day's Room Availability - via the sidebar link
  // (in-app, not page.goto: see the (b) comment below for why a hard navigation would defeat the
  // premise), before anything has created a meeting or otherwise asked about this day. Rooms are
  // already cache-first-cached from the Settings visit above, but this day's meetings are not -
  // showSpinner's "meetingsLoading && !meetingsData" half is true, so the full-page CircularProgress
  // shows.
  //
  // Deliberately NOT the day-of-creation redirect below: mootmaker-webapp#66 fixed
  // Query.workspace's cache read to reconstruct `days` from the requested dates via the
  // already-normalized `Day` entities, rather than trusting whatever `days` list a previous,
  // differently-dated response happened to leave behind. One side effect is that createMeeting's
  // own response (which returns the affected `day`, entity-normalized like any other) now warms
  // that day's cache immediately - so the redirect straight after creating a meeting is no longer
  // a genuinely cold visit to this specific day, it is a revisit to a day the mutation itself just
  // populated. That is a real improvement (no more unnecessary spinner for data already in hand),
  // but it means this use case's "genuinely cold, nothing cached yet" half needs a visit that
  // precedes any write to the day it is checking - hence checking the plain sidebar-link visit
  // here, first.
  await page.getByRole('link', { name: 'Room Availability' }).click()
  await page.waitForURL(availabilityUrl)
  await expect(circularProgress).toBeVisible()
  await expect(circularProgress).toBeHidden()

  // Now create the meeting. Its own response normalizes this day's `Day` entity with the new
  // meeting already in it (see the comment above), so the redirect below lands on a day the cache
  // already fully knows - content shows immediately, with no full-page spinner, which is exactly
  // the "no flash of empty content" behaviour (b) below re-confirms on a third visit.
  await page.goto('/meetings/add')
  await page.getByLabel('Subject').fill(subject)
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: roomName, exact: false }).click()
  await page.getByRole('button', { name: 'Save' }).click()

  await page.waitForURL(availabilityUrl)
  // The meeting only renders once its room's card is expanded - RoomAvailabilityPage.tsx's "See
  // <day>'s meetings" Collapse toggle. Not a plain getByText(subject): the card's own status
  // sublabel can independently reference this meeting's subject too (see
  // roomAvailabilityLogic.ts) - only the meeting row itself has role 'button'.
  const roomCard = page
    .getByText(roomName, { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
  await roomCard.getByRole('button', { name: /'s meetings/ }).click()
  await expect(roomCard.getByRole('button', { name: subject, exact: false })).toBeVisible()
  await expect(circularProgress).toHaveCount(0)

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

  // A real navigation away and back remounts RoomAvailabilityPage, so its expandedRoomIds state
  // resets - the card needs expanding again before its (still-cached) meeting is visible.
  const roomCardAfterNav = page
    .getByText(roomName, { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
  await roomCardAfterNav.getByRole('button', { name: /'s meetings/ }).click()
  await expect(roomCardAfterNav.getByRole('button', { name: subject, exact: false })).toBeVisible()
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

  // Trigger a fresh API call by navigating to another authenticated page - HomePage issues its own
  // PAGE_LOAD query on mount. Deliberately not an admin-only page (Rooms/Persons): if this
  // environment's demo user isn't actually flagged admin right now (see this file's sibling
  // authorization-boundaries.spec.ts), RequireAdmin's own client-side redirect would confound this
  // test's redirect-vs-stayed-put outcome, which is supposed to be decided solely by the corrupted
  // session, not by authorization.
  await page.goto('/')

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
  // The original version of this test asserted the Home heading unconditionally *before* checking
  // for a redirect - which contradicts the redirect outcome it's supposed to tolerate: if the app
  // redirects (confirmed to be exactly what happens here, and the "ideal" outcome the use case
  // itself asks for), HomePage never mounts, so that heading correctly never appears, and the
  // original hard assertion just timed out first. Wait for the redirect (with enough headroom for
  // the ~7.5s retry storm above) before deciding which branch applies, rather than assuming the
  // page always stays put.
  const redirectedToSignIn = await page
    .waitForURL('**/signin', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false)

  let bannerVisible = false
  if (!redirectedToSignIn) {
    // Didn't redirect - the other acceptable outcome still requires proof the page rendered safely
    // (no unhandled crash/blank page). Both branches of HomePage's own render logic (the demo
    // user's linked Person resolves, or PAGE_LOAD itself errors) reach a heading, regardless of
    // what the corrupted session does to any query.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
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
  // Created before session B loads, purely to prove session B's room list has finished fetching.
  const sentinelName = `M99 Sentinel ${runId}`

  try {
    await signInAsDemo(pageA)
    await signInAsDemo(pageB)

    async function createRoom(page: Page, name: string) {
      await page.getByRole('button', { name: 'Add room' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Name').fill(name)
      await dialog.getByLabel('Capacity').fill('4')
      await dialog.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByText(name)).toBeVisible()
    }

    // Session A creates a sentinel room BEFORE session B ever loads. This is what makes session B's
    // precondition meaningful: REFERENCE_DATA is `cache-and-network` (see RoomsPage), so session B
    // fetches from the network exactly once, on mount, and never again - there is no polling, and
    // refetch() only fires after a save in the same session.
    //
    // Waiting for the sentinel proves that single fetch has COMPLETED. Without it the test raced:
    // its precondition was `expect(roomName).toHaveCount(0)`, which passes instantly against a
    // blank, still-loading page, so a slow session B could take its first fetch AFTER session A
    // created the room and legitimately receive it. That produced real failures under full-suite
    // load while passing in isolation.
    await pageA.goto('/rooms')
    await createRoom(pageA, sentinelName)

    await pageB.goto('/rooms')
    await expect(pageB.getByText(sentinelName)).toBeVisible()
    await expect(pageB.getByText(roomName)).toHaveCount(0)

    // Session A creates a second room, after session B's list is definitively loaded.
    await createRoom(pageA, roomName)

    // Session B, which has already fetched and has no reason to fetch again, still doesn't see it -
    // proving the two sessions' caches are genuinely independent, not shared.
    await expect(pageB.getByText(roomName)).toHaveCount(0)

    // A hard reload discards session B's in-memory Apollo cache, so its next LIST_ROOMS fetch is a
    // fresh network request and picks up the new room.
    await pageB.reload()
    await expect(pageB.getByText(roomName)).toBeVisible()
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
