# E. Room Availability

Use cases [mootmaker/use-cases.md § E](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#e-room-availability-viewing-a-rooms-schedule).
See [README.md](README.md) for the entry format and test-data conventions. Every case here signs in
as the demo user unless noted, and most need `page.clock.setFixedTime` pinned to a known
business-hours weekday, for the same flakiness reason `add-meeting.spec.ts` already documents.

---

<a id="tc-e26"></a>
### E.26 — View room availability for today

**Use case:** [use-cases.md#uc-26](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-26) — "View room availability for today."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. At least one room exists (create one if needed).

**Given** a signed-in user
**When** they navigate to `/rooms/<today>/availability` (e.g. via the sidebar's "Room Availability" item)
**Then** the page loads showing today's date and a card for every existing room

**Steps:**
1. Sign in as the demo user; ensure at least one room exists.
2. Click the sidebar's **Room Availability** nav item.

**Assertions:**
- URL matches `/rooms/<today's YYYY-MM-DD>/availability`.
- The date picker shows today's date.
- At least one room card is rendered with its name and capacity.

**Out of scope:** meetings actually shown in a card's expanded list (E.31/E.32); other dates (E.27/E.28).

**Notes:** None.

**2026-09-19: redesigned along with the whole page.** The old fixed-hour timeline grid, and its "Showing business hours (08:00–17:00)." caption, were replaced by room-status cards with no fixed hour range - see `designs/room-availability-and-person-calendar-redesign.md`. Meetings outside 08:00-17:00 are no longer hidden; a card's status simply reflects whatever meetings exist that day.

**2026-09-23: the busy/free timeline bar (not the status label or expanded list) was narrowed to an 08:00-18:00 visible window** - a meeting straddling the edge is clipped to it, and one entirely outside is not rendered in the bar. See mootmaker-webapp#114. The card's status and expanded meeting list are unaffected and still reflect every meeting regardless of time.

---

<a id="tc-e27"></a>
### E.27 — Navigate to a future date

**Use case:** [use-cases.md#uc-27](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-27) — "Navigate to a future date and view that day's schedule."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Clock pinned. A meeting exists 3 days in the future (created via Add Meeting, date field set explicitly).

**Given** a user viewing today's room availability
**When** they click the "Next day" control three times (or use the date picker directly)
**Then** the grid updates to that future date's URL and shows that date's meeting

**Steps:**
1. Sign in; pin the clock; ensure the future meeting fixture exists.
2. Navigate to today's availability.
3. Click **Next day** (`getByLabel('Next day')`) three times.

**Assertions:**
- URL matches the expected future date.
- The date picker reflects that date.
- The fixture meeting for that date is visible in the grid.

**Out of scope:** the date-picker-direct-jump mechanism (E.29 covers arbitrary jumps specifically).

**Notes:** None.

---

<a id="tc-e28"></a>
### E.28 — Navigate to a past date

**Use case:** [use-cases.md#uc-28](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-28) — "Navigate to a past date and view that day's schedule."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Clock pinned.

**Given** a user viewing today's room availability
**When** they click "Previous day"
**Then** the grid updates to show yesterday's URL/date

**Steps:**
1. Sign in; pin the clock.
2. Navigate to today's availability.
3. Click **Previous day** (`getByLabel('Previous day')`).

**Assertions:**
- URL matches yesterday's date; date picker reflects it.

**Out of scope:** whether a meeting actually exists on that past date (not required by this use case's wording — it only asks that navigation itself works; E.27 already proves a fixture-meeting shows up correctly for a navigated-to date).

**Notes:** No new meeting fixture needed here — reuses the mechanism E.27 already exercises for the opposite direction, deliberately kept minimal since past-dated meetings can't be created through the real Add Meeting form's date picker in the same easy way a future one can (worth confirming during implementation whether the picker even allows selecting a past date at all — if it doesn't, a past-date fixture would need seeding some other way, which this suite has no bypass for).

---

<a id="tc-e29"></a>
### E.29 — Date picker jumps to an arbitrary date

**Use case:** [use-cases.md#uc-29](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-29) — "Date picker jump to an arbitrary date (not just next/prev day)."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Clock pinned.

**Given** a user viewing today's room availability
**When** they open the date picker and select a date several weeks away (not reachable sensibly via repeated next/prev clicks)
**Then** the grid jumps directly to that date

**Steps:**
1. Sign in; pin the clock.
2. Navigate to today's availability.
3. Open the `DatePicker`, navigate its calendar UI to a date ~6 weeks out, and select it.

**Assertions:**
- URL matches the selected date exactly.

**Out of scope:** the calendar picker's own internal navigation UI (MUI X component internals, not this app's code).

**Notes:** None.

**2026-08-27 update:** re-verified live and passing (5.3s) against a fresh ephemeral environment. The prior failure (`locator.click: Test timeout of 120000ms exceeded` on the target day cell, "element is not stable" / "element was detached from the DOM, retrying") reproduced only against a heavily-populated shared environment (28+ accumulated rooms from other specs); against a fresh environment with a normal room count the same unmodified test code passes cleanly and quickly. No test or product change was needed here - treated as environment-bloat-induced instability in the earlier run, not a real bug in this test's logic.

---

<a id="tc-e30"></a>
### E.30 — No rooms exist yet shows an empty state

**Use case:** [use-cases.md#uc-30](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-30) — "No rooms exist yet → empty state."
**Status:** ✅ Automated — [`tests/00-room-availability-empty.spec.ts`](../tests/00-room-availability-empty.spec.ts)
**Android:** not yet automated

**Preconditions:** A **genuinely fresh environment with zero rooms** — this is the one precondition in this whole catalog that can't be created by the test itself (rooms can only be added, never removed, through this app's own UI/API).

**Given** an environment with no rooms created yet
**When** a signed-in user views room availability
**Then** the `EmptyState` ("No rooms exist yet.", `empty-rooms.svg`) is shown instead of a grid

**Steps:**
1. Sign in as the demo user (or the e2e user — either works, no room-dependence).
2. Navigate to `/rooms/<today>/availability`.

**Assertions:**
- `EmptyState` with text "No rooms exist yet." is visible; no grid `Paper` is rendered.

**Out of scope:** N/A.

**Notes:** **Feasibility caveat**: because every other test in this catalog that needs a room creates one and rooms are never deleted, this test only passes if it runs *before* any room-creating test in the same environment. Practical options: run it as the very first spec against a freshly created ephemeral environment (e.g. a file name that sorts first, like `00-room-availability-empty.spec.ts`), or run it alone via Playwright's `--grep` against its own fresh `acceptance/run.sh` invocation. Whichever approach is chosen should be written down in the actual spec file's own comment when this is implemented, the same way `add-meeting.spec.ts` documents its own ordering-sensitive assumptions.

---

<a id="tc-e31"></a>
### E.31 — Rooms exist but none has meetings that day

**Use case:** [use-cases.md#uc-31](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-31) — "Rooms exist but none has meetings that day → cards show a 'Free all day'/zero-meetings status, not the no-rooms empty state."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. At least one room exists. Clock pinned to a date guaranteed to have no meetings (e.g. a date several months in the future, never touched by any other fixture).

**Given** rooms exist but none has a meeting on the viewed date
**When** a user views that date's availability
**Then** the room's card renders with a "Free all day" status and a "(0)" meeting count, not the "no rooms" empty state

**Steps:**
1. Sign in; ensure a room exists; pin the clock to a far-future date.
2. Navigate to that date's availability.

**Assertions:**
- The room's card, with its name and capacity, is visible.
- The card's "See <day>'s meetings" toggle button reads "(0)".
- The "No rooms exist yet." empty state is NOT shown (distinguishing this from E.30).

**Out of scope:** N/A.

**Notes:** Picking a date far enough in the future to be collision-free with every other fixture in this catalog is simpler than trying to guarantee isolation any other way, given there's no way to query/clear meetings directly.

**2026-09-19: redesigned along with the whole page.** `RoomAvailabilityPage`'s fixed-hour timeline grid was replaced by a scrollable list of room-status cards - see `designs/room-availability-and-person-calendar-redesign.md`. The "grid, not empty state" distinction this case checks still holds, just via the card's own zero-meetings status rather than an empty lane in an hour-axis grid.

---

<a id="tc-e32"></a>
### E.32 — A room card's expanded meeting list and click-through to details

**Use case:** [use-cases.md#uc-32](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-32) — "A room card's expanded meeting list shows subject + time range; clicking a meeting navigates to Meeting Details."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room and a meeting on it exist (create via Add Meeting), clock pinned to that meeting's date.

**Given** a meeting on a room's card
**When** the user expands that card's meeting list and clicks the meeting
**Then** the list shows `"<start>–<end>"` and the subject, and clicking navigates to that meeting's own Details page

**Steps:**
1. Sign in; create a room and a meeting with a known subject/time; pin the clock to its date.
2. Navigate to that date's availability.
3. Click the room card's "See <day>'s meetings (N)" toggle to expand it.
4. Locate the meeting row (the only element inside the card with role `link`) and assert its text.
5. Click it.

**Assertions:**
- The meeting row's text contains `"<HH:mm>–<HH:mm>"` (via `formatLocalTime`) and the subject.
- After click: URL is `/meetings/<id>`; `MeetingDetailsPage` shows the same subject.

**Out of scope:** the details page's own field-by-field content (section H covers that).

**Notes:** The meeting row isn't reliably locatable by plain subject text alone: the card's own status sublabel (e.g. "Busy until 09:30", or its bare subject when a meeting is in progress right now) can independently contain the same subject as a substring or, for an in-progress meeting, an exact duplicate. Scoping by role `link` - only the meeting row itself has one - avoids that ambiguity regardless of which status branch is showing.

**2026-09-19: redesigned along with the whole page.** This case used to be about a `Tooltip`'s `aria-label` on an always-visible, absolutely-positioned meeting block. The card redesign removed both the tooltip and the block layout: a meeting is now a plain row in a list, shown only once its room's card is expanded. See `designs/room-availability-and-person-calendar-redesign.md`.

---

<a id="tc-e33"></a>
### E.33 — Overlapping meetings in different rooms each show only on their own card

**Use case:** [use-cases.md#uc-33](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-33) — "Multiple overlapping-in-time meetings across different rooms each show only on their own room's card, without leaking into another room's."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Two rooms ("Room A", "Room B"). Two meetings on the same date: Room A 10:00–11:00, Room B 10:30–11:30 (time-overlapping, different rooms — legal, since `TimeRangeUnavailable` is scoped per room). Clock pinned to that date.

**Given** two meetings overlapping in time but in different rooms
**When** the user expands both rooms' cards
**Then** each meeting appears only inside its own room's card, and both are independently clickable

**Steps:**
1. Sign in; create Room A and Room B; create both meetings; pin the clock.
2. Navigate to the shared date's availability.
3. Expand Room A's card and Room B's card.
4. Assert Room A's meeting subject is within Room A's card and absent from Room B's, and vice versa.
5. Click each meeting in turn (re-expanding the other room's card after the first navigate-away-and-back, since a real navigation remounts the page and resets which cards are expanded) and assert it reaches its own Meeting Details page.

**Assertions:**
- Room A's meeting subject appears only within Room A's card (not Room B's), and vice versa.
- Both meetings are independently clickable to their own `/meetings/<id>`.

**Out of scope:** same-room overlap, which is actually rejected server-side (`TimeRangeUnavailable`) and can't be created as a fixture at all — see E.34 for the same-room, non-overlapping (touching) case that *is* legal.

**Notes:** "Without leaking into another room's card" is operationalised as "each meeting is scoped to the correct room's own card" — each room's meetings are only ever rendered inside that room's own `Collapse`, so this is a structural guarantee rather than something that could flake.

**2026-09-19: redesigned along with the whole page.** Previously about two rows in a grid; now about two cards. See `designs/room-availability-and-person-calendar-redesign.md`.

---

<a id="tc-e34"></a>
### E.34 — Back-to-back meetings in the same room render as distinct, ordered rows

**Use case:** [use-cases.md#uc-34](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-34) — "Same room, back-to-back meetings (one ending exactly when another starts) both succeed and render as distinct, chronologically-ordered rows in the card's expanded meeting list."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. One room. Two meetings in it on the same date: 09:00–10:00 and 10:00–11:00 (touching end-to-start — explicitly allowed by the API's `[startTime, endTime)` half-open-interval rule, per `mootmaker-api/README.md`'s Validation table). Clock pinned.

**Given** two meetings in the same room that touch but don't overlap
**When** the user expands that room's card
**Then** both meetings were created successfully (proving the server-side boundary rule) and both appear as two separate rows, in start-time order

**Steps:**
1. Sign in; create the room; create the 09:00–10:00 meeting; create the 10:00–11:00 meeting (assert this second creation succeeds — it's the actual boundary condition under test, not just the rendering).
2. Navigate to the shared date's availability and expand the room's card.
3. Read the card's meeting rows (elements with role `link`) in DOM order.

**Assertions:**
- Both meetings were created without a `TimeRangeUnavailable` error.
- Exactly two rows exist, the first containing "09:00" and the first subject, the second containing "10:00" and the second subject.

**Out of scope:** a genuinely overlapping pair (e.g. 09:00–10:01 and 10:00–11:00) — that's a negative case belonging to F.50, not this one, which is specifically about the *legal* touching boundary.

**Notes:** This is the most direct proof in the whole catalog of the `[startTime, endTime)` half-open interval semantics actually working end-to-end (API + UI), not just documented.

**2026-09-19: redesigned along with the whole page.** The old assertion read the two meeting blocks' bounding boxes to confirm no horizontal pixel overlap - a concept specific to the old grid's absolutely-positioned blocks. The card redesign renders meetings as a plain vertical list, so "distinct, non-overlapping" is now checked as "two separate rows, correctly ordered" instead. See `designs/room-availability-and-person-calendar-redesign.md`.

---

<a id="tc-e35"></a>
### E.35 — Room colour is consistent between Room Availability and Person Calendar

**Use case:** [use-cases.md#uc-35](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-35) — "Room identity colour is consistent for the same room across this page and Person Calendar."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user (organiser, so the meeting shows on their own Person Calendar too). One room, one meeting on a date within the visible week, clock pinned accordingly.

**Given** a meeting in a specific room, visible on both Room Availability and the organiser's Person Calendar
**When** the same room's colour swatch is read from both pages
**Then** the two computed colours are identical

**Steps:**
1. Sign in; create the room and the meeting; pin the clock to a date within the visible week.
2. Navigate to that date's Room Availability; read the room card's colour dot's computed `background-color` via `evaluate(el => getComputedStyle(el).backgroundColor)`.
3. Navigate to `/persons/<demoPersonId>/calendar`; find the meeting row (a `ButtonBase`, role `button`, matched by its accessible name - its visible text - rather than by role `link`, since clicking it opens a detail panel instead of navigating), read its colour dot (the row's first child element) the same way.

**Assertions:**
- The two computed `background-color` (or equivalent CSS custom property/`rgb()`) values are identical.

**Out of scope:** the actual palette-assignment algorithm (position-in-sorted-room-list) or its 8-hue wraparound — that's `theme/roomColor.ts` logic, already unit-tested per the main README's "Unit tests" section; this case only checks the two pages agree with *each other*, not that the algorithm itself is "correct" in some abstract sense.

**2026-09-19: locators updated for the redesign.** Room Availability's own colour-dot markup is unchanged. Person Calendar's meeting row changed from an `<a>` to a `ButtonBase` (see G.65), so step 3's locator changed from role `link` to role `button` accordingly. See `designs/room-availability-and-person-calendar-redesign.md`.

**Notes:** Both pages sort rooms the same way (`name.localeCompare`) specifically so this holds — if this test ever fails, check whether that sort order assumption still holds in both places before assuming a real regression.

---

<a id="tc-e36"></a>
### E.36 — Mobile viewport: single-column cards, no horizontal scroll

**Use case:** [use-cases.md#uc-36](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-36) — "On a narrow/mobile viewport: room-status cards stack in a single column, with no horizontal scrolling needed."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. At least one room.

**Given** a signed-in user on a narrow viewport
**When** they view Room Availability
**Then** room cards stack in a single column and the page never needs horizontal scrolling to be read

**Steps:**
1. `page.setViewportSize({ width: 375, height: 667 })` (a typical mobile width).
2. Sign in; ensure a room exists; navigate to availability.
3. Compare `document.documentElement.scrollWidth` to `clientWidth`.
4. Read the room card's bounding-box width.

**Assertions:**
- `scrollWidth <= clientWidth` (no horizontal overflow).
- The room card's width is close to the full viewport width (a single column, not sharing a row with a second card the way the ≥`md` two-column layout would).

**Out of scope:** the exact breakpoint at which the layout switches from one column to two (an implementation detail of the `sx` grid template, not part of this use case's own wording).

**Notes:** N/A.

**2026-09-19: redesigned along with the whole page.** This case used to be about a fixed-hour timeline grid wide enough to force horizontal scrolling on a narrow screen (`mootmaker-webapp#11`, the defect this whole redesign exists to close) - the room-name column staying pinned via `position: sticky`, and scroll-fade hints tracking the scrollable edges. The card redesign removes horizontal scrolling from this page entirely: cards stack vertically at every viewport width via a responsive CSS grid (`{ xs: '1fr', md: 'repeat(2, 1fr)' }`), so there is no sticky column and no fade hints to test any more - the case now checks the thing the redesign actually set out to fix. See `designs/room-availability-and-person-calendar-redesign.md`.

---

<a id="tc-e37"></a>
### E.37 — "Add Meeting" from this page pre-fills the currently viewed date

**Use case:** [use-cases.md#uc-37](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-37) — "'Add Meeting' button from this page pre-fills the currently viewed date."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Clock pinned.

**Given** a user viewing a date other than today (e.g. navigated forward several days)
**When** they click this page's own "Add Meeting" button
**Then** the Add Meeting form's Date field defaults to the *viewed* date, not today's

**Steps:**
1. Sign in; pin the clock.
2. Navigate to today's availability; click **Next day** three times.
3. Click **Add Meeting** (`getByRole('link', { name: 'Add Meeting' })` — the header button on desktop viewports; use the footer copy instead on a narrow one, see E.36).
4. Read the **Date** field's value.

**Assertions:**
- Date field shows the date that was being viewed (today + 3 days), not today's actual pinned date.

**Out of scope:** the Home page's own "Add Meeting" entry point, which pre-fills *today* instead (D.25) — this case is specifically the *contrast* with that one.

**Notes:** Cross-check this against `AddMeetingPage.tsx`'s actual `defaultDate()` implementation when this is written — as of this catalog, `defaultDate()` always returns `dayjs().startOf('day')` (i.e. today), with no apparent wiring to a date passed from `RoomAvailabilityPage`'s "Add Meeting" link. **This may be a real gap, not yet implemented** — if so, this test should be written to fail honestly against current behaviour (documenting the gap) rather than adjusted to match what the code happens to do; flag it for a decision (build the feature, or correct the use case's wording) rather than silently treating whichever the code does as correct.
