# Testing strategy

The overall cross-repo strategy (environments, the approach to reading Cognito's emails in tests,
and how "vibe coding" shapes all of this) is recorded in
[mootmaker/testing-strategy.md](https://github.com/geoffweatherall/mootmaker/blob/main/testing-strategy.md).
This document covers what's specific to this repo.

## Layers today

- **Lint + typecheck** (`npm run lint` / `tsc -b` via `npm run build` — see
  [README.md](README.md#local-development)): already in place.
- **End-to-end** (`webapp/tests/`, Playwright — see [README.md's Tests
  section](README.md#tests)): drives a real browser against a **locally-run dev server**, talking
  to a **genuinely deployed API** and a real, pre-confirmed Cognito test user. Useful today, but
  sits in an awkward middle ground: it needs a live deployed environment to run at all (currently
  `test`, via `authenticate.sh test`), which makes it slower and less deterministic than it needs
  to be for most of what it actually covers (time-picker boundaries, organiser/attendee
  exclusivity, form wiring), and it isn't testing a *deployed* webapp build either.

## Layers planned

- **Unit tests (new — Vitest)**: for the webapp's actual logic, small as it is per the existing
  README's own note ("there is deliberately little logic in the frontend") —
  `formatDateTime`'s date/time splitting, the error-code→message maps, the suggested-room caching
  state machine, organiser/attendee mutual-exclusivity filtering, room-colour assignment. Fast, no
  browser, no network.
- **Integration tests against a mocked API (new — Playwright + MSW)**: most of the scenarios
  currently covered by the live-API Playwright suite move here. **MSW** intercepts at the real
  network layer — the app still makes its normal `fetch` calls through Apollo's `HttpLink` and the
  JWT-attaching `SetContextLink`, exactly as in production; MSW only substitutes what's on the
  other end of the wire, rather than replacing Apollo's internals the way `MockedProvider` would.
  Auth is mocked separately, at the application boundary: a test-only `AuthProvider` double stands
  in for the real one, since Cognito's SRP exchange is genuinely cryptographic and isn't reasonably
  fakeable at the network layer the way a JSON GraphQL API is. This layer runs with no live AWS
  environment at all — no deploy, no `test` environment, no real Cognito.
- **GraphQL codegen**: generate `graphql/types.ts` from `mootmaker-api/api/mootmaker.graphql`
  instead of hand-mirroring it, to close the contract-drift gap between the two repos. Tracked as a
  to-do in [mootmaker's
  README](https://github.com/geoffweatherall/mootmaker/blob/main/README.md#to-do), deferred until
  CI/CD pipelines exist.

## What's changing for the existing Playwright suite

Until the MSW migration above lands, the existing suite still needs a live deployed API to run
against. Since `test` is now reserved for human manual testing, any automated run of this suite
(by Claude, or by future CI before the migration is complete) points at a fresh ephemeral
`claude-*`/`e2e-*` environment instead (via `authenticate.sh <environment>`), never `test`.

## Full-stack e2e

Testing a genuinely deployed webapp build against a genuinely deployed API — including real
Cognito sign-up/reset flows with real email delivery — lives in
[mootmaker-e2e](https://github.com/geoffweatherall/mootmaker-e2e), not here. See
[mootmaker-e2e/testing-strategy.md](https://github.com/geoffweatherall/mootmaker-e2e/blob/main/testing-strategy.md).
