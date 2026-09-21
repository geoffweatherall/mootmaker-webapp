# H. Meeting Details

Use cases [mootmaker/use-cases.md § H](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#h-meeting-details).
See [README.md](README.md) for the entry format and test-data conventions.

**2026-09-20: `/meetings/:id` is now a deep-link-only route.** Nothing in the app navigates there
any more - every meeting row opens the shared bottom-sheet/side-panel in place instead (see
[g-person-calendar.md#tc-g65](g-person-calendar.md#tc-g65)), and that panel's Share action is the
only way to reach this page from within the app. Every case below now reaches a meeting's id via
Share (`navigator.share` forced onto its clipboard-fallback branch deterministically, since a real
OS share sheet can't be driven by Playwright) rather than a navigated-to URL. See
`../../designs/meeting-detail-consolidation.md` in the hub repo.

---

<a id="tc-h68"></a>
### H.68 — View details of a meeting you organise

**Use case:** [use-cases.md#uc-68](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-68) — "View details of a meeting you organise."
**Status:** ✅ Automated — [`tests/meeting-details.spec.ts`](../tests/meeting-details.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room and a meeting organised by the demo user, with one attendee.

**Given** a meeting the signed-in user organises
**When** they view its Details page
**Then** every field (subject, room, organiser, attendees, date, time) is correct

**Steps:**
1. Sign in; create a room and an attendee Person; create a meeting with the demo user as organiser and that person as attendee.
2. Open the meeting's row (from Room Availability), click Share, read its real URL off the clipboard, and visit it.

**Assertions:**
- Subject heading matches.
- Room name visible (no capacity shown any more - `MeetingDetailContent` never showed it, and the full page now renders the same shared component - see 2026-09-20 update below).
- "Demo Strater" is shown in the row directly below the "Organiser" caption.
- The attendee's name is visible.
- Date/Time: see H.71 for the exact format assertions.

**Out of scope:** attending-not-organising (H.69); the Date/Time formatting detail itself (H.71, referenced not duplicated).

**Notes:** None.

**2026-09-20: room capacity no longer shown; organiser/attendee assertions no longer scoped by a "Room"/"Organiser"/"Attendees" DetailRow label.** The full page renders the same shared `MeetingDetailContent` the bottom-sheet/side-panel already used, which never showed capacity.

**2026-09-21: organiser row restyled to match the attendee rows (mootmaker-webapp#73).** The organiser's name is now plain text, identical in style to each attendee row, under its own "Organiser" caption (matching the "Attendees · N" caption above the attendee list) - no more bold name with an inline "· Organiser" suffix. If the organiser is the signed-in caller, their row shows "You" the same way their own attendee row would - but never an `AttendeeStatusBadge`, since the organiser's status is an implicit, never-stored "Going" (see `designs/attendee-response-status.md`) with no value to show a badge for.

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
2. Open the meeting's row, click Share, read its real URL off the clipboard, and visit it.

**Assertions:**
- "Organiser Person" is shown in the row directly below the "Organiser" caption.
- "Demo Strater" is visible (as an attendee).
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
**When** they visit its `/meetings/<id>` URL directly (via Share - see this file's header note)
**Then** it loads and shows full details anyway — `Query.meeting(id:)` has no per-caller filtering at the API level

**Steps:**
1. Sign in as the demo user; create two Persons ("Third Party A", "Third Party B") and a meeting between them (organiser A, attendee B) via the demo admin's own Add Meeting form (submitting on someone else's behalf).
2. Open the meeting's row, click Share, read its real URL off the clipboard, and visit it.

**Assertions:**
- Page loads successfully with the correct subject/organiser/attendee data — not an access-denied state.

**Out of scope:** whether this *should* be restricted (a product-policy question this test doesn't decide, matching G.60's same framing) — this documents actual, current, unrestricted behaviour.

**Notes:** The use case's own "(if reachable...)" phrasing already anticipates the answer might be "yes, and here's what happens" — confirmed: it's reachable via Share (though nothing in the app links to it for someone with no relationship to the meeting), and there is no access restriction on the read itself.

---

<a id="tc-h71"></a>
### H.71 — Date shown once; time shown as a start–end range

**Use case:** [use-cases.md#uc-71](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-71) — "Date shown once, time shown as a start–end range (not two full date-times)."
**Status:** ✅ Automated — [`tests/meeting-details.spec.ts`](../tests/meeting-details.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room and a meeting with a known date/start/end (e.g. `2026-08-24`, `10:00`–`11:00`).

**Given** a meeting with a known date and time range
**When** its Details page is viewed
**Then** the date appears once and the time appears once as `"10:00–11:00"` — never two separate full date-time strings

**Steps:**
1. Sign in; create the room and meeting.
2. Open the meeting's row, click Share, read its real URL off the clipboard, and visit it.
3. Read the date value's text.
4. Read the time value's text.

**Assertions:**
- The date value's text is exactly `"2026-08-24"` (`formatLocalDate` returns the raw `YYYY-MM-DD` slice — **not** a human-friendly format like "24 August 2026"; assert the literal value, don't assume prettified output).
- The time value's text is exactly `"10:00–11:00"` (en dash or hyphen — confirm the literal character `formatLocalTime`'s template string uses, `–`, when implementing).
- No other element on the page shows a full ISO date-time string (a regression check: the old two-full-date-times layout this replaced would fail this).

**Out of scope:** N/A.

**Notes:** `formatLocalDate` is a **raw string slice**, not a locale-aware formatter — this is easy to over-assert (expecting a "nice" date format) if the test author doesn't check the actual implementation first, which is exactly what this note is flagging.

**2026-09-20: the date/time values are no longer inside labelled "Date"/"Time" rows.** `MeetingDetailContent` (shared with the bottom-sheet/side-panel) renders them as plain, unlabelled lines - located by their own shape now, not by a preceding label.

---

<a id="tc-h72"></a>
### H.72 — Removed: "Back" returning to the previous page is no longer a reachable scenario

**Status:** ❌ Removed 2026-09-20, not superseded 1:1 — see `../../designs/meeting-detail-consolidation.md` in the hub repo.

This case originally covered `MeetingDetailsPage`'s "Back" button returning to whichever page (Room
Availability, Home) an in-app navigation had come from. Both of those entry points now open the
shared bottom-sheet/side-panel in place instead of navigating to `/meetings/:id` at all - there is
no longer any in-app-originated navigation into this route for "Back" to return from, so the
scenario this case tested no longer occurs.

"Back"'s actual safety property is now the opposite concern: it must **never** appear for a cold
link (see H.74 below), since an unconditional `navigate(-1)` there could leave the app entirely,
into whatever a tab's unrelated prior history happened to be. That's covered by H.74 (real,
end-to-end, this suite) and by a mocked-integration test in `webapp/tests/`
(`meeting-detail-share-and-back.spec.ts`, covering a tab with unrelated prior history, which isn't
practical to simulate against a real deployed environment).

If a future change reintroduces an in-app link into `/meetings/:id` (see `MeetingDetailsPage.tsx`'s
own comment on the `fromInApp` router-state mechanism that would gate it), a case like the original
H.72 would need to return.

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
- No unhandled error/blank page (no React error boundary triggered — check console/page errors are also clean in the test).

**Out of scope:** N/A.

**Notes:** None.

---

<a id="tc-h74"></a>
### H.74 — A signed-out visitor following a real shared link goes through a real sign-in and lands on the correct meeting

**Status:** ✅ Automated — [`tests/meeting-details.spec.ts`](../tests/meeting-details.spec.ts), new 2026-09-20 — see `../../designs/meeting-detail-consolidation.md` in the hub repo.

**Preconditions:** Signed in as the demo user (to create the meeting and its real Share link), then signed out.

**Given** a real meeting link, produced by the app's own Share button, and a visitor who is not signed in
**When** they follow that link
**Then** `RequireAuth` redirects them to `/signin`; a real sign-in returns them to the exact meeting the link named, with no "Back" button shown

**Steps:**
1. Sign in as the demo user; create a room and a meeting.
2. Open the meeting's row, click Share, and read its real URL off the clipboard.
3. Sign out.
4. Visit the Share-produced URL directly.
5. Assert the `/signin` redirect; sign in with the demo user's real credentials.

**Assertions:**
- After step 4: on `/signin`.
- After step 5: URL is the exact meeting URL from step 2; the meeting's subject heading is visible; no "Back" button is present (`MeetingDetailsPage.tsx`'s `fromInApp` router-state gate correctly does not fire for this cold-link journey).

**Out of scope:** simulating a tab with unrelated prior *other-site* history before the link is followed - not practical against a real deployment; covered instead by a mocked-integration test in `webapp/tests/meeting-detail-share-and-back.spec.ts`.

**Notes:** This is the acceptance-layer half of the unsafe-Back fix - it proves `RequireAuth`,
Cognito's hosted sign-in, and AppSync are correctly wired together end-to-end for a cold link, which
a mocked test cannot stand in for. See H.72's removal note above for the full picture.

---

<a id="tc-h108"></a>
### H.108 — Attendee status badges, "You", and a working self-response control

**Use case:** [use-cases.md#uc-108](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-108) — "Every non-organiser attendee shows their own Going/Not going/Maybe/No response status; the signed-in caller's own row shows 'You' instead, next to a self-only three-way control that sets their response and persists across a close/reopen. The organiser has no status control."
**Status:** ✅ Automated — [`tests/attendee-response-status.spec.ts`](../tests/attendee-response-status.spec.ts), new 2026-09-21 — see `../../designs/attendee-response-status.md` in the hub repo.
**Android:** not yet automated

**Preconditions:** Same setup as D.107 - a meeting with the demo user as an attendee, created via the API.

**Given** a meeting-detail sheet open for a meeting the signed-in caller attends
**When** they view their own attendee row and use the response control
**Then** their row shows "You" (not a status badge), a "Your response" control is present and shows their current status, and changing it persists - still correct after closing and reopening the sheet

**Steps:**
1. From D.107's setup, respond "Going" via the Home page's quick-respond button.
2. Open the meeting's detail sheet.
3. Assert the "Your response" control (`role=group`, accessible name "Your response") is visible and its "Going" button is pressed.

**Assertions:**
- The control's pressed button matches the status actually stored server-side (read back over the API in D.107's own test, shared with this one).

**Out of scope:** the organiser's own row (never shows a badge or a control - implicit Going, not exercised as a negative assertion here since it's structural: the organiser is never in `attendees` at all, see the API schema).

**Notes:** This is the meeting-detail half of the design; D.107 covers the Home-page half. Both are proven in one spec file since the same real meeting is used for both halves of the flow.
