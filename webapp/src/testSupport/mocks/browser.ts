// Boots MSW's browser worker (a real Service Worker - see public/mockServiceWorker.js, generated
// by `npx msw init`) so the app's actual `fetch` calls are intercepted at the network layer, not
// replaced by a fake Apollo object graph - see testing-strategy.md. Only imported (dynamically,
// from main.tsx) when running in Vite's "mock" mode, so it's never reachable from a real build.
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)
