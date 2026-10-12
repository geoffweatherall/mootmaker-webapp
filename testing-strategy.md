# Testing strategy

How mootmaker-webapp is tested. The layers across the whole system, and why they are shaped as they are,
are in the hub's [testing overview](https://github.com/geoffweatherall/mootmaker/blob/main/docs/overview/testing.md).

| Layer | Where | Runs against | When |
|---|---|---|---|
| Static | lint, typecheck, codegen and GraphQL checks | Nothing | Every pull request (`pr-checks`) |
| Unit | `webapp/src/**/*.test.ts` (Vitest) | Nothing: pure functions | Every pull request |
| Integration | `webapp/tests/` (Playwright) | The app in a real browser, with a mocked API and mocked Cognito | Every pull request |
| Acceptance | `acceptance/tests/` (Playwright) | A deployed environment: real CloudFront, AppSync, Cognito and email | Every release (`rel-web-*`); by hand with `./acceptance/run.sh` |

## Unit tests

Pure logic only, extracted from components so it can be tested without rendering anything: date and time
formatting, error-code wording, room colours, the meeting form's rules (`addMeetingLogic.ts`), search
further ahead, the realtime eviction and reconcile rules, and the cache helpers. Seconds to run; run them
constantly.

Some realtime tests drive a real `ApolloClient` with the real type policies and a fake server, because the
behaviour under test (which queries Apollo refetches after an eviction) is Apollo's, and an Apollo upgrade
that changes it must fail a test.

## Integration tests

`npm run test:integration` starts the app with `vite --mode mock` and drives Chrome against it. Two
doubles replace the outside world:

- **MSW** intercepts GraphQL at the network layer, so the app's real Apollo links still run. Handlers and
  a small fixed data set (3 rooms, 5 people) are in `src/testSupport/mocks/`. Meetings created during a
  test survive a full page load through `sessionStorage`.
- **`cognito.mock.ts`** replaces `auth/cognito.ts`, the one module that talks to Cognito, through a Vite
  alias. Cognito's SRP exchange is cryptographic and cannot reasonably be faked on the wire.
  `AuthProvider` and every page run unchanged.

A setup project signs in once through the real form and saves the session for the rest. Tests pin the
browser clock (`page.clock.setFixedTime`) wherever a default depends on "now". This layer is where
page wiring is proven: the right query fires, errors render, guards redirect, the form's rules hold.
There is no live subscription in mock mode; tests that need a refetch trigger one by switching tab
visibility.

## Acceptance tests

`acceptance/` proves the [use cases](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md)
hold against a real deployment. Each use case has a designed test case in
[acceptance/test-cases/](acceptance/test-cases/), and each spec names the cases it covers. Every test
resets the environment first and builds its own data through the API. Sign-up and password reset read
real emailed codes. See [acceptance/README.md](acceptance/README.md).

## Checking GraphQL without a deployed environment

- **`npm run codegen:check`** regenerates `src/graphql/generated/` from the schema and fails on any
  difference, so every operation the app sends is validated and typed.
- **`npm run graphql:check:tests`** validates the acceptance suite's operations, which codegen never sees.
  They are written as `` gql`...` `` templates (`acceptance/tests/support/gql.ts`); the script also fails
  on interpolation in a template and on any untagged string that looks like an operation. A query on a
  field that does not exist would otherwise return null, and a test could pass while asserting nothing.

Both read the sibling `../mootmaker-api` checkout when there is one, and the published `@mootmaker/schema`
package otherwise.
