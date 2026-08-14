# Testing strategy

The overall cross-repo strategy (environments, the approach to reading Cognito's emails in tests,
and how "vibe coding" shapes all of this) is recorded in
[mootmaker/testing-strategy.md](https://github.com/geoffweatherall/mootmaker/blob/main/testing-strategy.md).
This document covers what's specific to this repo.

## Layers today

- **Lint + typecheck** (`npm run lint` / `tsc -b` via `npm run build` — see
  [README.md](README.md#local-development)): already in place.
- **Unit tests** (`webapp/src/**/*.test.ts`, Vitest — see [README.md's Tests
  section](README.md#tests)): `npm run test:unit`. Pure-logic tests, no browser and no network, for
  the webapp's actual logic, small as it is per the existing README's own note ("there is
  deliberately little logic in the frontend") — `formatDateTime`'s date/time splitting, the
  error-code→message maps, `errorMessages()`'s flattening of Apollo errors, room-colour
  assignment/wraparound and contrast, and (extracted out of `AddMeetingPage.tsx` into
  `pages/addMeetingLogic.ts` specifically to make this possible without rendering the component or
  mocking Apollo) the suggested-room caching state machine and organiser/attendee
  mutual-exclusivity filtering. Seconds to run.
- **Integration tests against a mocked API** (`webapp/tests/`, Playwright + MSW — see [README.md's
  Tests section](README.md#tests)): `npm run test:e2e`. Drives a real browser against a
  **locally-run dev server** in a distinct Vite mode (`vite --mode mock`) that needs **no live AWS
  environment at all** — no deploy, no `test`/ephemeral environment, no real Cognito. Two
  test-only doubles, at two different seams:
  - **MSW** intercepts at the real network layer — the app still makes its normal `fetch` calls
    through Apollo's `HttpLink` and the JWT-attaching `SetContextLink`, exactly as in production;
    MSW only substitutes what's on the other end of the wire (`src/testSupport/mocks/`), rather
    than replacing Apollo's internals the way `MockedProvider` would.
  - Auth is mocked separately, at the application boundary, and one level more precisely than
    originally planned: rather than a parallel `AuthProvider` double (which would duplicate its
    orchestration logic and risk the two drifting apart), `src/auth/cognito.mock.ts` replaces only
    `auth/cognito.ts` — the one module that actually talks to Cognito — via a mode-gated Vite
    alias. `AuthProvider.tsx` itself, and every page, run completely unchanged; Cognito's SRP
    exchange is genuinely cryptographic and isn't reasonably fakeable at the network layer the way
    a JSON GraphQL API is, so the swap happens here instead. This also covers `SignUpPage`'s and
    `ForgotPasswordPage`'s direct `cognito.ts` calls for free, since they import the same module.
- **GraphQL codegen**: generate `graphql/types.ts` from `mootmaker-api/api/mootmaker.graphql`
  instead of hand-mirroring it, to close the contract-drift gap between the two repos. Tracked as a
  to-do in [mootmaker's
  README](https://github.com/geoffweatherall/mootmaker/blob/main/README.md#to-do), deferred until
  CI/CD pipelines exist. Still not done — out of scope for the mocked-API migration above, since
  codegen is most useful wired into a pipeline step rather than run ad hoc.

## What changed when the Playwright suite moved onto mocked auth/API

The existing `webapp/tests/*.spec.ts` suite was **replaced in place**, not left running alongside
a new mocked suite — an explicit choice by the project owner. Every scenario it covered before
(5-minute time-boundary pickers, organiser/attendee exclusivity, suggest-room caching and
wraparound, auth redirects, forgot-password flow, wrong-password error) is still covered; only how
it's driven changed, plus a couple of scenarios that were previously impossible to automate
(forgot-password's *correct*-code success path; a not-a-weekend edge case in
`meeting-details.spec.ts`, now pinned via Playwright's `page.clock.setFixedTime` — see README.md's
Tests section for both). The live-API dependency (`authenticate.sh <environment>`,
`E2E_USER_EMAIL`/`PASSWORD`, a genuinely deployed API and Cognito user pool) is gone entirely from
these files. `webapp/tests/calendar-menu.spec.ts` and `webapp/tests/meeting-details.spec.ts` -
both already present before this migration but not yet documented in README.md's Tests section -
are now included too.

## Full-stack e2e

Testing a genuinely deployed webapp build against a genuinely deployed API — including real
Cognito sign-up/reset flows with real email delivery — lives in
[mootmaker-e2e](https://github.com/geoffweatherall/mootmaker-e2e), not here. See
[mootmaker-e2e/testing-strategy.md](https://github.com/geoffweatherall/mootmaker-e2e/blob/main/testing-strategy.md).
