# Acceptance test case catalog

A detailed, per-use-case design for every test in the `acceptance/` suite — one entry per case in
[mootmaker/docs/reference/use-cases.md](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md),
written to be reviewed by a human before any test code exists, and precise enough to generate
that code from. This catalog is the *design*; [`../tests/`](../tests/) is the
*implementation*. Each entry's **Status** says whether it is automated; G.64 is not, being
infeasible against this project's standard environments (see its own Notes).

**Scope**: full coverage — every use case gets a complete real-browser test case
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
| [j-settings-rooms.md](j-settings-rooms.md) | J. Settings — Rooms *(superseded by P)* | 77–83 |
| [k-settings-people.md](k-settings-people.md) | K. Settings — People *(superseded by Q)* | 84–88 |
| [l-authorization-boundaries.md](l-authorization-boundaries.md) | L. Authorization boundaries | 89–91 |
| [m-cross-cutting.md](m-cross-cutting.md) | M. Cross-cutting / non-functional | 92–99, 109–111 |
| [n-date-time-format-settings.md](n-date-time-format-settings.md) | N. Settings — Date and time format | 100–106 |
| [o-edit-and-cancel-meetings.md](o-edit-and-cancel-meetings.md) | O. Edit and Cancel Meetings | 112–123 |
| [p-rooms.md](p-rooms.md) | P. Rooms *(supersedes J)* | 124–131 |
| [q-persons.md](q-persons.md) | Q. Persons *(supersedes K)* | 132–143 |

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
- **Android**: `mootmaker-android`'s acceptance suite is organised by the same use-case IDs, and
  `use-cases.md`'s per-item link line carries its `android: ...` entry (the test that covers the case
  on Android, or why there is none). That line is the one place Android coverage is recorded; each
  test case here only points to it, rather than keeping a second copy that drifts.

## Entry format

Every test case follows the same shape:

- **Anchor + heading** — `<a id="tc-<sectionletter><n>"></a>` (e.g. `tc-f38`) then `### <ID> —
  <short title>`. The anchor is what `use-cases.md` and cross-references link to; it's stable even
  if the heading text changes later.
- **Use case** — link + the exact wording quoted from `use-cases.md` at the time this was written
  (so a later edit to that wording is visible as a diff against what this test case was actually
  designed for).
- **Status** — ✅ Automated (with a link to the spec file) or ⬜ Planned (not yet automated).
- **Android** — a pointer to the use case's `android:` link in `use-cases.md`, see above.
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

Decided in mootmaker-api#95 and mootmaker-webapp#138 - see [../README.md](../README.md)'s "Which
account to sign in as". In short:

- **The standard user** (`E2E_STANDARD_USER_EMAIL` / `_PASSWORD`) - non-admin, with a linked
  Person ("E2E Standard"). The default for every case.
- **The admin user** (`E2E_ADMIN_USER_EMAIL` / `_PASSWORD`) - admin, Person "E2E Admin". Only for
  cases whose subject is admin functionality (sections P and Q, an admin editing or cancelling
  someone else's meeting, admin-only UI).
- **The no-person user** (`E2E_NO_PERSON_USER_EMAIL` / `_PASSWORD`) - standard, with **no linked
  Person**. For "signed in, but no linked Person" cases.
- **A fresh signed-up account** - through the real UI + `mootmaker-email-testing`'s
  `waitForVerificationCode` when the sign-up or reset flow itself is under test, or via
  `support/cognitoAdmin.ts`'s `createConfirmedTestAccount` when a test changes its own account
  (name, preferences, deletion, an admin grant) or needs another real user. Either way it gets a
  linked Person, since `AdminConfirmSignUp` fires the same `PostConfirmationCreatePersonHandler` a
  real confirmation would.
- **The demo user** (`DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD`) - only B.11 and D.21, whose subject
  is the demo login on the home page.
- **Rooms, guest people, meetings, avatars** - created over the API by the test that needs them
  (`tests/support/setupApi.ts`), unless creating them through the admin UI is the subject.

Every test starts from a reset environment (`tests/support/test.ts`): no rooms, no meetings, and the
demo and fixture users, repaired to exactly the state above. So no case depends on another case's
leftovers, on demo-data, or on run order.
