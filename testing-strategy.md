# Testing strategy

The overall cross-repo strategy (environments, the approach to reading Cognito's emails in tests,
and how "vibe coding" shapes all of this) is recorded in
[mootmaker/testing-strategy.md](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/testing-strategy.md).
This document covers what's specific to this repo.

## Layers

Four layers, in `webapp/` and at the repo root:

| Layer | Directory | Environment | Speed |
|---|---|---|---|
| Unit tests | `webapp/src/**/*.test.ts` (Vitest) | none | seconds |
| Integration tests | `webapp/tests/` (Playwright + MSW) | none (mocked GraphQL, mocked auth) | seconds |
| e2e | `e2e/` (Playwright) | real deployed AWS, ephemeral | minutes |
| Acceptance tests | `acceptance/` (Playwright) | real deployed AWS, ephemeral | minutes |

**2026-08-19**: restructured from two layers to four, once a second frontend
(`mootmaker-android`) meant this repo needed its own real-deployed-environment suites rather than
sharing one across frontends via a separate `mootmaker-e2e` repo — see [mootmaker-test-infra's
README](https://github.com/geoffweatherall/mootmaker-test-infra#history) for that history. The two
local layers didn't change in substance, only the "Integration tests" name (previously described
in prose as "Integration tests against a mocked API"; the `npm run test:e2e` script that ran them
is now `npm run test:integration` — the old name collided with what "e2e" now means at the repo
root).

### Unit tests (`webapp/src/**/*.test.ts`, Vitest)

```bash
cd webapp
npm run test:unit
```

Pure-logic tests, no browser and no network — seconds to run. Covers `formatDateTime.ts`'s
date/time splitting, the `ROOM_ERROR_MESSAGES`/`MEETING_ERROR_MESSAGES`/`PERSON_ERROR_MESSAGES`
maps and `errorMessages.ts`'s flattening of Apollo errors, `theme/roomColor.ts`'s palette
assignment/wraparound and contrast-based text colour, and `addMeetingLogic.ts` — the
organiser/attendee mutual-exclusivity filtering and the suggested-room caching state machine,
extracted out of `AddMeetingPage.tsx` specifically so they're testable without rendering the
component or mocking Apollo. See [README.md's Tests section](README.md#tests) for the full list.

### Integration tests (`webapp/tests/`, Playwright + MSW)

```bash
cd webapp
npm run test:integration
```

Drives a real browser against a **locally-run dev server** in a distinct Vite mode (`vite --mode
mock`) that needs **no live AWS environment at all** — no deploy, no `test`/ephemeral environment,
no real Cognito. Two test-only doubles, at two different seams:

- **MSW** intercepts at the real network layer — the app still makes its normal `fetch` calls
  through Apollo's `HttpLink` and the JWT-attaching `SetContextLink`, exactly as in production;
  MSW only substitutes what's on the other end of the wire (`webapp/src/testSupport/mocks/`).
- Auth is mocked separately, at the application boundary: `webapp/src/auth/cognito.mock.ts`
  replaces only `auth/cognito.ts` — the one module that actually talks to Cognito — via a
  mode-gated Vite alias. Cognito's SRP sign-in exchange is genuinely cryptographic and isn't
  reasonably fakeable at the network layer the way a JSON GraphQL API is, so the swap happens one
  level up instead. `AuthProvider.tsx` itself, and every page, run completely unchanged.

See [README.md's Tests section](README.md#tests) for the full list of specs and what each covers.

### e2e (`e2e/`, Playwright)

```bash
./e2e/run.sh                 # fresh ephemeral environment, torn down after
./e2e/run.sh <environment>   # against an already-deployed environment
```

Testing a genuinely deployed webapp build against a genuinely deployed API — including real
Cognito sign-up/reset flows with real email delivery — the things neither of the two layers above
can see. Deliberately the thinnest, least-frequently-run layer: a small, curated set of specs, not
a re-run of anything the mocked-API integration layer already covers.

- **`sign-up.spec.ts`**: a real sign-up through the real deployed webapp, against the real
  deployed Cognito pool, receiving a real emailed verification code via
  [mootmaker-test-infra](https://github.com/geoffweatherall/mootmaker-test-infra)'s SES→SNS→SQS
  pipeline and completing with it. Proves Cognito + SES + the webapp actually work together end to
  end.
- **`forgot-password.spec.ts`**: same proof, for the password-reset code path. Its precondition
  (an existing confirmed account) is created directly via the Cognito Admin API
  (`support/cognitoAdmin.ts`) rather than through the sign-up UI.
- **`smoke.spec.ts`**: the deployed home page actually loads (DNS, TLS certificate, CloudFront/S3
  serving).

Moved here 2026-08-19 from `mootmaker-e2e` (now `mootmaker-test-infra`), unchanged in behaviour —
see that repo's own testing-strategy.md for this suite's original build/verification history
(built and verified against real AWS 2026-08-15).

### Acceptance tests (`acceptance/`, Playwright)

```bash
./acceptance/run.sh                 # fresh ephemeral environment, torn down after
./acceptance/run.sh <environment>   # against an already-deployed environment
```

New 2026-08-19. Where `e2e/` proves the infrastructure is wired correctly, `acceptance/` proves
the *use cases* in
[mootmaker/use-cases.md](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md) are
actually satisfied — real deployed webapp + API + Cognito, real email where a scenario specifically
needs it, a pre-verified account (the always-present demo user, or one created via
`support/cognitoAdmin.ts`) everywhere else. See [acceptance/README.md](acceptance/README.md) for
current status (a first thin slice — two use cases, not all ~99), which account to sign in as for
a new case, and known gaps found while writing it.

Both `e2e/` and `acceptance/` share `support/` (the SQS email-reading and Cognito Admin-API
helpers) and one root `package.json`/`tsconfig.json` — see that directory's own files. Neither
duplicates the webapp's own `webapp/package.json` (React/MUI/Vite/Apollo), which stays entirely
separate.

## GraphQL codegen

Tracked as a to-do in [mootmaker's
README](https://github.com/geoffweatherall/mootmaker/blob/main/README.md#to-do), deferred until
CI/CD pipelines exist: generate `graphql/types.ts` from `mootmaker-api/api/mootmaker.graphql`
instead of hand-mirroring it, to close the contract-drift gap between the two repos.
