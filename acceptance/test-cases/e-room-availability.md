# E. Room Availability

Use cases [mootmaker/use-cases.md § E](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#e-room-availability-viewing-a-rooms-schedule).
See [README.md](README.md) for the entry format and test-data conventions. Every case here signs in
as the demo user unless noted, and most need `page.clock.setFixedTime` pinned to a known
business-hours weekday, for the same flakiness reason `add-meeting.spec.ts` already documents.

---

<a id="tc-e26"></a>
### E.26 — View room availability for today

**Use case:** [use-cases.md#uc-26](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-26) — "View room availability for today."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. At least one room exists (create one if needed).

**Given** a signed-in user
**When** they navigate to `/rooms/<today>/availability` (e.g. via the sidebar's "Room Availability" item)
**Then** the grid loads showing today's date, business hours (08:00–17:00), and every existing room as a lane

**Steps:**
1. Sign in as the demo user; ensure at least one room exists.
2. Click the sidebar's **Room Availability** nav item.

**Assertions:**
- URL matches `/rooms/<today's YYYY-MM-DD>/availability`.
- The date picker shows today's date.
- "Showing business hours (08:00–17:00)." text is visible.
- At least one room lane is rendered with its name and capacity.

**Out of scope:** meetings actually shown in the grid (E.31/E.32); other dates (E.27/E.28).

**Notes:** None.

---

<a id="tc-e27"></a>
### E.27 — Navigate to a future date

**Use case:** [use-cases.md#uc-27](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-27) — "Navigate to a future date and view that day's schedule."
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

**Use case:** [use-cases.md#uc-28](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-28) — "Navigate to a past date and view that day's schedule."
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

**Use case:** [use-cases.md#uc-29](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-29) — "Date picker jump to an arbitrary date (not just next/prev day)."
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

**Use case:** [use-cases.md#uc-30](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-30) — "No rooms exist yet → empty state."
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

**Use case:** [use-cases.md#uc-31](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-31) — "Rooms exist but none has meetings that day → grid shows with empty lanes."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. At least one room exists. Clock pinned to a date guaranteed to have no meetings (e.g. a date several months in the future, never touched by any other fixture).

**Given** rooms exist but none has a meeting on the viewed date
**When** a user views that date's availability
**Then** the grid itself renders (room lanes, hour marks) with no meeting blocks, not the "no rooms" empty state

**Steps:**
1. Sign in; ensure a room exists; pin the clock to a far-future date.
2. Navigate to that date's availability.

**Assertions:**
- Room lane(s) with name/capacity are visible.
- No meeting `ButtonBase`/tooltip elements are present.
- The "No rooms exist yet." empty state is NOT shown (distinguishing this from E.30).

**Out of scope:** N/A.

**Notes:** Picking a date far enough in the future to be collision-free with every other fixture in this catalog is simpler than trying to guarantee isolation any other way, given there's no way to query/clear meetings directly.

**2026-08-27 root cause: test bug, fixed.** The link-count assertion was scoped via a raw `page.locator('.MuiPaper-root')`, which - confirmed against a real run - also matches `Layout.tsx`'s own sidebar `Drawer` (always in the DOM as a Paper, even when CSS-hidden at some viewports) alongside the availability grid's own Paper, so it picked up the sidebar's 6 nav links too ("Expected: 0, Received: 6"). Fixed by adding a `gridPaper(page)` helper that walks up from the grid's own unique "08:00" hour-mark text to its nearest `MuiPaper-root` ancestor, isolating just the grid. Re-verified live and passing.

---

<a id="tc-e32"></a>
### E.32 — Meeting block tooltip and click-through to details

**Use case:** [use-cases.md#uc-32](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-32) — "A meeting block's tooltip shows subject + time range; clicking it navigates to Meeting Details."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room and a meeting on it exist (create via Add Meeting), clock pinned to that meeting's date.

**Given** a meeting visible on the grid
**When** the user hovers its block and then clicks it
**Then** a tooltip shows `"<subject>: <start>–<end>"`, and clicking navigates to that meeting's own Details page

**Steps:**
1. Sign in; create a room and a meeting with a known subject/time; pin the clock to its date.
2. Navigate to that date's availability.
3. Hover the meeting block (`getByText(subject)` within the grid).
4. Assert the MUI `Tooltip` content.
5. Click the block.

**Assertions:**
- Tooltip text equals `"<subject>: <HH:mm>–<HH:mm>"` (via `formatLocalTime`).
- After click: URL is `/meetings/<id>`; `MeetingDetailsPage` shows the same subject.

**Out of scope:** the details page's own field-by-field content (section H covers that).

**Notes:** Playwright tooltip hover can be flaky in headless mode — consider asserting via the element's `title`/ARIA description attribute if MUI exposes one, rather than relying purely on a real hover-triggered popper being visible, when this is implemented.

**2026-08-27 root cause: test bug, fixed.** The tooltip assertion checked a native `title` HTML attribute, but confirmed against both `@mui/material`'s own `Tooltip` source and a real run: with the default `describeChild={false}` (used here), MUI never sets a `title` attribute at all - only `aria-label`, unconditionally (real run: asserting `title` failed with "Received: null"; the element's actual `aria-label` was `"<subject>: 09:00–09:30"`). Fixed by asserting `aria-label` instead. Re-verified live and passing.

---

<a id="tc-e33"></a>
### E.33 — Overlapping meetings in different rooms render in their own lanes

**Use case:** [use-cases.md#uc-33](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-33) — "Multiple overlapping-in-time meetings across different rooms render in their own room's lane without visual confusion."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Two rooms ("Room A", "Room B"). Two meetings on the same date: Room A 10:00–11:00, Room B 10:30–11:30 (time-overlapping, different rooms — legal, since `TimeRangeUnavailable` is scoped per room). Clock pinned to that date.

**Given** two meetings overlapping in time but in different rooms
**When** the user views that day's grid
**Then** each meeting renders inside its own room's row, and both are simultaneously visible and individually clickable

**Steps:**
1. Sign in; create Room A and Room B; create both meetings; pin the clock.
2. Navigate to the shared date's availability.
3. Locate Room A's row (`getByText('Room A')`'s ancestor row) and assert the Room A meeting's subject is within it.
4. Locate Room B's row similarly for its own meeting.

**Assertions:**
- Room A's meeting subject appears only within Room A's row's bounding box (not Room B's).
- Room B's meeting subject appears only within Room B's row's bounding box.
- Both blocks are independently clickable to their own `/meetings/<id>`.

**Out of scope:** the exact pixel horizontal-overlap rendering within a single lane (not applicable here — different lanes rule that out by construction); same-room overlap, which is actually rejected server-side (`TimeRangeUnavailable`) and can't be created as a fixture at all — see E.34 for the same-room, non-overlapping (touching) case that *is* legal.

**Notes:** "Without visual confusion" is operationalised here as "each block is scoped to the correct room's row" — the strongest deterministic proxy for the visual claim without doing pixel-level screenshot comparison.

---

<a id="tc-e34"></a>
### E.34 — Back-to-back meetings in the same room render distinctly

**Use case:** [use-cases.md#uc-34](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-34) — "Same room, back-to-back meetings (one ending exactly when another starts) both render distinctly, non-overlapping."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. One room. Two meetings in it on the same date: 09:00–10:00 and 10:00–11:00 (touching end-to-start — explicitly allowed by the API's `[startTime, endTime)` half-open-interval rule, per `mootmaker-api/README.md`'s Validation table). Clock pinned.

**Given** two meetings in the same room that touch but don't overlap
**When** the user views that day's grid
**Then** both meetings are created successfully (proving the server-side boundary rule) and both render as two separate, non-overlapping blocks

**Steps:**
1. Sign in; create the room; create the 09:00–10:00 meeting; create the 10:00–11:00 meeting (assert this second creation succeeds — it's the actual boundary condition under test, not just the rendering).
2. Navigate to the shared date's availability.
3. Get bounding boxes for both meeting blocks (`boundingBox()`).

**Assertions:**
- Both meetings were created without a `TimeRangeUnavailable` error.
- Both subjects are visible as two distinct elements.
- Block 1's right edge x-coordinate is ≤ block 2's left edge x-coordinate (no horizontal pixel overlap) — read as `right(block1) <= left(block2) + 1` to allow for sub-pixel rounding.

**Out of scope:** a genuinely overlapping pair (e.g. 09:00–10:01 and 10:00–11:00) — that's a negative case belonging to F.50, not this one, which is specifically about the *legal* touching boundary.

**Notes:** This is the most direct proof in the whole catalog of the `[startTime, endTime)` half-open interval semantics actually working end-to-end (API + UI), not just documented.

---

<a id="tc-e35"></a>
### E.35 — Room colour is consistent between Room Availability and Person Calendar

**Use case:** [use-cases.md#uc-35](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-35) — "Room identity colour is consistent for the same room across this page and Person Calendar."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user (organiser, so the meeting shows on their own Person Calendar too). One room, one meeting on a date within the visible 6-week calendar window, clock pinned accordingly.

**Given** a meeting in a specific room, visible on both Room Availability and the organiser's Person Calendar
**When** the same room's colour swatch is read from both pages
**Then** the two computed colours are identical

**Steps:**
1. Sign in; create the room and the meeting; pin the clock to a date within the current 6-week window.
2. Navigate to that date's Room Availability; read the room lane's colour dot's computed `background-color` via `evaluate(el => getComputedStyle(el).backgroundColor)`.
3. Navigate to `/persons/<demoPersonId>/calendar`; find the same date's cell, read the meeting row's colour dot's computed `background-color` the same way.

**Assertions:**
- The two computed `background-color` (or equivalent CSS custom property/`rgb()`) values are identical.

**Out of scope:** the actual palette-assignment algorithm (position-in-sorted-room-list) or its 8-hue wraparound — that's `theme/roomColor.ts` logic, already unit-tested per the main README's "Unit tests" section; this case only checks the two pages agree with *each other*, not that the algorithm itself is "correct" in some abstract sense.

**Notes:** Both pages sort rooms the same way (`name.localeCompare`) specifically so this holds — if this test ever fails, check whether that sort order assumption still holds in both places before assuming a real regression.

---

<a id="tc-e36"></a>
### E.36 — Mobile viewport: horizontal scroll, pinned room column, scroll-fade hints

**Use case:** [use-cases.md#uc-36](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-36) — "On a narrow/mobile viewport: grid scrolls horizontally, room name column stays pinned, scroll-fade hints appear/disappear correctly at the edges."
**Status:** ✅ Automated — [`tests/room-availability.spec.ts`](../tests/room-availability.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. At least one room (the grid's `minWidth: 720` needs to exceed a narrow viewport for scrolling to be possible at all).

**Given** a signed-in user on a narrow viewport viewing a grid wider than the screen
**When** they scroll the grid horizontally
**Then** the room-name column stays visually pinned at the left, and the left/right fade hints appear and disappear correctly as the scroll position changes

**Steps:**
1. `page.setViewportSize({ width: 375, height: 667 })` (a typical mobile width, well under the grid's 720px `minWidth`).
2. Sign in; ensure a room exists; navigate to availability.
3. Assert the right-edge fade hint is visible, the left-edge one is not (starting scrolled fully left).
4. Scroll the grid container fully right (`element.evaluate(el => el.scrollLeft = el.scrollWidth)`).
5. Assert the left fade hint is now visible, the right one is not.
6. Read the room-name column's bounding-box x-position before and after scrolling.

**Assertions:**
- Step 3: right fade visible, left fade absent.
- Step 5: left fade visible, right fade absent.
- Step 6: room-name column's x-position is unchanged by the scroll (it's `position: sticky; left: 0`).

**Out of scope:** the equivalent "Add Meeting" button relocating to the page footer below `sm` (not part of this use case's own wording, though visible in the same viewport — see this catalog's Notes for a candidate future case if that's ever worth its own entry).

**Notes:** `Layout.tsx`'s own mobile app bar is unrelated chrome around this — make sure the viewport used is narrow enough to trigger the grid's own horizontal scroll (which depends on the 720px inner `minWidth` vs. the outer `Container maxWidth="md"`, not directly on MUI's own `xs`/`sm` breakpoints) rather than assuming a specific MUI breakpoint name is what matters here.

**2026-08-27 root cause: test bug, fixed.** Same `.MuiPaper-root` over-matching as E.31 (confirmed against a real run: `strict mode violation: locator('.MuiPaper-root') resolved to 3 elements` - the fixed mobile `AppBar`, the sidebar `Drawer`, and the grid, all Papers). Fixed by reusing the same `gridPaper(page)` helper introduced for E.31. Re-verified live and passing.

**2026-08-27, separate failure found later the same day: real product bug, fixed (root cause corrected below after a first fix attempt didn't actually work).** A different failure - `expect(fadeHint).toHaveCount(1)` got 0 - first appeared against an environment that had accumulated 36 rooms from every earlier spec in the same run, leading to an initial (wrong) theory that this was about that accumulated content or web-font load timing, fixed by swapping a one-shot `scrollWidth`/`clientWidth` measurement for a `ResizeObserver`. That fix was re-verified live and **still failed identically** - including in a small, freshly-created environment with only a handful of rooms, which disproved the "large accumulated content" theory outright.

The actual root cause: `RoomAvailabilityPage`'s grid only mounts once *both* `LIST_ROOMS` and `LIST_MEETINGS` have resolved (`showSpinner`), but the fade-hint effect was keyed off the `rooms` array specifically. `LIST_ROOMS` (`cache-first`) routinely settles before `LIST_MEETINGS` (`cache-and-network`) does, so `rooms` can stop changing *before* the grid actually mounts - the effect fires once while the grid's ref is still null (a no-op), and never fires again once the grid finally appears, since its own dependency never changes a second time. This reproduces on every load where rooms happen to resolve first, independent of room count or font timing - the 36-room run and the network conditions around it just happened to be where it was first noticed, not what caused it.

Fixed properly by switching `gridScrollRef`/`gridContentRef` from `useRef` to ref-callback state (`useState<HTMLDivElement | null>`, set via `ref={setGridScrollEl}`), and keying the `ResizeObserver` effect on that state instead of on `rooms`. A ref callback fires exactly when React mounts/unmounts the DOM node, decoupled from any query's loading state, so the observer always gets attached at the real mount, regardless of which query settles first. Re-verified live against a fresh environment - all of E.26-E37 pass, E.36 included, resolving well inside the timeout (8.5s) rather than timing out.

---

<a id="tc-e37"></a>
### E.37 — "Add Meeting" from this page pre-fills the currently viewed date

**Use case:** [use-cases.md#uc-37](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-37) — "'Add Meeting' button from this page pre-fills the currently viewed date."
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
