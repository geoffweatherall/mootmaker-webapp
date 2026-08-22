# acceptance

Real-deployed-environment tests proving mootmaker-webapp actually satisfies the use cases in
[mootmaker/use-cases.md](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md) — as
opposed to [../e2e/](../e2e/), which only proves the underlying infrastructure (Cognito, SES,
DNS/TLS/CloudFront) is wired correctly, with a deliberately small, curated set of specs. See
[../testing-strategy.md](../testing-strategy.md#acceptance-tests) for how this fits the overall
layering.

## Test case catalog

[test-cases/](test-cases/) has a detailed, reviewable design (Given/When/Then, UI-level steps with
Playwright selector hints, assertions, explicit "out of scope" notes) for **every one of the 99
use cases** in `use-cases.md` — the source to generate this suite's `.spec.ts` files from, one at a
time. "Designed" isn't "automated" — see its own README for the format and the account/test-data
conventions shared across all 99, and the Status list right below for what's actually implemented
so far. It also flags three real inconsistencies found between `use-cases.md`'s wording and the
actual webapp/API behaviour while writing it (a stale time-default figure, an apparently-unenforced
validation rule, and a page-navigation feature that doesn't exist yet) — see its "Known doc/code
drift" and "Known implementation gap" sections.

## Status

Two use cases automated so far, as a thin first slice rather than an attempt at all ~99 in
`use-cases.md` at once:

- **`sign-up.spec.ts`** — section A, case 1 (plus a touch of case 5): a real sign-up with a real
  emailed verification code, asserting the business-level effect (a linked Person auto-created
  with the entered name), not just that Cognito accepted the code.
- **`add-meeting.spec.ts`** — section F, case 38: the add-meeting happy path, asserting the
  meeting actually appears on the room's schedule afterward.

Everything else in `use-cases.md` is still just a checklist. Adding a case here should follow the
same shape: pick the *use case*, not the UI flow, as the thing under test — assert the business
outcome (data changed, something new is visible somewhere else), not just "no error was thrown."

## Which account to sign in as

- **A case that's actually testing sign-up, forgot-password, or anything else about the real
  verification-code flow itself** needs a fresh account and a real code — see
  `../support/testAccount.ts` and `../support/email.ts`.
- **Every other case** should sign in as the **demo user** (`DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD`,
  populated by `run.sh` from `mootmaker-api`'s Terraform outputs) — a real, pre-verified,
  always-admin Cognito account that exists in every environment already (see
  `mootmaker-api/deploy/terraform/cognito.tf`), with a linked Person already resolved. No sign-up,
  no email, no `support/cognitoAdmin.ts` bypass needed. This is the "pre-verified Cognito user"
  option from this repo's own testing-strategy.md.
- If a case specifically needs a **non-admin/standard** account signed in (e.g. asserting the
  admin-only Settings sections are hidden), use `support/cognitoAdmin.ts`'s
  `createConfirmedTestAccount` to create one directly via the Cognito Admin API, the same way
  `../e2e/forgot-password.spec.ts` creates its own precondition account.

## Known gaps

- **Room/Person data has no Admin-API-style bypass.** Unlike Cognito accounts, there's no
  backdoor for seeding rooms/people — a case that needs one has to create it through the real
  Settings UI first, as its own precondition (see `add-meeting.spec.ts`). Fine for a small number
  of specs; worth reconsidering (a seeding helper calling the GraphQL API directly, bypassing the
  UI) if enough specs end up repeating the same room-creation boilerplate.
- ~~`AddMeetingPage`'s success toast is never actually rendered.~~ **Fixed 2026-08-19.** Found while
  writing `add-meeting.spec.ts`: `useLocationToast.ts` existed and `SuccessToast.tsx` existed, but
  nothing ever wired them together. Fixed two bugs in `mootmaker-webapp/webapp/src/`:
  `components/Layout.tsx` now actually renders `<SuccessToast>` fed by `useLocationToast()`, and
  `useLocationToast.ts` itself had a second, subtler bug — its `useState(stateMessage)` initializer
  only ever captured `location.state` from `Layout`'s first mount (before any navigation), so even
  wiring it up as-is would never have shown a toast in practice. Now re-reads `location.state` in a
  `useEffect` keyed on `location`, so it reacts to every navigation, not just the first render.
  `add-meeting.spec.ts` now asserts the actual toast text.
- **Use cases aren't tagged per-frontend yet** — see `mootmaker/use-cases.md`'s own "Notes" section.
  Not a problem yet with only one frontend automated, but will matter once `mootmaker-android` gets
  its own `acceptance/` suite.
- ~~`add-meeting.spec.ts` flaked outside business hours.~~ **Fixed 2026-08-19.** Caught for real: a
  run at 17:30 local time failed because `RoomAvailabilityPage` only ever renders business hours
  (08:00–17:00), and `AddMeetingPage`'s start-time default (next 5-minute boundary from now) landed
  just outside that window — the meeting was created successfully, just off-screen. Fixed with
  `page.clock.setFixedTime(...)` pinned to a safely-inside-business-hours time before the meeting's
  created, the same fix already used in `webapp/tests/meeting-details.spec.ts` for the equivalent
  weekday-vs-weekend problem. A reminder that any spec here relying on a default derived from "now"
  needs to consider the full range of times/days it might actually run at, not just whenever it
  happened to be written.
