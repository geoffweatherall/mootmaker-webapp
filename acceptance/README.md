# Acceptance tests

Playwright tests proving the web app satisfies the
[use cases](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md), against a
real deployed environment: CloudFront, AppSync, Cognito and real email. See
[../testing-strategy.md](../testing-strategy.md) for how this fits with the other layers.

## Running

```bash
./acceptance/run.sh                  # create a fresh web-acc-* environment, run, tear it down
./acceptance/run.sh <env>            # against an environment you already have
./acceptance/run.sh <env> -g "F.50"  # extra arguments go to Playwright
```

A fresh-environment run is the one that counts, because it also proves the deploy. Running against an
existing environment is for iterating on one spec; **it wipes that environment's data**, since every test
resets it.

Every run writes `acceptance/test-output/` (git-ignored): an HTML report with a screenshot and a trace for
every test, pass or fail (`npx playwright show-report acceptance/test-output/html-report`), and
`results.json` for reading programmatically.

## Every test is independent

Tests import `test` from `tests/support/test.ts` instead of Playwright's. It:

- **resets the environment before each test** (about a second), so any test can run alone or in any order.
  The baseline is no rooms, no meetings, the demo user and the fixture users. Tests never rely on demo data
  or on another test;
- gives each test an **`api`** (`tests/support/setupApi.ts`) to create the rooms, people, meetings and
  avatars it needs over the API, as the machine-to-machine client. The admin UI is used for setup only when
  the admin UI is what is being tested.

## Which account to sign in as

Helpers are in `tests/support/accounts.ts`.

- **The standard user, by default** ("E2E Standard"): most of what the app does is done by ordinary users.
- **The admin user** only where admin features are the subject: managing rooms and people, granting
  admin, editing someone else's meeting.
- **The no-person user** for the "signed in, but no linked Person" paths.
- **A fresh account** (`freshTestAccount` from `mootmaker-email-testing`, or `support/cognitoAdmin.ts`'s
  `createConfirmedTestAccount`, or the real sign-up flow) only when the test changes the account itself
  (name, preferences, password, deletion, an admin grant) or tests sign-up or password reset. Each counts
  against Cognito's free monthly-active-user allowance.
- **The demo user, never**, except for the cases whose subject is the demo login on the home page.

The fixture users exist only in ephemeral environments, and the reset before every test puts them back,
so a test can rely on them and must never leave them changed.

## Writing a test

1. Start from the case's design in [test-cases/](test-cases/): Given/When/Then, steps, assertions, and
   what is out of scope. Its **Status** line records whether it is automated.
2. Assert the business outcome (the data changed, something appears somewhere else), not just "no error".
3. Find elements by role and accessible name. Use `exact: true` where a name could also match a meeting
   subject.
4. Pin the clock (`pinnedWeekday` and friends in `tests/support/`) wherever a default comes from "now":
   the form's default time can fall outside business hours or past midnight.
5. Write GraphQL as `` gql`...` `` templates so `npm run graphql:check:tests` validates them against the
   schema.
6. Name the case numbers the test covers in a comment, and link the test from the case in
   `use-cases.md`.
