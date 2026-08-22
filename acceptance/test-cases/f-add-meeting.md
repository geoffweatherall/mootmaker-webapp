# F. Add Meeting

Use cases [mootmaker/use-cases.md § F](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#f-add-meeting).
See [README.md](README.md) for the entry format, test-data conventions, and the F.40 doc-drift note
(15-minute, not 5-minute, start-time default). **F.42 below documents a real, source-confirmed
implementation gap** found while writing this section — see its Notes.

Every case signs in as the demo user unless stated otherwise, and every case that touches
`RoomAvailabilityPage` (to confirm a meeting landed) needs `page.clock.setFixedTime` pinned inside
business hours (08:00–17:00), same reasoning as `add-meeting.spec.ts`.

---

<a id="tc-f38"></a>
### F.38 — Add a meeting with all required fields (happy path)

**Use case:** [use-cases.md#uc-38](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-38) — "Add a meeting with all required fields filled in correctly → success, navigates to a relevant view with a confirmation toast."
**Status:** ✅ Automated — [`tests/add-meeting.spec.ts`](../tests/add-meeting.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A uniquely-named room created as this test's own precondition (no seeding bypass exists — see README.md).

**Given** a signed-in user with a linked Person, a room, and the form's own sensible defaults for everything else
**When** they fill in only Subject and Room and submit
**Then** the meeting is created, the app navigates to that day's Room Availability for the meeting's room, a success toast appears, and the new meeting is visible on the grid

**Steps:** (already implemented — see the spec file for the exact selectors used)
1. Sign in as the demo user.
2. Create a uniquely-named room via Settings.
3. Pin the clock inside business hours.
4. Navigate to `/meetings/add`; fill **Subject**; select the room; leave everything else on its default; click **Save**.

**Assertions:**
- URL matches `/rooms/<date>/availability`.
- Toast text "Meeting was successfully scheduled." is visible.
- The subject is visible on the grid.

**Out of scope:** every other F case — this is deliberately the minimal happy path only.

**Notes:** None beyond what the spec file itself documents.

---

<a id="tc-f39"></a>
### F.39 — Organiser defaults to the signed-in user's own Person

**Use case:** [use-cases.md#uc-39](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-39) — "Organiser defaults to the signed-in user's own Person (when resolved and not already changed)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user (linked Person "Demo Strater").

**Given** a signed-in user with a resolved linked Person
**When** they open Add Meeting without touching the Organiser field
**Then** it already shows their own name

**Steps:**
1. Sign in as the demo user.
2. Navigate to `/meetings/add`.
3. Read the **Organiser** select's displayed value without interacting with it.

**Assertions:**
- Organiser field's text equals "Demo Strater".

**Out of scope:** the no-linked-Person case (leaves it blank — D.24); the organiser/attendee-pick race (documented as not automatable anywhere, see A.6's Notes); a user who has manually changed it (implicit in "not already changed" — not separately tested, since it's the *absence* of interaction that's the point here).

**Notes:** Cheapest possible version of this check — no submission needed, just reading the field's initial state.

---

<a id="tc-f40"></a>
### F.40 — Start/end time defaults

**Use case:** [use-cases.md#uc-40](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-40) — "Start time defaults to the next 5-minute boundary; end time defaults to an hour later, same calendar day."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Clock pinned to a known, non-boundary time.

**Given** the current time is `10:07:00`
**When** the user opens Add Meeting
**Then** Start time defaults to `10:15` (the next **15-minute** boundary — see this catalog's doc-drift note, not the 5-minute boundary `use-cases.md`'s current wording describes) and End time defaults to `11:15` (exactly one hour later, same day)

**Steps:**
1. Sign in as the demo user; `page.clock.setFixedTime(new Date('2026-08-24T10:07:00'))`.
2. Navigate to `/meetings/add`.
3. Read **Start time** and **End time** field values.

**Assertions:**
- Start time = `10:15`.
- End time = `11:15`.

**Out of scope:** the late-in-the-day clamping behaviour, where a default start close to midnight would otherwise push the default end past it (`defaultEndTime`'s same-day clamp to `23:55`) — worth its own dedicated case if this area ever gets more coverage, since it's a distinct code path from the ordinary case tested here.

**Notes:** **Write this test against the actual 15-minute default**, not the 5-minute figure in `use-cases.md`'s current wording — see [README.md](README.md)'s "Known doc/code drift" section. Whoever reviews this catalog should decide whether to fix `use-cases.md`'s wording (and `acceptance/README.md`'s) to say 15 minutes, or whether 15 minutes was itself an unintended change that should be reverted — either way, this test should reflect a deliberate decision, not silently encode whichever the code happens to do today.

---

<a id="tc-f41"></a>
### F.41 — Time pickers only offer 5-minute-boundary minutes

**Use case:** [use-cases.md#uc-41](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-41) — "Time pickers only offer 5-minute-boundary minutes."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** the Add Meeting form's Start/End time pickers
**When** the minute selection list is opened
**Then** only `:00, :05, :10, ... :55` are offered — never `:01`–`:04` etc.

**Steps:**
1. Sign in; navigate to `/meetings/add`.
2. Open the **Start time** picker's minute view (MUI X `TimePicker`, `timeSteps={{ minutes: 5 }}`).
3. Read all rendered minute option values.
4. Repeat for **End time**.

**Assertions:**
- Every rendered minute option is a multiple of 5.

**Out of scope:** the server-side `StartMissaligned`/`EndMissaligned` rule this UI restriction mirrors (not directly reachable through the picker, since it structurally can't select a non-boundary minute — see F.45's Notes for how a server-side rule gets tested when the UI itself can't produce the invalid input).

**Notes:** This duplicates `webapp/tests/meeting-form.spec.ts`'s existing mocked-layer coverage of the same picker prop — kept here anyway per this catalog's stated scope (no test-pyramid gatekeeping).

---

<a id="tc-f42"></a>
### F.42 — End time before or equal to start time

**Use case:** [use-cases.md#uc-42](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-42) — "Picking an end time before the start time / equal to it."
**Status:** ⬜ Planned — **likely to fail against current behaviour; see Notes**
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room.

**Given** a user who sets an end time earlier than (or equal to) the start time
**When** they submit
**Then** — per the use case's evident intent — the submission should be rejected with a validation error

**Steps:**
1. Sign in; create a room.
2. Navigate to `/meetings/add`; fill **Subject** and the room; set **Start time** to `14:00`, **End time** to `10:00` (before start), same date.
3. Click **Save**.
4. In a second sub-case, repeat with End time equal to Start time (`10:00`/`10:00`).

**Assertions (as the use case intends):**
- An error is shown; no meeting is created; the form does not navigate away.

**Out of scope:** N/A — this is a single, minimal case by design given the finding below.

**Notes:** **This is a confirmed, source-verified implementation gap, not a guess.** Neither
`AddMeetingPage.tsx` (no client-side start/end comparison) nor
`CreateMeetingHandler.java`/`MeetingError.java` (no `EndBeforeStart`-style enum value, and no
comparison of `startTime` vs. `endTime` anywhere in the handler) actually enforce this rule today.
`RoomAvailability.hasOverlappingMeeting`'s check (`startTime.isBefore(existingEnd) &&
endTime.isAfter(existingStart)`) doesn't independently guard against `endTime <= startTime` either
— against an otherwise-free room, a reversed or zero-length time range appears to be **accepted and
persisted**. Running this test as written is expected to **fail** (a meeting gets created instead
of rejected) until this is fixed on the API side — that failure is the point: it's evidence for a
real bug, surfaced by writing this catalog, not a flaw in the test. Recommend filing this as a
`mootmaker-api` issue (a new `EndBeforeStart` or similar `MeetingError` value) before or alongside
implementing this test, rather than adjusting the test's expectations to match the current gap.

---

<a id="tc-f43"></a>
### F.43 — Start/end time pair spanning midnight

**Use case:** [use-cases.md#uc-43](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-43) — "Picking a start/end time pair that would span midnight."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room.

**Given** a user picks a start time late in the day and an end time that would fall after midnight
**When** they submit
**Then** the server rejects it with `SpansMultipleDays`, shown as "A meeting cannot span midnight - start and end time must be on the same day."

**Steps:**
1. Sign in; create a room.
2. Navigate to `/meetings/add`; fill **Subject**, room; set **Date** to a fixed day; set **Start time** `23:45`, **End time** `00:15` — note the `AddMeetingPage` combines a single `date` value with each time-of-day (`combineDateAndTime`), so both times are combined against the *same* selected date, meaning the UI has no direct way to make `endTime`'s calendar date differ from `startTime`'s. This case must therefore construct its *conceptual* midnight-spanning attempt as **`startTime` after `endTime` on the same nominal date** (e.g. start `23:45`, end `00:15` both dated the same day, i.e. end < start) rather than genuinely two different calendar dates.
3. Click **Save**.

**Assertions:**
- `ErrorBanner` shows "A meeting cannot span midnight - start and end time must be on the same day."
- No meeting is created.

**Out of scope:** N/A.

**Notes:** Because the form always combines both times against one shared `date` value, this case is actually **the same submitted `startTime`/`endTime` shape as F.42's "end before start" scenario** (`endTime` earlier in the day than `startTime`) — the only difference is *which* server-side error is expected. Re-derive this against the real handler before finalising: `CreateMeetingHandler`'s `SpansMultipleDays` check compares `startTime.toLocalDate()` vs `endTime.toLocalDate()` directly from the two parsed date-times — since the webapp always sends both on the same calendar date string, this check can **never actually trigger from this form** the way this use case's wording implies (it would need `startTime`/`endTime` on genuinely different dates, which nothing in the UI can produce). If so, F.42 and F.43 collapse into the same request shape and the same (currently-missing) validation gap — worth confirming during implementation and, if confirmed, merging these two into one entry or explicitly noting F.43 as unreachable through this form as designed.

---

<a id="tc-f44"></a>
### F.44 — Organiser/Attendees mutual exclusivity

**Use case:** [use-cases.md#uc-44](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-44) — "Selecting someone as an attendee removes them from the Organiser dropdown, and vice versa; deselecting frees them up again."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user (admin). Two other people exist (create via Settings → People — "Alice", "Bob").

**Given** the Add Meeting form with at least two selectable people besides the current organiser
**When** the user picks Alice as an attendee, then picks Bob as organiser, then removes Alice as an attendee
**Then** at each step the Organiser/Attendees option lists update per the mutual-exclusivity rule

**Steps:**
1. Sign in as the demo user; create people "Alice" and "Bob" via Settings.
2. Navigate to `/meetings/add`.
3. Open **Attendees**; select "Alice"; close.
4. Open **Organiser**; assert "Alice" is NOT in the option list; select "Bob".
5. Open **Attendees**; assert "Bob" is NOT in the option list; assert "Alice" is still selected/present.
6. Deselect "Alice" from Attendees.
7. Open **Organiser**; assert "Alice" is available again as an option.

**Assertions:**
- Step 4: Alice absent from Organiser options.
- Step 5: Bob absent from Attendees options; Alice still checked.
- Step 7: Alice present again in Organiser options.

**Out of scope:** the organiser-default-vs-self-attendee race (not automatable, see F.39's Notes); submitting with an invalid combination (F.45 covers the one combination the UI is specifically supposed to prevent).

**Notes:** Duplicates `webapp/tests/organiser-attendee-exclusivity.spec.ts`'s mocked-layer coverage; kept per this catalog's no-test-pyramid-gatekeeping scope.

---

<a id="tc-f45"></a>
### F.45 — Organiser also picked as attendee: UI prevention + forced server-side rejection

**Use case:** [use-cases.md#uc-45](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-45) — "Attempting to submit with the organiser also picked as attendee (should be prevented by the UI, but confirm server-side rejection message if forced)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room. Ability to call the GraphQL API directly (bypassing the UI) for the "forced" half.

**Given (a)** the ordinary UI, which structurally can't let the same person be both organiser and attendee (F.44's filtering)
**Then (a)** there is nothing to click that would even attempt it — this half is a negative UI-shape assertion, not a submission

**Given (b)** a direct GraphQL `createMeeting` call (bypassing the UI) with `organiserId` duplicated into `attendeeIds`
**When (b)** it's sent with the signed-in user's real auth token
**Then (b)** the server rejects it with `OrganiserIsAttendee`

**Steps:**
1. **(a)** Sign in; navigate to `/meetings/add`; select someone as Organiser; open Attendees and confirm that same person is absent from the option list (re-confirms F.44's mechanism specifically in the organiser→attendee direction, as the concrete "prevented by the UI" proof).
2. **(b)** Using the signed-in session's captured auth token (or a fresh `createConfirmedTestAccount` + real sign-in to obtain one), issue a raw `createMeeting` mutation with `organiserId` also present in `attendeeIds`, via `page.request` or a direct `fetch` to `GRAPHQL_API_URL` with the `Authorization` header set.

**Assertions:**
- (a): the organiser, once picked, never appears in the Attendees option list.
- (b): the mutation response's `errors` array contains `"OrganiserIsAttendee"`; `meeting` is `null`.

**Out of scope:** the UI's own error-message mapping for this code (`MEETING_ERROR_MESSAGES.OrganiserIsAttendee`) — since the UI can't produce this state, that mapping is only reachable in principle, not through this app; not worth asserting the display text of a state the UI can't enter.

**Notes:** This is the one case in this section that legitimately needs to talk to the GraphQL API directly rather than only through the browser UI — matches the use case's own explicit "if forced" framing. Needs `GRAPHQL_API_URL` (already exported by `run.sh` via `authenticate.sh`) and a real bearer token, which `page.request` can reuse from the already-signed-in browser session's `localStorage`.

---

<a id="tc-f46"></a>
### F.46 — Blank subject rejected

**Use case:** [use-cases.md#uc-46](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-46) — "Leaving subject blank → validation error."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room.

**Given** a form filled in except Subject
**When** submitted
**Then** `SubjectRequired` is shown as "Please enter a subject."; no meeting is created

**Steps:**
1. Sign in; create a room.
2. Navigate to `/meetings/add`; select the room; leave Subject blank; click **Save**.

**Assertions:**
- `ErrorBanner` shows "Please enter a subject."
- URL is still `/meetings/add`.

**Out of scope:** N/A.

**Notes:** None.

---

<a id="tc-f47"></a>
### F.47 — Blank room rejected

**Use case:** [use-cases.md#uc-47](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-47) — "Leaving room unselected → validation error."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** a form filled in except Room
**When** submitted
**Then** `RoomRequired` is shown as "Please select a room."; no meeting is created

**Steps:**
1. Sign in; navigate to `/meetings/add`; fill Subject; leave Room unselected; click **Save**.

**Assertions:**
- `ErrorBanner` shows "Please select a room."

**Out of scope:** N/A.

**Notes:** None.

---

<a id="tc-f48"></a>
### F.48 — Blank organiser rejected

**Use case:** [use-cases.md#uc-48](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-48) — "Leaving organiser unselected (e.g. no linked Person and not manually chosen) → validation error."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the **e2e user** (no linked Person, so Organiser starts genuinely blank — see D.24). A room (create it as the demo user first, since the e2e user is a standard, non-admin account).

**Given** a signed-in user with no linked Person, on a form with everything else filled in
**When** they submit without picking an Organiser
**Then** `OrganiserRequired` is shown as "Please select an organiser."; no meeting is created

**Steps:**
1. Sign in as the demo user; create a room; sign out.
2. Sign in as the e2e user.
3. Navigate to `/meetings/add`; fill Subject; select the room; leave Organiser unselected; click **Save**.

**Assertions:**
- `ErrorBanner` shows "Please select an organiser."

**Out of scope:** N/A.

**Notes:** Deliberately uses the e2e user rather than the demo user, since the demo user's Organiser field is never blank to begin with (F.39) — this is the one case in the section that specifically needs the no-linked-Person account as its starting point, not just as an option.

---

<a id="tc-f49"></a>
### F.49 — Insufficient room capacity

**Use case:** [use-cases.md#uc-49](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-49) — "Selecting a room with capacity less than organiser+attendee count → `InsufficientCapacity` error."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room with capacity 2. Two other people (attendees).

**Given** a room that holds 2 and a meeting with 1 organiser + 2 attendees (3 distinct people)
**When** submitted
**Then** `InsufficientCapacity` is shown as "The room does not have enough capacity for all attendees."; no meeting is created

**Steps:**
1. Sign in; create a capacity-2 room; create two people ("Carol", "Dave").
2. Navigate to `/meetings/add`; fill Subject; select the room; leave Organiser on its default (the demo user); add both Carol and Dave as Attendees.
3. Click **Save**.

**Assertions:**
- `ErrorBanner` shows "The room does not have enough capacity for all attendees."

**Out of scope:** the exact deduplication-by-id counting rule (if the same person were somehow both organiser and attendee — already independently rejected by `OrganiserIsAttendee`, per `CreateMeetingHandler`'s own ordering, so it can't be isolated as a distinct capacity scenario through this UI).

**Notes:** None.

---

<a id="tc-f50"></a>
### F.50 — Overlapping time slot in the same room

**Use case:** [use-cases.md#uc-50](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-50) — "Selecting a room/time slot that overlaps an existing meeting in that room → `TimeRangeUnavailable` error."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room with an existing meeting 10:00–11:00.

**Given** a room already booked 10:00–11:00
**When** a second meeting is submitted for the same room at 10:30–11:30 (genuinely overlapping, not just touching — contrast with E.34's legal touching case)
**Then** `TimeRangeUnavailable` is shown as "The room already has a meeting scheduled during that time range."; no second meeting is created

**Steps:**
1. Sign in; create the room; create the first meeting 10:00–11:00.
2. Navigate to `/meetings/add`; fill Subject, select the same room, set Start `10:30`/End `11:30`, same date.
3. Click **Save**.

**Assertions:**
- `ErrorBanner` shows "The room already has a meeting scheduled during that time range."

**Out of scope:** the exact overlap boundary math (proven positively in E.34, and here only in the unambiguous-overlap direction — not re-deriving every boundary permutation).

**Notes:** None.

---

<a id="tc-f51"></a>
### F.51 — Multiple validation failures listed together

**Use case:** [use-cases.md#uc-51](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-51) — "Multiple validation failures at once → all errors listed together in one banner."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the **e2e user** (so Organiser starts blank without extra setup).

**Given** a form submitted with Subject, Room, and Organiser all left blank
**When** submitted
**Then** all three errors appear together in one banner, as a list (not just the first one found)

**Steps:**
1. Sign in as the e2e user.
2. Navigate to `/meetings/add`; leave Subject, Room, and Organiser all blank; click **Save**.

**Assertions:**
- `ErrorBanner` renders as a `<ul>` (per `ErrorBanner.tsx`'s multi-message branch) containing all three messages: "Please enter a subject.", "Please select a room.", "Please select an organiser."

**Out of scope:** every individual single-error case (F.46–F.48 already cover each alone).

**Notes:** This is the one place in the catalog that specifically needs the `<ul>`-vs-single-string branch in `ErrorBanner.tsx` exercised — pick at least 2 simultaneous failures deliberately, not accidentally only 1.

---

<a id="tc-f52"></a>
### F.52 — Suggest a room with none available

**Use case:** [use-cases.md#uc-52](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-52) — "'Suggest a room' with no rooms free → inline 'no room available' message, selection unchanged."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. One room, capacity 2, already fully booked for the exact time window this test will request (an existing meeting covering that whole window).

**Given** no room has both sufficient capacity and a free slot for the requested time
**When** "Suggest a room" is clicked
**Then** the inline message "No suitable room is available for that time - try adjusting the attendees or time." appears, and the Room field's selection is unchanged (still blank)

**Steps:**
1. Sign in; create the room; book it solid for a known window (e.g. 10:00–11:00) on a fixed date.
2. Navigate to `/meetings/add`; set Date/Start/End to that same fully-booked window; leave Room unselected.
3. Click **Suggest a room** (`getByRole('button', { name: 'Suggest a room' })`).

**Assertions:**
- The inline message text is visible in the banner.
- The Room field's value is still empty afterward.

**Out of scope:** the ranked-suggestion success path (F.53); cache invalidation (F.54).

**Notes:** `suggestRoom`'s own semantics (per the API README) treat a non-qualifying candidate the same as "none exist" — a single fully-booked room is enough to prove the empty-result path without needing an actually-empty room list.

---

<a id="tc-f53"></a>
### F.53 — Suggest a room: first press fills best fit, repeats cycle and wrap

**Use case:** [use-cases.md#uc-53](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-53) — "'Suggest a room' first press fetches and fills the best-fit (smallest surplus capacity) room; repeated presses cycle through the ranked list and wrap around without repeating early."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Three free rooms with capacities 2, 3, 4 (distinct names, e.g. "Suggest Room 2", "Suggest Room 3", "Suggest Room 4"), none booked at the test's chosen time.

**Given** three qualifying rooms of capacities 2/3/4, for a meeting that needs capacity 2 (organiser only, no attendees)
**When** "Suggest a room" is pressed four times in a row
**Then** the Room field cycles capacity-2 → capacity-3 → capacity-4 → capacity-2 (wrapping, not repeating early)

**Steps:**
1. Sign in; create the three rooms; ensure none is booked at the chosen time/date.
2. Navigate to `/meetings/add`; set Date/Start/End to a free window; leave Attendees empty (organiser alone needs capacity 1, but any of the three rooms qualifies — capacity 2 is deliberately the smallest to make it the unambiguous best fit).
3. Click **Suggest a room**; read the Room field.
4. Click it 3 more times, reading the Room field after each press.

**Assertions:**
- Press 1: Room = "Suggest Room 2" (smallest surplus).
- Press 2: Room = "Suggest Room 3".
- Press 3: Room = "Suggest Room 4".
- Press 4: Room = "Suggest Room 2" again (wrapped, not skipped or repeated early).

**Out of scope:** the empty-result case (F.52); cache invalidation on input change (F.54); tie-breaking by name for equal-capacity rooms (not exercised here — all three capacities are distinct).

**Notes:** Only the first press should trigger a network call (`suggestRoom` query) — the later three read from the client-side cache. Not directly observable through the UI alone; if this test is extended to assert *that* specifically, it would need to intercept/count the GraphQL request (Playwright's `page.route`/`page.on('request')`), which is a reasonable addition but not required for the ranked-order assertions above.

---

<a id="tc-f54"></a>
### F.54 — Changing inputs invalidates the cached suggestion

**Use case:** [use-cases.md#uc-54](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-54) — "Changing date/time/attendee count after suggesting a room invalidates the cached suggestion (next press re-fetches)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Two free rooms of different capacities (reuse F.53's fixtures, or a dedicated pair), where changing attendee count changes which room best-fits.

**Given** a suggestion already cached from a first press
**When** the attendee count is changed (e.g. one attendee added) and "Suggest a room" is pressed again
**Then** the new press reflects the new inputs (a fresh best-fit for the new required capacity), not the old cached list's next entry

**Steps:**
1. Sign in; ensure two rooms of capacities 2 and 3 exist and are free at the test's chosen date/time.
2. Navigate to `/meetings/add`; set a free date/time; press **Suggest a room** (expect the capacity-2 room, organiser-only requiring capacity 1).
3. Add one Attendee (now requiring capacity 2 — still fits the capacity-2 room, so pick an attendee count that pushes the requirement to 3, i.e. two attendees, forcing the capacity-3 room to become the new best fit).
4. Press **Suggest a room** again.

**Assertions:**
- After step 2: Room = the capacity-2 room.
- After step 4: Room = the capacity-3 room (not the capacity-2 room's "next in the old cached list" — proving the cache was actually invalidated and re-fetched, not just stepped).

**Out of scope:** invalidation triggered by changing Date/Start time/End time specifically (same `useEffect` dependency array as attendee count in `AddMeetingPage.tsx` — attendee-count is chosen here as the one representative trigger, per this catalog's "one case per use case" default).

**Notes:** The key discriminator vs. F.53 is that the *requirement* itself changes between presses, not just which press it is — an implementation that forgot to invalidate the cache would incorrectly keep offering the capacity-2 room (or the next item in the *stale* ranked list) instead of correctly re-ranking for the new requirement.

---

<a id="tc-f55"></a>
### F.55 — Cancel discards the form and returns to the previous page

**Use case:** [use-cases.md#uc-55](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-55) — "Cancel button discards the form and returns to the previous page."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** a user who navigated to Add Meeting from Room Availability and typed into the form
**When** they click **Cancel**
**Then** they return to Room Availability, and nothing was submitted

**Steps:**
1. Sign in; navigate to today's Room Availability.
2. Click **Add Meeting**.
3. Fill in Subject with some text (to prove it's genuinely discarded, not just "never submitted").
4. Click **Cancel** (`getByRole('button', { name: 'Cancel' })`).

**Assertions:**
- URL returns to the Room Availability page navigated from.
- The typed subject does not appear anywhere on the grid (nothing was created).

**Out of scope:** N/A.

**Notes:** `AddMeetingPage.tsx`'s Cancel handler is `navigate(-1)` — browser-history-based, so this test's assertion should be "back to wherever we came from," and the precondition should deliberately arrive via a real navigation (not `page.goto('/meetings/add')` directly, which would leave `history` with nowhere sensible to go back to).

---

<a id="tc-f56"></a>
### F.56 — Submit button disables and shows a spinner while in flight; no double submit

**Use case:** [use-cases.md#uc-56](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-56) — "Submit button is disabled and shows a spinner while the mutation is in flight; double-click doesn't double-submit."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room.

**Given** a valid, ready-to-submit form
**When** the Save button is double-clicked in quick succession
**Then** only one meeting is actually created, and the button visibly disables with a spinner during the request

**Steps:**
1. Sign in; create a uniquely-named room.
2. Navigate to `/meetings/add`; fill Subject (unique) and the room.
3. Fire two rapid clicks on **Save** (`.click({ clickCount: 2 })` or two sequential `.click()` calls with no intervening `await` on the mutation's completion).
4. After navigation completes, go to that day's Room Availability and count how many blocks match the unique subject.

**Assertions:**
- Exactly one meeting with the unique subject exists on the grid, not two.
- (Best-effort, timing-sensitive) a `CircularProgress` is observable inside the Save button immediately after the first click, before navigation completes.

**Out of scope:** N/A.

**Notes:** The "spinner visible" half is inherently a race against real network latency in a real deployed environment — treat it as a best-effort assertion (or omit it if it proves too flaky in practice) and lean on the "exactly one meeting created" assertion as the real, reliable proof this use case cares about, per `SubmitButton.tsx`'s `disabled={disabled || loading}` guard.

---

<a id="tc-f57"></a>
### F.57 — Mobile width: action buttons stack vertically

**Use case:** [use-cases.md#uc-57](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-57) — "On mobile width, the form's action buttons stack vertically instead of a cramped row."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** a narrow viewport
**When** the Add Meeting form is viewed
**Then** the Save/Cancel `Stack` renders in column direction (stacked), not row

**Steps:**
1. `page.setViewportSize({ width: 375, height: 667 })`.
2. Sign in; navigate to `/meetings/add`.
3. Read the computed CSS `flex-direction` of the `Stack` containing **Save** and **Cancel** (`getByRole('button', { name: 'Save' })`'s parent).

**Assertions:**
- Computed `flex-direction` is `column` at this viewport (matches `direction={{ xs: 'column', sm: 'row' }}`).
- At a wide viewport (e.g. 1280px), the same element's `flex-direction` is `row`.

**Out of scope:** every other responsive-layout detail on this page (the room/suggest-room row has its own `{ xs: 'column', sm: 'row' }` breakpoint too, but isn't part of this specific use case's wording).

**Notes:** Reading computed `flex-direction` via `getComputedStyle` is more robust than a screenshot comparison for this kind of layout assertion.

---

<a id="tc-f58"></a>
### F.58 — Error banner and submit-button red flash both appear on a rejected submission

**Use case:** [use-cases.md#uc-58](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-58) — "Error banner and submit-button red flash both appear on a rejected submission, especially noticeable when the banner is scrolled out of view on a long form."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** a form submitted with a validation error (e.g. blank Subject), with the page scrolled so the banner (which is `position: sticky`) is not in the initial viewport
**When** submission is rejected
**Then** the `ErrorBanner` becomes visible (sticky-scrolls into view) AND the Save button briefly flashes red (`SubmitButton`'s `hasError`-triggered `color: 'error'` + shake animation)

**Steps:**
1. Sign in; navigate to `/meetings/add`.
2. Scroll down so the Save button is in view but the top-of-form banner position is not (relevant mainly at viewports where the banner isn't already `top: 0` sticky — see `ErrorBanner.tsx`'s responsive `top` offset).
3. Leave Subject blank; click **Save**.
4. Immediately read the Save button's computed background colour / `class` for the error-flash state.

**Assertions:**
- `ErrorBanner` is visible (sticky positioning brought it into view, or it was already at the top).
- The Save button's colour transitions to MUI's `error` palette colour within the ~600ms flash window (`FLASH_DURATION_MS` in `SubmitButton.tsx`) — assert via computed `background-color` sampled shortly after the click, before the timeout clears it.

**Out of scope:** the exact shake-animation keyframes (a purely cosmetic CSS detail, not meaningfully assertable/valuable to pin down in a browser test).

**Notes:** Timing-sensitive (the flash is intentionally brief, `FLASH_DURATION_MS = 600`) — sample the button's style immediately after the click resolves, not after any additional `await` that could let the 600ms window lapse first.
