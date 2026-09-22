// Boots MSW's browser worker (a real Service Worker - see public/mockServiceWorker.js, generated
// by `npx msw init`) so the app's actual `fetch` calls are intercepted at the network layer, not
// replaced by a fake Apollo object graph - see testing-strategy.md. Only imported (dynamically,
// from main.tsx) when running in Vite's "mock" mode, so it's never reachable from a real build.
import { setupWorker } from 'msw/browser'
import { createMeetingFixture } from './fixtures'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

// Exposes createMeetingFixture to Playwright's page.evaluate, the same way handlers.ts's gates
// let a test reach into the mock from outside the app bundle - see tests/support/mockControls.ts's
// seedMeeting. Lets a test seed a meeting on an arbitrary date directly (e.g. several days beyond
// what the Add Meeting form's own UI would conveniently reach for a "Search further ahead" test)
// without driving the real form repeatedly.
window.__mockControls = {
  ...window.__mockControls,
  seedMeeting: createMeetingFixture,
}
