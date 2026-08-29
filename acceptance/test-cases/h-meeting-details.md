# H. Meeting Details

Use cases [mootmaker/use-cases.md § H](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#h-meeting-details).
See [README.md](README.md) for the entry format and test-data conventions.

---

<a id="tc-h68"></a>
### H.68 — View details of a meeting you organise

**Use case:** [use-cases.md#uc-68](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-68) — "View details of a meeting you organise."
**Status:** ✅ Automated — [`tests/meeting-details.spec.ts`](../tests/meeting-details.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room and a meeting organised by the demo user, with one attendee.

**Given** a meeting the signed-in user organises
**When** they view its Details page
**Then** every field (subject, room + capacity, organiser, attendees, date, time) is correct

**Steps:**
1. Sign in; create a room and an attendee Person; create a meeting with the demo user as organiser and that person as attendee.
2. Navigate to `/meetings/<id>` directly (or via the grid).

**Assertions:**
- Subject heading matches.
- Room row: `"<name> (capacity <n>)"`.
- Organiser row: "Demo Strater".
- Attendees row: the attendee's name.
- Date/Time rows: see H.71 for the exact format assertions.

**Out of scope:** attending-not-organising (H.69); the Date/Time formatting detail itself (H.71, referenced not duplicated).

**Notes:** None.

---

<a id="tc-h69"></a>
### H.69 — View details of a meeting you attend but didn't organise

**Use case:** [use-cases.md#uc-69](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-69) — "View details of a meeting you attend but didn't organise."
**Status:** ✅ Automated — [`tests/meeting-details.spec.ts`](../tests/meeting-details.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user, but as the **attendee** this time. A room, another Person as organiser (created via Settings), the demo user added as an attendee.

**Given** a meeting the signed-in user attends but didn't organise
**When** they view its Details page
**Then** it loads and displays correctly, with the *other* person shown as Organiser and the signed-in user's own name among Attendees

**Steps:**
1. Sign in; create a room and a Person ("Organiser Person"); create a meeting with "Organiser Person" as organiser and the demo user's own personId as an attendee (requires knowing the demo user's personId — obtainable via the Settings "Your name" field's underlying data, or by first visiting Settings and reading the display name to select the matching Attendee option by name).
2. Navigate to `/meetings/<id>`.

**Assertions:**
- Organiser row: "Organiser Person".
- Attendees row includes "Demo Strater".
- Page loads with no access error (proving attendee-only access works, distinct from organiser access).

**Out of scope:** N/A.

**Notes:** This is also implicitly the proof that this page has **no access restriction based on organiser/attendee/neither** — see H.70, which pushes that even further.

---

<a id="tc-h70"></a>
### H.70 — View details of a meeting you're neither organiser nor attendee of

**Use case:** [use-cases.md#uc-70](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-70) — "View details of a meeting where you're neither organiser nor attendee (if reachable via a direct link/other calendar)."
**Status:** ✅ Automated — [`tests/meeting-details.spec.ts`](../tests/meeting-details.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A meeting organised by and attended only by *other* people (two Persons created via Settings, neither the demo user).

**Given** a meeting the signed-in user has no participant relationship to at all
**When** they navigate directly to its `/meetings/<id>` URL
**Then** it loads and shows full details anyway — per `ListMeetingsHandler`'s source, `Query.meetings` has no per-caller filtering at the API level (`MeetingDetailsPage` fetches the *entire* unfiltered `LIST_MEETINGS` and finds the matching id client-side)

**Steps:**
1. Sign in as the demo user; create two Persons ("Third Party A", "Third Party B") and a meeting between them (organiser A, attendee B) via the demo admin's own Add Meeting form (submitting on someone else's behalf).
2. Navigate directly to `/meetings/<that meeting's id>`.

**Assertions:**
- Page loads successfully with the correct subject/organiser/attendee data — not an access-denied state.

**Out of scope:** whether this *should* be restricted (a product-policy question this test doesn't decide, matching G.60's same framing) — this documents actual, current, unrestricted behaviour.

**Notes:** The use case's own "(if reachable...)" phrasing already anticipates the answer might be "yes, and here's what happens" — confirmed: it's reachable, and there is no restriction, since `MeetingDetailsPage.tsx` fetches all meetings via `LIST_MEETINGS` with no filter and finds the one matching `useParams().meetingId`.

---

<a id="tc-h71"></a>
### H.71 — Date shown once; time shown as a start–end range

**Use case:** [use-cases.md#uc-71](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-71) — "Date shown once, time shown as a start–end range (not two full date-times)."
**Status:** ✅ Automated — [`tests/meeting-details.spec.ts`](../tests/meeting-details.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room and a meeting with a known date/start/end (e.g. `2026-08-24`, `10:00`–`11:00`).

**Given** a meeting with a known date and time range
**When** its Details page is viewed
**Then** exactly one "Date" row shows the date once, and one "Time" row shows `"10:00–11:00"` — never two separate full date-time strings

**Steps:**
1. Sign in; create the room and meeting.
2. Navigate to `/meetings/<id>`.
3. Read the "Date" row's value text.
4. Read the "Time" row's value text.

**Assertions:**
- Date row text is exactly `"2026-08-24"` (`formatLocalDate` returns the raw `YYYY-MM-DD` slice — **not** a human-friendly format like "24 August 2026"; assert the literal value, don't assume prettified output).
- Time row text is exactly `"10:00–11:00"` (en dash or hyphen — confirm the literal character `formatLocalTime`'s template string uses, `–`, when implementing).
- No other element on the page shows a full ISO date-time string (a regression check: the old two-full-date-times layout this replaced would fail this).

**Out of scope:** N/A.

**Notes:** `formatLocalDate` is a **raw string slice**, not a locale-aware formatter — this is easy to over-assert (expecting a "nice" date format) if the test author doesn't check the actual implementation first, which is exactly what this note is flagging.

---

<a id="tc-h72"></a>
### H.72 — "Back" returns to the previous page

**Use case:** [use-cases.md#uc-72](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-72) — "'Back' button returns to the previous page (room availability / calendar / home, depending on entry point)."
**Status:** ✅ Automated — [`tests/meeting-details.spec.ts`](../tests/meeting-details.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room and a meeting, reachable from both Room Availability and Home's agenda list.

**Given** a user who navigated to Meeting Details from Room Availability, and separately from Home's "Today" agenda
**When** they click **Back**
**Then** each time, they land back on whichever page they actually came from

**Steps:**
1. Sign in; create the room and a meeting scheduled for today; pin the clock accordingly.
2. From Room Availability, click the meeting's block; on Details, click **Back** (`getByRole('button', { name: 'Back' })`); assert URL is Room Availability's.
3. From Home, click the same meeting's "Today" agenda row; on Details, click **Back**; assert URL is `/`.

**Assertions:**
- Both entry points return to their own origin page.

**Out of scope:** entry via Person Calendar specifically (structurally identical `navigate(-1)` mechanism to the two entry points already tested — not worth a third repetition).

**Notes:** `MeetingDetailsPage.tsx`'s Back handler is `navigate(-1)`, same browser-history mechanism as F.55's Cancel button — this test's two sub-cases exist specifically to prove that mechanism does the right thing from *multiple* distinct origins, which is the actual content of this use case's wording ("depending on entry point").

---

<a id="tc-h73"></a>
### H.73 — Navigating directly to a nonexistent meeting id

**Use case:** [use-cases.md#uc-73](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-73) — "Navigating directly to a nonexistent/invalid meeting id."
**Status:** ✅ Automated — [`tests/meeting-details.spec.ts`](../tests/meeting-details.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** a meeting id that doesn't correspond to any real meeting
**When** the user navigates to `/meetings/<bogus-id>`
**Then** the page shows "Meeting not found." rather than crashing or showing a blank/broken page

**Steps:**
1. Sign in.
2. Navigate to `/meetings/not-a-real-id-12345`.

**Assertions:**
- Text "Meeting not found." is visible.
- No unhandled error/blank page (no React error boundary triggered — check console/page errors are also clean in the test, since `MeetingDetailsPage.tsx`'s `!meeting` branch simply finds no match in the fetched list rather than erroring).

**Out of scope:** N/A.

**Notes:** Because `MeetingDetailsPage` fetches the *whole* meetings list and searches client-side (see H.70's Notes), any non-matching id — malformed or merely nonexistent — hits the exact same "not found" branch; no separate "invalid format" case is needed.
