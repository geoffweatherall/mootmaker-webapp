# G. Person Calendar

Use cases [mootmaker/use-cases.md § G](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#g-person-calendar).
See [README.md](README.md) for the entry format and test-data conventions. This page shows one
Monday–Friday work week at a time (not the six-week grid these cases originally described) — see
`designs/room-availability-and-person-calendar-redesign.md` and G.61/G.62's own Notes.

---

<a id="tc-g59"></a>
### G.59 — View your own calendar by default

**Use case:** [use-cases.md#uc-59](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-59) — "View your own calendar (default when navigating from Home/sidebar)."
**Status:** ✅ Automated — [`tests/person-calendar.spec.ts`](../tests/person-calendar.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** a signed-in user with a linked Person
**When** they click "Calendar" in the sidebar
**Then** `/persons/<their own personId>/calendar` loads with the Person selector already showing their own name

**Steps:**
1. Sign in as the demo user.
2. Click the sidebar's **Calendar** item.

**Assertions:**
- URL is `/persons/<demo's personId>/calendar`.
- The Person `Autocomplete` shows "Demo Strater" as the selected value.

**Out of scope:** switching to someone else's calendar (G.60).

**Notes:** None.

---

<a id="tc-g60"></a>
### G.60 — Switch to a different person's calendar via the person selector

**Use case:** [use-cases.md#uc-60](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-60) — "Navigate to a different person's calendar via the person selector (admin and standard user, if permitted)."
**Status:** ✅ Automated — [`tests/person-calendar.spec.ts`](../tests/person-calendar.spec.ts)
**Android:** not yet automated

**Preconditions:** A second Person exists ("Alice", created by the demo user via Settings). A confirmed standard test account with its own linked Person (`createConfirmedTestAccount`), to check the "standard user" half.

**Given** a signed-in user (admin, then separately a standard user) viewing their own calendar
**When** they select a different person from the `Autocomplete`
**Then** the URL and displayed data both switch to that person's calendar — with **no server-side restriction observed**, confirmed against `ListMeetingsHandler`'s source (`Identity.requireAuthenticated` only, no self-or-admin check)

**Steps:**
1. Sign in as the demo user; create "Alice" via Settings; navigate to own Calendar.
2. In the Person selector, choose "Alice".
3. Assert the URL updates to `/persons/<Alice's id>/calendar` and the selector shows "Alice".
4. Sign out; `createConfirmedTestAccount` a fresh standard account, sign in as it.
5. Navigate to its own Calendar; switch the Person selector to "Alice" the same way.

**Assertions:**
- Both the admin (step 1–3) and the standard user (step 4–5) can switch to viewing Alice's calendar; URL and selected-person both update correctly in each case.

**Out of scope:** whether this *should* be restricted (a product-policy question, not something this test can decide) — this case documents actual, current, unrestricted behaviour for both account classes, matching the source.

**Notes:** The use case's own "(admin and standard user, if permitted)" phrasing already anticipates this might be class-gated; it isn't, per direct source inspection of `ListMeetingsHandler`/`ListPeopleHandler`. Worth a product decision on whether a standard user viewing an arbitrary other person's calendar is intended — this test only documents what's true today.

---

<a id="tc-g61"></a>
### G.61 — The weekly agenda shows only work days (Mon–Fri)

**Use case:** [use-cases.md#uc-61](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-61) — "The weekly agenda shows only work days (Mon–Fri), one week at a time."
**Status:** ✅ Automated — [`tests/person-calendar.spec.ts`](../tests/person-calendar.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** the Person Calendar agenda
**When** viewed
**Then** exactly 5 day sections are rendered, headed Monday–Friday in order, with no Saturday/Sunday

**Steps:**
1. Sign in; navigate to own Calendar.
2. Click "Next week" once, so none of the five visible days is substituted with "Today"/"Tomorrow" (the default view always includes today, by definition).
3. Count the day headings; assert they read exactly `Monday, Tuesday, Wednesday, Thursday, Friday` in that order.

**Assertions:**
- Day headings: exactly those 5, in that order.

**Out of scope:** N/A.

**Notes:** None.

**2026-09-19: redesigned along with the whole page.** `PersonCalendarPage` replaced its six-stacked-weeks grid (30 day cells) with a single scrollable week (5 day sections) - see `designs/room-availability-and-person-calendar-redesign.md`. The "work days only" claim carries over unchanged; only the count (5, not 30) and the day-section markup (a plain `Box`, not an outlined `Paper`) changed.

---

<a id="tc-g62"></a>
### G.62 — Navigating between weeks

**Use case:** [use-cases.md#uc-62](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-62) — "Previous/Next week and This week navigate the visible one-week window, disabled at the server-published booking boundaries."
**Status:** ✅ Automated — [`tests/person-calendar.spec.ts`](../tests/person-calendar.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Clock pinned (this case books nothing, so a literal instant is fine - see the spec's own comment on why).

**Given** the Person Calendar's default (current) week
**When** the user clicks "Next week" three times, "This week", then "Previous week" once
**Then** the visible week range updates accordingly each time, and "This week" is disabled exactly when the visible week already is the current one

**Steps:**
1. Sign in; navigate to own Calendar.
2. Assert the visible range text and that "This week" is disabled.
3. Click "Next week" three times; assert the new range and that "This week" is now enabled.
4. Click "This week"; assert it's back to the original range and disabled again.
5. Click "Previous week"; assert the range one week behind the original.

**Assertions:**
- Each step's visible date range (`D MMM – D MMM YYYY`) matches what `startOfWorkWeek` plus a 5-day window computes for that instant.
- "This week" is disabled if and only if the visible week is the current one; "Previous week"/"Next week" are disabled only once the server's `earliestRetainedDate`/`latestBookableDate` boundaries are reached.

**Out of scope:** the exact retention/booking-horizon values themselves (`mootmaker-api`'s own concern) - this case only checks that the UI's enabled/disabled state and range math track whatever the server publishes.

**Notes:** None.

**2026-09-19: this case is now automatable - it previously named a real product gap.** `PersonCalendarPage.tsx` used to compute its 6-week window as a fixed `useMemo(() => startOfWorkWeek(dayjs()), [])`, with no control anywhere on the page to view any other week - a confirmed gap this catalog left on record rather than silently dropping. The redesign added `Previous week`/`Next week`/`This week` controls alongside the new one-week agenda, closing that gap as part of the same change. See `designs/room-availability-and-person-calendar-redesign.md`.

---

<a id="tc-g63"></a>
### G.63 — A day with no meetings vs. a day with several, sorted correctly

**Use case:** [use-cases.md#uc-63](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-63) — "A day with no meetings vs a day with several, sorted correctly."
**Status:** ✅ Automated — [`tests/person-calendar.spec.ts`](../tests/person-calendar.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room. Three meetings on the same day (within the visible week) at non-chronological creation order (e.g. 14:00, then 09:00, then 11:00), all organised by the demo user.

**Given** one day with 3 meetings and other days with none
**When** the calendar is viewed
**Then** the 3-meeting day's section lists all three, in ascending start-time order; other visible days show no meeting rows

**Steps:**
1. Sign in; create a room; create the 3 meetings on one fixed date within the visible week, in non-chronological creation order.
2. Navigate to own Calendar.
3. Locate that date's section (climb two DOM levels up from its date caption text); read its meeting rows (elements with role `button` - a meeting row opens the detail panel, it isn't a link) in DOM order.
4. Locate an unrelated date's section (no fixtures placed there).

**Assertions:**
- The 3-meeting section's rows read 09:00, 11:00, 14:00 in that order (ascending, independent of creation order).
- The other section shows zero meeting rows (just its date caption).

**Out of scope:** N/A.

**Notes:** None.

**2026-09-19: redesigned along with the whole page.** Day sections are no longer an outlined `Paper` (`.MuiPaper-outlined`), and a meeting row is a `ButtonBase` (role `button`) rather than an `<a>`, since clicking one now opens a detail panel first - see G.65 and `designs/room-availability-and-person-calendar-redesign.md`.

---

<a id="tc-g64"></a>
### G.64 — No people exist yet shows an empty state

**Use case:** [use-cases.md#uc-64](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-64) — "No people exist yet → empty state (edge case, admin-only-created scenario)."
**Status:** ❓ Infeasible as designed — see Notes
**Android:** not yet automated

**Preconditions:** A genuinely fresh environment with zero people — same class of precondition as E.30.

**Given** an environment with no Person records at all
**When** a signed-in user (necessarily someone whose own account has no linked Person either, in this state) views `/persons/<anything>/calendar`
**Then** the `EmptyState` ("No people exist yet.", `empty-people.svg`) is shown

**Steps:**
1. Sign in as the e2e user (no linked Person — consistent with "no people exist yet" at all).
2. Navigate directly to `/persons/none/calendar` (any placeholder id — the page doesn't require a resolvable one to render its own empty state, per `PersonCalendarPage.tsx`'s `people.length === 0` branch).

**Assertions:**
- `EmptyState` text "No people exist yet." is visible.

**Out of scope:** N/A.

**Notes:** **Confirmed infeasible, not just order-sensitive** — checked directly against a freshly
created ephemeral environment (`web-acc-260826-u4j2`, deployed 2026-08-26, before any test ran
against it): `aws dynamodb scan` on its People table already returned 1 item (`"Demo Strater"`).
`mootmaker-api/deploy/terraform/cognito.tf`'s `aws_dynamodb_table_item.demo_person` seeds the demo
user's linked Person directly via Terraform as part of every deploy - not through the app - so
**every environment this project can create already has exactly one Person from the moment it
exists, before any test (or even a human) touches it.** This isn't the same class of problem as
E.30: E.30's zero-rooms precondition is genuinely reachable (rooms really do start at zero and are
only ever added through the app); this one structurally never is, regardless of test ordering. This
is a decision for whoever owns the demo-data seeding and this test case, not something an
acceptance suite can route around: (a) accept this use case can't be automated against this
project's standard environments (an environment deployed with the demo-person seeding skipped would
need its own bespoke path, undermining the "same deploy every time" model), (b) change the seeding
so the demo user's Person is created lazily on first use instead of via Terraform, freeing up a
genuinely empty starting state, or (c) drop/reword this use case, since "no people exist yet" may
not be a reachable real-world state for this product at all. Left unautomated pending that decision.

---

<a id="tc-g65"></a>
### G.65 — Clicking a meeting row opens its detail panel, and Share reaches Meeting Details

**Use case:** [use-cases.md#uc-65](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-65) — "Clicking a meeting row opens its detail panel (bottom sheet on narrow viewports, a side panel at ≥900px); its Share action hands out a link to the standalone Meeting Details page."
**Status:** ✅ Automated — [`tests/person-calendar.spec.ts`](../tests/person-calendar.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room and one meeting on a date within the visible week.

**Given** a meeting visible on the calendar
**When** its row is clicked, and then the panel's Share button is clicked
**Then** the detail panel opens first, showing the subject as its own heading; Share writes the meeting's real `/meetings/<id>` URL to the clipboard (`navigator.share` forced onto its clipboard-fallback branch deterministically, since a real OS share sheet can't be driven by Playwright), and visiting that URL loads `MeetingDetailsPage` showing the same subject

**Steps:**
1. Sign in; create a room and a meeting on a date within the visible week.
2. Navigate to own Calendar; click the meeting's row (`getByText(subject, { exact: false })` within its date section).
3. Assert the detail panel's heading (level 2) equals the subject.
4. Click "Share meeting", read the URL off the clipboard, and visit it directly.

**Assertions:**
- After step 3: the panel is open, showing the subject as a level-2 heading.
- After step 4: the clipboard held a `/meetings/<id>` URL; visiting it shows `MeetingDetailsPage`'s (level-1) heading equal to the subject.

**Out of scope:** the details page's own content (section H); which surface (bottom sheet vs. side panel) renders at which viewport width - covered by the webapp's own mocked-integration suite instead, since it needs no real deployment to verify.

**Notes:** None.

**2026-09-19: redesigned along with the whole page.** Clicking a meeting row used to navigate straight to Meeting Details. The redesign inserted a detail panel first (organiser, attendees, room, time).

**2026-09-20: the panel's own "View full details" link removed; Share added instead.** `/meetings/:id` is now a deep-link-only route - nothing in the app navigates there directly any more, and the panel's Share action (Web Share API, clipboard-copy fallback) is the only way to reach it from here. The panel itself was also brought into structural parity with the full page (same shared `MeetingDetailContent` component now renders both) - see `../../designs/meeting-detail-consolidation.md` in the hub repo.

---

<a id="tc-g66"></a>
### G.66 — Room colour dot matches Room Availability's colour for the same room

**Use case:** [use-cases.md#uc-66](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-66) — "Room colour dot next to each meeting matches the same room's colour on Room Availability."
**Status:** ✅ Automated — [`tests/person-calendar.spec.ts`](../tests/person-calendar.spec.ts)
**Android:** not yet automated

**Preconditions:** Same as E.35 — this is the same check, initiated from the opposite page.

**Given** a meeting in a specific room, visible on both pages
**When** the room's colour is read from each
**Then** the two computed colours match

**Steps:** identical to [E.35](e-room-availability.md#tc-e35), reading `Person Calendar` first and `Room Availability` second (order doesn't matter functionally, only which page's spec file "owns" the fixture setup).

**Assertions:** Same as E.35.

**Out of scope:** Same as E.35.

**Notes:** **This is the same underlying check as E.35** (the use-cases list states it from each page's own perspective as two separate items). Recommend implementing it as a single shared spec/fixture rather than two independent tests that duplicate all the setup — cross-link kept here for traceability from `use-cases.md`'s numbering, not because two genuinely separate test runs add value.

---

<a id="tc-g67"></a>
### G.67 — "Calendar" nav item disabled with no linked Person

**Use case:** [use-cases.md#uc-67](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-67) — "'Calendar' nav item disabled for a signed-in user with no linked Person."
**Status:** ✅ Automated — [`tests/person-calendar.spec.ts`](../tests/person-calendar.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the e2e user (no linked Person).

**Given** a signed-in user with no linked Person
**When** the sidebar is viewed
**Then** the "Calendar" item is present but disabled — not hidden, not clickable through to anywhere

**Steps:**
1. Sign in as the e2e user.
2. Locate the sidebar's "Calendar" `ListItemButton`.

**Assertions:**
- The item is visible.
- It has MUI's disabled state (`aria-disabled="true"` or the `Mui-disabled` class — confirm which `MenuContent.tsx`'s disabled `ListItemButton` actually renders when this is implemented).
- Clicking it (if even possible while disabled) does not navigate anywhere.

**Out of scope:** the brief "awaiting resolution" spinner state `MenuContent.tsx` also has (that's for a not-yet-resolved `personId` mid-lookup — already deterministically covered by `webapp/tests/calendar-menu.spec.ts`'s mocked-layer test, which can gate the query open on demand in a way a real backend can't easily be made to do).

**Notes:** None.
