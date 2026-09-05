import type { Page } from '@playwright/test'

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
