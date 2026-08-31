# Acceptance test case catalog

A detailed, per-use-case design for every test in the `acceptance/` suite — one entry per case in
[mootmaker/use-cases.md](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md),
written to be reviewed by a human before any test code exists, and precise enough for Claude to
generate that code from later. This catalog is the *design*; [`../tests/`](../tests/) is the
*implementation* — every one of the 99 use cases now has a spec (see each entry's **Status**),
except G.64, confirmed infeasible against this project's standard environments (see its own
Notes). A handful of specs (F.53, F.54, F.57) are currently failing live and under investigation —
flagged individually in [f-add-meeting.md](f-add-meeting.md).

**Scope**: full coverage — every one of the 99 use cases gets a complete real-browser test case
here, including ones that are also (or better) provable at the mocked `webapp/tests/` integration
layer. This project isn't following the test pyramid strictly for this suite; some duplication
between `acceptance/` and `webapp/tests/` is accepted deliberately rather than screened out case by
case. See [testing-strategy.md](../../testing-strategy.md) for how the layers otherwise relate.

## How this catalog is organised

One file per lettered section of `use-cases.md`, same letters, same case numbers:

| File | Section | Cases |
|---|---|---|
| [a-sign-up.md](a-sign-up.md) | A. Sign up | 1–6 |
| [b-sign-in-sign-out.md](b-sign-in-sign-out.md) | B. Sign in / sign out | 7–15 |
| [c-forgot-password.md](c-forgot-password.md) | C. Forgot password | 16–20 |
| [d-home-page.md](d-home-page.md) | D. Home page | 21–25 |
| [e-room-availability.md](e-room-availability.md) | E. Room Availability | 26–37 |
| [f-add-meeting.md](f-add-meeting.md) | F. Add Meeting | 38–58 |
| [g-person-calendar.md](g-person-calendar.md) | G. Person Calendar | 59–67 |
| [h-meeting-details.md](h-meeting-details.md) | H. Meeting Details | 68–73 |
| [i-settings-your-name.md](i-settings-your-name.md) | I. Settings — Your name | 74–76 |
| [j-settings-rooms.md](j-settings-rooms.md) | J. Settings — Rooms | 77–83 |
| [k-settings-people.md](k-settings-people.md) | K. Settings — People | 84–88 |
| [l-authorization-boundaries.md](l-authorization-boundaries.md) | L. Authorization boundaries | 89–91 |
| [m-cross-cutting.md](m-cross-cutting.md) | M. Cross-cutting / non-functional | 92–99 |
| [n-date-time-format-settings.md](n-date-time-format-settings.md) | N. Settings — Date and time format | 100–105 |

Case numbering matches `use-cases.md` exactly (global 1–99, not restarting per section), so a test
case's ID is always `<SectionLetter>.<N>` — e.g. `F.38` — with no separate numbering scheme to keep
in sync. Splitting one use case into more than one webapp test case is allowed when it's genuinely
clearer (append a letter suffix — `F.38b`), but the default is 1:1; nothing here has needed a split
so far.

## Bidirectional linking

- **This catalog → use case**: every test case's **Use case** line links straight to that item in
  `use-cases.md`, e.g. `...use-cases.md#uc-38`. `use-cases.md` carries a stable
  `<a id="uc-N"></a>` anchor on every one of its 99 items specifically so this link survives
  edits to the surrounding wording.
- **Use case → this catalog**: every item in `use-cases.md` links back here too, e.g. `→ webapp:
  F.38 · android: not yet automated`. **This is what makes editing `use-cases.md` safe** — adding,
  changing, or removing a use case, the linked test case(s) are one click away, in both directions,
  without grepping. Renumbering an item in `use-cases.md` breaks this and should be avoided; adding
  new items at the end of a section (or the end of the whole list) doesn't.
