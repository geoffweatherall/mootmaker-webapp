import type { Page } from '@playwright/test'
import type { MeetingDetails } from '../../src/graphql/types'

/**
 * Holds the mocked "MyPerson" GraphQL operation open until the returned function is called, so the
 * window where the signed-in user's personId is still resolving becomes observable deterministically
 * instead of racing the mocked network (which normally resolves near-instantly).
 *
 * Implemented via a gate the MSW handler (src/testSupport/mocks/handlers.ts) checks before
 * resolving the "MyPerson" operation, armed through `page.addInitScript` - which runs before any of
 * the page's own scripts, so the gate is in place before AuthProvider's first render can fire the
 * query - and released through `page.evaluate` once the test is done observing the still-loading
 * state.
 */
export async function gateMyPersonQuery(page: Page): Promise<() => Promise<void>> {
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

/**
 * As above, but for the mocked "ListRooms" operation, so the window where Settings has People but
 * not yet Rooms is observable. See AdminSections in SettingsPage.tsx for why that window matters.
 */
export async function gateListRoomsQuery(page: Page): Promise<() => Promise<void>> {
  await page.addInitScript(() => {
    window.__mockControls = {
      ...window.__mockControls,
      listRoomsGate: new Promise<void>((resolve) => {
        ;(window as unknown as { __releaseListRoomsGate: () => void }).__releaseListRoomsGate = resolve
      }),
    }
  })
  return () =>
    page.evaluate(() => (window as unknown as { __releaseListRoomsGate: () => void }).__releaseListRoomsGate())
}

/**
 * Holds `cognito.mock.ts`'s currentUserClaims() open - not a GraphQL operation, so unlike the gates
 * above it isn't checked in a handler, it's checked directly in the mock (see that file). Makes the
 * window where whether there's even a session at all is still unknown - AuthProvider's
 * `initialising` - observable deterministically, the same way the other gates do for their own
 * calls. See mootmaker-webapp#111.
 */
export async function gateSessionQuery(page: Page): Promise<() => Promise<void>> {
  await page.addInitScript(() => {
    window.__mockControls = {
      ...window.__mockControls,
      sessionGate: new Promise<void>((resolve) => {
        ;(window as unknown as { __releaseSessionGate: () => void }).__releaseSessionGate = resolve
      }),
    }
  })
  return () =>
    page.evaluate(() => (window as unknown as { __releaseSessionGate: () => void }).__releaseSessionGate())
}

/**
 * As gateMyPersonQuery, but armed mid-test via page.evaluate against an already-loaded page,
 * instead of page.addInitScript before the first navigation. addInitScript only takes effect on a
 * future navigation/reload; it cannot gate a fetch an already-mounted SPA is about to make (e.g. a
 * `cache-and-network` revalidation triggered by remounting a query via client-side navigation, with
 * no new document load for addInitScript to attach to). Use this to observe that second, in-page
 * fetch specifically - see mootmaker-webapp#111's "refreshing with stale data" case.
 */
export async function gateMyPersonQueryNow(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(() => {
    window.__mockControls = {
      ...window.__mockControls,
      myPersonGate: new Promise<void>((resolve) => {
        ;(window as unknown as { __releaseMyPersonGate: () => void }).__releaseMyPersonGate = resolve
      }),
    }
  })
  return () =>
    page.evaluate(() => (window as unknown as { __releaseMyPersonGate: () => void }).__releaseMyPersonGate())
}

/**
 * Seeds a meeting directly into the mock's `meetings` fixture (see
 * src/testSupport/mocks/browser.ts's seedMeeting wiring), for a test that needs one on a specific
 * date the Add Meeting form isn't a convenient way to reach - e.g. several days beyond the
 * initial window a "Search further ahead" test wants to extend into. Bypasses createMeeting's
 * validation entirely (no clash/capacity/alignment checks), matching how directly manipulating a
 * fixture is expected to work elsewhere in this test suite (see fixtures.ts's own doc comments).
 */
export async function seedMeeting(page: Page, meeting: Omit<MeetingDetails, 'id'>): Promise<void> {
  await page.evaluate((toSeed) => {
    window.__mockControls?.seedMeeting?.(toSeed)
  }, meeting)
}
