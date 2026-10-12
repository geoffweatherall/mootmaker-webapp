# E. Room Availability

Use cases [mootmaker/use-cases.md § E](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#e-room-availability-viewing-a-rooms-schedule).
See [README.md](README.md) for the entry format and test-data conventions. Every case here signs in
as the standard user unless noted, and most need `page.clock.setFixedTime` pinned to a known
business-hours weekday, for the same flakiness reason `add-meeting.spec.ts` already documents.

---

<a id="tc-e26"></a>
### E.26 — View room availability for today

**Use case:** [use-cases.md#uc-26](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-26) — "View room availability for today."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** see the `android:` link on its use case, above

**Preconditions:** Signed in as the standard user. At least one room exists (create one if needed).

**Given** a signed-in user
**When** they navigate to `/rooms/<today>/availability` (e.g. via the sidebar's "Room Availability" item)
**Then** the page loads showing today's date and a card for every existing room

**Steps:**
1. Sign in as the standard user; ensure at least one room exists.
2. Click the sidebar's **Room Availability** nav item.

**Assertions:**
- URL matches `/rooms/<today's YYYY-MM-DD>/availability`.
- The date picker shows today's date.
- At least one room card is rendered with its name and capacity.

**Out of scope:** meetings actually shown in a card's expanded list (E.31/E.32); other dates (E.27/E.28).

**Notes:** None.

Room cards have no fixed hour range: a card's status reflects every meeting that day, including any outside business hours.

The busy/free timeline bar on each card shows 08:00-18:00 only: a meeting straddling an edge is clipped, and one entirely outside is not drawn. The status label and the expanded meeting list still reflect every meeting.

---

<a id="tc-e27"></a>
### E.27 — Navigate to a future date

**Use case:** [use-cases.md#uc-27](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-27) — "Navigate to a future date and view that day's schedule."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** see the `android:` link on its use case, above

**Preconditions:** Signed in as the standard user. Clock pinned. A meeting exists 3 days in the future (created via Add Meeting, date field set explicitly).

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
**Android:** see the `android:` link on its use case, above

**Preconditions:** Signed in as the standard user. Clock pinned.

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
**Android:** see the `android:` link on its use case, above

**Preconditions:** Signed in as the standard user. Clock pinned.

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

---

<a id="tc-e30"></a>
### E.30 — No rooms exist yet shows an empty state

**Use case:** [use-cases.md#uc-30](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-30) — "No rooms exist yet → empty state."
**Status:** ✅ Automated — [`tests/room-availability-empty.spec.ts`](../tests/room-availability-empty.spec.ts)
**Android:** see the `android:` link on its use case, above

**Preconditions:** A **genuinely fresh environment with zero rooms** — this is the one precondition in this whole catalog that can't be created by the test itself (rooms can only be added, never removed, through this app's own UI/API).

**Given** an environment with no rooms created yet
**When** a signed-in user views room availability
**Then** the `EmptyState` ("No rooms exist yet.", `empty-rooms.svg`) is shown instead of a grid

**Steps:**
1. Sign in as the standard user (or the e2e user — either works, no room-dependence).
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
**Android:** see the `android:` link on its use case, above

**Preconditions:** Signed in as the standard user. At least one room exists. Clock pinned to a date guaranteed to have no meetings (e.g. a date several months in the future, never touched by any other fixture).

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

---

<a id="tc-e32"></a>
### E.32 — A room card's expanded meeting list and click-through to details

**Use case:** [use-cases.md#uc-32](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-32) — "A room card's expanded meeting list shows subject + time range; clicking a meeting navigates to Meeting Details."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** see the `android:` link on its use case, above

**Preconditions:** Signed in as the standard user. A room and a meeting on it exist (create via Add Meeting), clock pinned to that meeting's date.

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

A meeting is a plain row in the room card's list, shown once the card is expanded.

---

<a id="tc-e33"></a>
### E.33 — Overlapping meetings in different rooms each show only on their own card

**Use case:** [use-cases.md#uc-33](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-33) — "Multiple overlapping-in-time meetings across different rooms each show only on their own room's card, without leaking into another room's."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** see the `android:` link on its use case, above

**Preconditions:** Signed in as the standard user. Two rooms ("Room A", "Room B"). Two meetings on the same date: Room A 10:00–11:00, Room B 10:30–11:30 (time-overlapping, different rooms — legal, since `TimeRangeUnavailable` is scoped per room). Clock pinned to that date.

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

---

<a id="tc-e34"></a>
### E.34 — Back-to-back meetings in the same room render as distinct, ordered rows

**Use case:** [use-cases.md#uc-34](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-34) — "Same room, back-to-back meetings (one ending exactly when another starts) both succeed and render as distinct, chronologically-ordered rows in the card's expanded meeting list."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** see the `android:` link on its use case, above

**Preconditions:** Signed in as the standard user. One room. Two meetings in it on the same date: 09:00–10:00 and 10:00–11:00 (touching end-to-start — explicitly allowed by the API's `[startTime, endTime)` half-open-interval rule, per `mootmaker-api/README.md`'s Validation table). Clock pinned.

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

Meetings are a vertical list, so "distinct, non-overlapping" is checked as two separate rows in the right order.

---

<a id="tc-e35"></a>
### E.35 — Room colour is consistent between Room Availability and Person Calendar

**Use case:** [use-cases.md#uc-35](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-35) — "Room identity colour is consistent for the same room across this page and Person Calendar."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** see the `android:` link on its use case, above

**Preconditions:** Signed in as the standard user (organiser, so the meeting shows on their own Person Calendar too). One room, one meeting on a date within the visible week, clock pinned accordingly.

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

Person Calendar's meeting row is a `ButtonBase` (role `button`, see G.65), so step 3 locates it by role `button`.

**Notes:** Both pages sort rooms the same way (`name.localeCompare`) specifically so this holds — if this test ever fails, check whether that sort order assumption still holds in both places before assuming a real regression.

---

<a id="tc-e36"></a>
### E.36 — Mobile viewport: single-column cards, no horizontal scroll

**Use case:** [use-cases.md#uc-36](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-36) — "On a narrow/mobile viewport: room-status cards stack in a single column, with no horizontal scrolling needed."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** see the `android:` link on its use case, above

**Preconditions:** Signed in as the standard user. At least one room.

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

The page never scrolls horizontally: cards stack in a responsive grid (`{ xs: '1fr', md: 'repeat(2, 1fr)' }`) at every width, so there is no sticky column or scroll hint to test.

---

<a id="tc-e37"></a>
### E.37 — "Add Meeting" from this page pre-fills the currently viewed date

**Use case:** [use-cases.md#uc-37](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-37) — "'Add Meeting' button from this page pre-fills the currently viewed date."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** see the `android:` link on its use case, above

**Preconditions:** Signed in as the standard user. Clock pinned.

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

<a id="tc-e38"></a>
### E.38 — Day navigation stops at the server's published window

**Use case:** mootmaker-webapp#60 — Room Availability's day navigation is bounded like Person Calendar's week navigation.
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** see the `android:` link on its use case, above

**Preconditions:** Signed in as the standard user. The window (`workspace.boundaries`) is read over the API, not recomputed.

**Given** Room Availability on the last bookable day
**Then** Next day is disabled and Previous day is enabled
**Given** Room Availability on the oldest retained day
**Then** Previous day is disabled and Next day is enabled

**Notes:** The date picker gets the same window as `minDate`/`maxDate`. Navigation stays unbounded until the boundaries arrive, rather than briefly disabling everything.