- **Android**: `mootmaker-android` has no `acceptance/` suite yet (the app itself isn't written).
  Every test case here carries an **Android:** line reading "not yet automated" as a placeholder —
  once that suite exists, its own test cases should link back to `use-cases.md` the same way this
  one does, and `use-cases.md`'s per-item link line gets a real `android: ...` entry instead of the
  placeholder.

## Entry format

Every test case follows the same shape:

- **Anchor + heading** — `<a id="tc-<sectionletter><n>"></a>` (e.g. `tc-f38`) then `### <ID> —
  <short title>`. The anchor is what `use-cases.md` and cross-references link to; it's stable even
  if the heading text changes later.
- **Use case** — link + the exact wording quoted from `use-cases.md` at the time this was written
  (so a later edit to that wording is visible as a diff against what this test case was actually
  designed for).
- **Status** — ✅ Automated (with a link to the spec file) or ⬜ Planned (not yet automated).
- **Android** — placeholder, see above.
- **Preconditions** — signed-in state, account type/class, and any data that must exist before the
  test's own steps begin.
- **Given / When / Then** — the business-readable version, for a reviewer who wants the intent
  without the UI mechanics.
- **Steps** — the numbered, UI-level version: routes, fields, buttons, with Playwright
  selector hints (`getByLabel(...)`, `getByRole(...)`) inline wherever the obvious English
  wouldn't uniquely identify the element. This is the part meant to translate almost directly into
  a `.spec.ts` file.
- **Assertions** — the concrete, checkable list of what "pass" means — always a business-level
  outcome (data changed, something new is visible somewhere else), never just "no error was
  thrown," matching the existing two specs' own stated principle (see
  [../README.md](../README.md)).
- **Out of scope** — adjacent behaviour this specific test deliberately does *not* verify, and
  (where one exists) which other case covers it instead. This is what keeps each test case
  single-purpose and keeps a reviewer from assuming more coverage than a green run actually proves.
- **Notes** — anything else worth flagging: flakiness risks, timing/clock-pinning needs, known
  doc/code drift discovered while writing this catalog, or design choices a reviewer might
  question.

## Test data conventions

Referenced by shorthand across every section file rather than re-explained each time:

