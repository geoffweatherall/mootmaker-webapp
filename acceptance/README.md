# acceptance

Real-deployed-environment tests proving mootmaker-webapp actually satisfies the use cases in
[mootmaker/docs/reference/use-cases.md](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md) — as
opposed to [../e2e/](../e2e/), which only proves the underlying infrastructure (Cognito, SES,
DNS/TLS/CloudFront) is wired correctly, with a deliberately small, curated set of specs. See
[../testing-strategy.md](../testing-strategy.md#acceptance-tests) for how this fits the overall
layering.

## Which environment to run against

**Run `./run.sh` with no argument.** It creates a fresh ephemeral environment, deploys into it,
runs the suite, and tears it down. That is the supported path, and the only one the suite is
actually designed for.

**Re-running against a long-lived environment is fine.** Every test resets the environment
before it starts (see "Every test is independent" below), so nothing one run or one test leaves
behind affects the next. It does mean the suite wipes whatever data that environment held.

Passing an environment name (`./run.sh <environment>`) is supported and useful for *iterating on a
single spec* with `-g` while developing, where the deploy-and-teardown cost per attempt would be
absurd. A fresh-environment run is still the definition of done, because it also proves the
deploy itself.

## Run output

Every `./run.sh` run writes a full record to `test-output/` (git-ignored — see `.gitignore` — so
it's never accidentally committed): an HTML report (`test-output/html-report/`, open with `npx
playwright show-report acceptance/test-output/html-report`) with a full step-by-step breakdown,
screenshot, and Trace Viewer recording for *every* test, pass or fail — not just failures, since
`trace`/`screenshot` are both set to `'on'` rather than an on-failure-only mode (see
`playwright.config.ts`'s own comments for the size/completeness trade-off). Alongside it,
`test-output/results.json` is the same result set as structured JSON — meant for a tool (or an AI)
to read programmatically rather than browse. A fresh run overwrites the previous one; nothing here
is meant to be kept long-term.

## Test case catalog

[test-cases/](test-cases/) has a detailed, reviewable design (Given/When/Then, UI-level steps with
Playwright selector hints, assertions, explicit "out of scope" notes) for **every use case** in
`use-cases.md` — the source to generate this suite's `.spec.ts` files from, one at a
time. "Designed" isn't "automated" — see its own README for the format and the account/test-data
conventions shared across every case, and the Status list right below for what's actually implemented
so far. It also flags three real inconsistencies found between `use-cases.md`'s wording and the
actual webapp/API behaviour while writing it (a stale time-default figure, an apparently-unenforced
validation rule, and a page-navigation feature that doesn't exist yet) — see its "Known doc/code
drift" and "Known implementation gap" sections.

## Status

Most of the catalogued use cases have a spec, across `sign-up.spec.ts`,
`sign-in-sign-out.spec.ts`, `forgot-password.spec.ts`, `add-meeting.spec.ts`,
`room-availability-empty.spec.ts`, `room-availability.spec.ts`, `person-calendar.spec.ts`,
`meeting-details.spec.ts`, `home-page.spec.ts`, `settings-your-name.spec.ts`,
`p-rooms.spec.ts`, `q-persons.spec.ts`, `authorization-boundaries.spec.ts`,
`cross-cutting.spec.ts`, `settings-admin-banner.spec.ts`, `attendee-response-status.spec.ts`, `cross-client-updates.spec.ts`, and
`edit-and-cancel-meetings.spec.ts` — except G.64, confirmed infeasible against this project's
standard environments (see its own catalog entry). Not every case has automated acceptance-layer
coverage: some are left deliberately Planned where the Integration layer under `webapp/tests/`
already proves the logic thoroughly against a mock and only a thinner real-infrastructure smoke
case remains open (see e.g. `test-cases/o-edit-and-cancel-meetings.md`'s own per-case notes). A
few specs are still being verified/fixed against a live environment. [test-cases/](test-cases/)'s
own per-case **Status** lines are the source of truth for coverage, not this list.

Everything else in `use-cases.md` is still just a checklist. Adding a case here should follow the
same shape: pick the *use case*, not the UI flow, as the thing under test — assert the business
outcome (data changed, something new is visible somewhere else), not just "no error was thrown."

## Which account to sign in as

Decided in mootmaker-api#95 and mootmaker-webapp#138. The accounts and sign-in helpers are in
`tests/support/accounts.ts`.

- **The standard user, by default.** An ordinary, non-admin account with a linked Person
  ("E2E Standard"). Most of what this app does is done by ordinary users, so most tests are about
  them.
- **The admin user, only where admin functionality is the subject:** managing rooms or people,
  granting admin, editing or cancelling someone else's meeting, admin-only UI.
- **The no-person user** for the "signed in, but no linked Person" paths.
- **A fresh account** (`freshTestAccount` from `mootmaker-email-testing` with `../support/cognitoAdmin.ts`, or the real
  sign-up flow) only when the test changes the account itself - name, preferences, password,
  deletion, an admin grant - or tests sign-up or forgot-password. Each fresh account counts
  against Cognito's free monthly-active-user allowance, so don't reach for one by default.
- **The demo user, never** - except B.11 and D.21, whose subject is the demo login on the home page.

The three fixture users exist only in ephemeral environments. Database reset creates them if
missing and repairs them to a known state, and **every test resets first**, so a test can rely on
them being exactly as described - and must never change them.

## Every test is independent

`tests/support/test.ts` is the suite's `test`. Every test that touches the environment imports it
instead of `@playwright/test`'s, and it:

- **resets the environment before each test** (about a second), so any test can run alone or in
  any order and still pass. A test relies on nothing from another test and nothing from
  demo-data - only the reset baseline: no rooms, no meetings, the demo and fixture users;
- gives each test an **`api`** (`tests/support/setupApi.ts`) to create the rooms, people, meetings
  and avatars it needs over the API, as the machine-to-machine client. Setup goes through the
  admin UI only when the admin UI is what's being tested.

## Known gaps

- ~~`AddMeetingPage`'s success toast is never actually rendered.~~ **Fixed 2026-08-19.** Found while
  writing `add-meeting.spec.ts`: `useLocationToast.ts` existed and `SuccessToast.tsx` existed, but
  nothing ever wired them together. Fixed two bugs in `mootmaker-webapp/webapp/src/`:
  `components/Layout.tsx` now actually renders `<SuccessToast>` fed by `useLocationToast()`, and
  `useLocationToast.ts` itself had a second, subtler bug — its `useState(stateMessage)` initializer
  only ever captured `location.state` from `Layout`'s first mount (before any navigation), so even
  wiring it up as-is would never have shown a toast in practice. Now re-reads `location.state` in a
  `useEffect` keyed on `location`, so it reacts to every navigation, not just the first render.
  `add-meeting.spec.ts` now asserts the actual toast text.
- **Use cases aren't tagged per-frontend yet** — see `mootmaker/docs/reference/use-cases.md`'s own "Notes" section.
  Not a problem yet with only one frontend automated, but will matter once `mootmaker-android` gets
  its own `acceptance/` suite.
- ~~`add-meeting.spec.ts` flaked outside business hours.~~ **Fixed 2026-08-19.** Caught for real: a
  run at 17:30 local time failed because `RoomAvailabilityPage` only ever renders business hours
  (08:00–17:00), and `AddMeetingPage`'s start-time default (next 15-minute boundary from now) landed
  just outside that window — the meeting was created successfully, just off-screen. Fixed with
  `page.clock.setFixedTime(...)` pinned to a safely-inside-business-hours time before the meeting's
  created, the same fix already used in `webapp/tests/meeting-details.spec.ts` for the equivalent
  weekday-vs-weekend problem. A reminder that any spec here relying on a default derived from "now"
  needs to consider the full range of times/days it might actually run at, not just whenever it
  happened to be written.