- **The demo user** (`DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD`, from `run.sh` /
  `mootmaker-api/deploy/terraform/cognito.tf`'s `aws_cognito_user.demo`) — **admin**, with a
  linked Person ("Demo Strater", `aws_dynamodb_table_item.demo_person`). The default account for
  any case that just needs *some* working, admin-capable, Person-linked signed-in user and isn't
  itself about sign-up, sign-in, or password reset.
- **The e2e user** (`E2E_USER_EMAIL` / `E2E_USER_PASSWORD`, same Terraform file's
  `aws_cognito_user.e2e`) — **standard**, with **no linked Person at all** (created directly by
  Terraform, so `PostConfirmationCreatePersonHandler` never ran for it). The account for any case
  that specifically needs "signed in, but no linked Person" (Home page's degraded state, Calendar
  nav disabled, Settings' Name section disabled) or "a plain standard user" where a linked Person
  isn't the point.
- **A fresh signed-up account** — either through the real UI + `support/email.ts`'s
  `waitForVerificationCode` (when the sign-up/reset flow itself is under test), or via
  `support/cognitoAdmin.ts`'s `createConfirmedTestAccount` (when a working account is only a
  *precondition* for something else). Either way this account **does** get a linked Person —
  `AdminConfirmSignUp` fires the same `PostConfirmationCreatePersonHandler` a real confirmation
  would. This is the account type for anything needing a **standard user with a linked Person**
  (self-rename as a non-admin, the organiser-defaults-to-self behaviour for a real signed-up user,
  "schedule a meeting as yourself right after signing up").
- **An admin-created guest Person** (no Cognito account, no login) — created through the real
  Settings UI by an admin (the demo user), the only way to get one; there's no data-seeding
  bypass for rooms or people (see [../README.md](../README.md)'s "Known gaps").
- **Rooms** — no bypass either; a test needing a room creates its own, uniquely named per run (see
  `tests/add-meeting.spec.ts`'s `roomName` pattern), so repeated runs against a shared environment
  don't collide and tests don't depend on each other's leftover data.

`acceptance/playwright.config.ts` runs `workers: 1`, not `fullyParallel` — tests in this suite run
one at a time against real, possibly-shared infrastructure. Every test case here is still written
to create whatever data it personally needs rather than relying on another test's leftovers or a
particular run order, the same discipline the two existing specs already follow.

## Resolved since this catalog was first written

- **2026-08-22: the 5-vs-15-minute boundary inconsistency this catalog originally flagged for
  F.40/F.41 is fixed, system-wide.** What was previously two genuinely different things that
  happened to both say "5 minutes" — a stale *default-value* description (already 15 minutes in
  the shipped default, per the note that used to live here) and the *validation rule* itself
  (`StartMissaligned`/`EndMissaligned`, still genuinely 5 minutes at the time) — are now both
  consistently **15 minutes**, end to end: the server-side rule
  (`CreateMeetingHandler.parseOnFifteenMinuteBoundary`), the time pickers' `timeSteps`
  (`AddMeetingPage.tsx`'s `MEETING_TIME_STEPS`), the mocked-layer validation
  (`testSupport/mocks/handlers.ts`), and every doc/error-message string across `mootmaker-api`,
  this repo, and `mootmaker/use-cases.md`. See [f-add-meeting.md](f-add-meeting.md)'s F.40/F.41
  entries, now rewritten to describe the fixed behaviour rather than the drift.

## Known doc/code drift found while writing this catalog

One inconsistency remains from when this catalog was first written, cross-checking `use-cases.md`
against the actual webapp source — flagged here rather than silently "corrected" in place, since
fixing the wording is a decision for whoever owns those docs, not this catalog:

- **The demo user's linked-Person status is inconsistently described in code comments.**
  `HomePage.tsx`'s and `organiser-attendee-exclusivity.spec.ts`'s own comments both list "the demo
  user" alongside "the e2e test user" as accounts with *no* linked Person. That's true for the e2e
  user but not the demo user: `cognito.tf`'s `aws_dynamodb_table_item.demo_person` gives the demo
  user a real linked Person ("Demo Strater"), which is also exactly what lets
  `tests/add-meeting.spec.ts` rely on the organiser defaulting to the signed-in demo user without
  setting it explicitly. This catalog treats the demo user as Person-linked throughout (matching
  the Terraform, the existing passing spec, and `acceptance/README.md`'s own account guidance) —
  the stale comments are a small cleanup worth doing in the webapp repo separately.

## Known implementation gaps found while writing this catalog

Three cases in `use-cases.md` describe behaviour that doesn't appear to exist yet, confirmed by
reading the actual source rather than just the test failing to find a selector:

- **Nothing validates that a meeting's end time is after its start time.** Neither
  `AddMeetingPage.tsx` (no client-side comparison) nor `CreateMeetingHandler.java` /
  `MeetingError.java` (no `EndBeforeStart`-style rule, and no comparison between the parsed
  `startTime`/`endTime` anywhere in the handler) enforce this. `RoomAvailability.hasOverlappingMeeting`'s
  check (`startTime.isBefore(existingEnd) && endTime.isAfter(existingStart)`) doesn't independently
  guard against a reversed or zero-length range either — against an otherwise-free room, submitting
  `endTime <= startTime` appears to succeed and persist a nonsensical meeting. [F.42 in
  f-add-meeting.md](f-add-meeting.md#tc-f42) is written to match `use-cases.md` case 42's evident
  intent (rejection) and is expected to **fail** against current behaviour until this is fixed —
  that failure is the point, not a flaw in the test. Recommend filing this as a real
  `mootmaker-api` bug (a new `EndBeforeStart`/similar `MeetingError`) rather than adjusting the
  test to match the gap. See also F.43's Notes: because the webapp always combines both times
  against one shared `date` value, F.43's "spans midnight" scenario may collapse into this exact
  same request shape rather than being independently reachable through this form.
- **`RoomAvailabilityPage`'s "Add Meeting" button doesn't actually pass its currently-viewed date
  through.** `use-cases.md` case 37 expects the Add Meeting form to default to whichever date is
  currently being viewed on Room Availability; the button is a plain `<Link to="/meetings/add">`
  with no state/query param carrying the date, and `AddMeetingPage`'s `defaultDate()` always
  returns `dayjs().startOf('day')` (today), regardless of where the link was clicked from. See
  [E.37 in e-room-availability.md](e-room-availability.md#tc-e37).
- **`PersonCalendarPage` has no week/month navigation at all.** `use-cases.md` case 62 expects
  navigating between weeks/months; the page's visible 6-week window is computed once from
  `dayjs()` with an empty `useMemo` dependency array, and the only interactive control on the page
  is the Person selector — no prev/next buttons, no date picker. See [G.62 in
  g-person-calendar.md](g-person-calendar.md#tc-g62).

None of these were fixed in place — each is either a small missing feature or a genuinely missing
validation rule, and the right next step (build it vs. correct `use-cases.md`'s wording) is a
product decision, not something to resolve silently while writing a test-design catalog.
