# O. Edit and Cancel Meetings

Use cases [mootmaker/use-cases.md § O](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#o-edit-and-cancel-meetings).
See [README.md](README.md) for the entry format and test-data conventions, and
`../../designs/edit-and-cancel-meetings.md` in the hub repo for the full design behind this
feature. The two cross-client live-update cases this design also needed
(a response/edit/cancellation made elsewhere reflected on an already-open sheet) live in
[m-cross-cutting.md](m-cross-cutting.md) as M.112/M.113, alongside M.109-M.111's identical shape
for `respondToMeeting` - not duplicated here.

---

<a id="tc-o112"></a>
### O.112 — The organiser edits their own meeting

**Use case:** [use-cases.md#uc-112](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-112) — "The organiser edits their own meeting (subject, time, room, organiser, or attendees) → the change is saved and reflected wherever the meeting is shown."
**Status:** ✅ Automated — [`tests/edit-and-cancel-meetings.spec.ts`](../tests/edit-and-cancel-meetings.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room and a meeting organised by the demo user.

**Given** a meeting the signed-in user organises
**When** they open it, click Edit, change the subject, and save
**Then** the new subject is reflected on the grid and the meeting's own detail view

**Steps:**
1. Sign in as the demo user; create a room and a meeting organised by the demo user.
2. Open the meeting's detail sheet; click "Edit meeting"; change the subject; click Save.

**Assertions:**
- Navigates to `/rooms/<date>/availability` on success (same target `createMeeting` navigates to).
- The new subject is visible on the grid; the old one is not.

**Out of scope:** Every other field-level edit path (room/organiser/attendees/date) and the
self-overlap/Suggest-a-room case (O.113) — thoroughly covered already at the Integration layer
(`webapp/tests/meeting-edit-and-cancel.spec.ts`), which this entry deliberately doesn't duplicate
in full; this is the acceptance-layer smoke proof that the real deployed `updateMeeting` mutation
genuinely works end to end, not a re-run of every UI case against real infrastructure.

**Notes:** None.

---

<a id="tc-o113"></a>
### O.113 — Editing a meeting's time within its own room, overlapping its own prior slot, succeeds

**Use case:** [use-cases.md#uc-113](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-113) — "Editing a meeting's time within its own current room, to a new range that overlaps its own prior slot, succeeds — and 'Suggest a room' for that same new time offers the meeting's own current room, not a different one."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room and a meeting organised by the demo user.

**Given** a meeting in Room A from 10:00–11:00
**When** it's edited to 10:30–11:30, still Room A, and saved
**Then** the save succeeds (no `TimeRangeUnavailable`), and a subsequent "Suggest a room" press for
that same new time offers Room A as a candidate

**Out of scope:** N/A.

**Notes:** Already proven at the Integration layer against the mocked API
(`webapp/tests/meeting-edit-and-cancel.spec.ts`) and at the unit layer in `mootmaker-api`
(`RoomAvailabilityTest`, `MeetingValidatorTest`, `SuggestRoomHandlerTest` — the exact scenario that
motivated `RoomAvailability.isFreeIgnoring` actually being wired up). Planned here for the same
reason O.112 is automated: a thin acceptance-layer proof that the real deployed handlers agree,
not because there's any remaining doubt about the logic itself.

---

<a id="tc-o114"></a>
### O.114 — An admin edits a meeting they don't organise

**Use case:** [use-cases.md#uc-114](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-114) — "An admin edits a meeting they don't organise."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** A confirmed admin test account. A meeting organised by someone else.

**Given** an admin who is not the meeting's organiser
**When** they open its detail view and edit it
**Then** Edit is offered and the save succeeds

**Out of scope:** N/A.

**Notes:** Covered at the Integration layer already. Planned here as the acceptance-layer proof
that `Identity.isAdmin` genuinely grants this against the real API, not just the mock.

---

<a id="tc-o115"></a>
### O.115 — Someone who is neither organiser nor admin sees no Edit/Cancel controls

**Use case:** [use-cases.md#uc-115](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-115) — "A signed-in user who is neither the organiser nor an admin does not see Edit/Cancel controls on that meeting's detail view."
**Status:** ⬜ Planned
**Android:** not yet automated

**Notes:** Covered at the Integration layer already (`canEdit` gating, all three cases: organiser,
admin, neither). Planned here as the acceptance-layer confirmation against the real API's actual
`isAdmin` claim/organiser resolution, not the mock's.

---

<a id="tc-o116"></a>
### O.116 — A non-organiser, non-admin calling updateMeeting/cancelMeeting directly is rejected server-side

**Use case:** [use-cases.md#uc-116](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-116) — "A user who is neither organiser nor admin calling `updateMeeting`/`cancelMeeting` directly (bypassing the UI) is rejected server-side regardless of what the UI would show."
**Status:** ✅ Automated — [`tests/edit-and-cancel-meetings.spec.ts`](../tests/edit-and-cancel-meetings.spec.ts)
**Android:** not yet automated

**Preconditions:** A confirmed standard test account (organiser), a second fresh confirmed account
(the caller under test), a room.

**Given** a meeting organised by account A, and account B's real auth token (B is neither its
organiser nor admin)
**When** B calls `updateMeeting` and `cancelMeeting` directly against the real GraphQL endpoint
**Then** both are rejected with a top-level GraphQL error (`Identity`'s "Forbidden" exception,
surfaced the same way `L.90`'s `requireAdmin` rejections are, not a typed `errors` array entry),
and the meeting is unchanged afterward

**Steps:** Mirrors [L.90](l-authorization-boundaries.md#tc-l90)'s direct-mutation-call mechanism,
extended to `updateMeeting`/`cancelMeeting` instead of the admin-only mutations that entry covers.

**Assertions:**
- Both responses carry a top-level `errors` array, no data payload for the attempted mutation.
- Re-reading the meeting by id afterward shows it unchanged (still exists, original subject) —
  confirming the rejection wasn't just a response-shape artefact.

**Out of scope:** The UI-level "buttons are hidden" case (O.115) — that's presentation only; this
is the server-side enforcement the design's Decision 8 is actually about.

**Notes:** Unlike `L.90`'s `requireAdmin`-only handlers, `updateMeeting`/`cancelMeeting` use the
softer organiser-or-admin check (`UpdatePersonHandler`'s pattern) — this entry's fixture needs a
genuine third party (neither the organiser nor admin), not just any non-admin account.

---

<a id="tc-o117"></a>
### O.117 — The organiser cancels their own meeting

**Use case:** [use-cases.md#uc-117](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-117) — "The organiser cancels their own meeting: the confirmation step shows which meeting is about to be permanently deleted (not just that *a* meeting will be), and confirming removes it from every view."
**Status:** ⬜ Planned
**Android:** not yet automated

**Notes:** Covered thoroughly at the Integration layer (`webapp/tests/meeting-edit-and-cancel.spec.ts`),
including the specific "meeting's own details stay visible behind the dialog" assertion (Decision
5). Planned here as the acceptance-layer proof that a real `cancelMeeting` call genuinely removes
the meeting from the real deployed API, not just the mock.

---

<a id="tc-o118"></a>
### O.118 — An admin cancels a meeting they don't organise

**Use case:** [use-cases.md#uc-118](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-118) — "An admin cancels a meeting they don't organise."
**Status:** ⬜ Planned
**Android:** not yet automated

**Notes:** Same reasoning as O.114 — covered at the Integration layer, planned here as the
real-API confirmation.

---

<a id="tc-o119"></a>
### O.119 — Two admins cancelling the same meeting at once: the second gets a graceful error

**Use case:** [use-cases.md#uc-119](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-119) — "Two admins both try to cancel the same meeting at once — the second gets a graceful 'no longer exists' error, not a crash or a silent no-op."
**Status:** ✅ Automated — [`tests/edit-and-cancel-meetings.spec.ts`](../tests/edit-and-cancel-meetings.spec.ts)
**Android:** not yet automated

**Preconditions:** A confirmed admin test account, a room, a meeting.

**Given** a real meeting
**When** `cancelMeeting` is called for it twice, sequentially (the first commits before the second
starts — a genuine race under concurrent load is `mootmaker-api`'s own `DayRepositoryTest`'s
concern, covered there against a fake client; this proves the *outcome* against a real table, not
the retry mechanics)
**Then** the first call succeeds; the second returns `MeetingNotFound`, not a crash or a second
silent "success"

**Assertions:**
- First `cancelMeeting` response: `errors: []`.
- Second `cancelMeeting` response: `errors: ['MeetingNotFound']`.

**Out of scope:** The genuine concurrent-conflict retry path itself (`DayRepository`'s
version-conditional write, exercised against a real `ConditionalCheckFailedException` the way
[M.109](m-cross-cutting.md#tc-m109) proves for `respondToMeeting`'s own conflict) — not repeated
here; this entry is about the *outcome* of the meeting already being gone, not the storage-layer
mechanics of a true simultaneous write.

**Notes:** None.

---

<a id="tc-o120"></a>
### O.120 — Past and in-progress meetings can still be edited and cancelled

**Use case:** [use-cases.md#uc-120](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-120) — "A past (already-ended) meeting and a currently-in-progress meeting can both still be edited and cancelled by their organiser or an admin, the same as an upcoming one — no restriction based on timing."
**Status:** ⬜ Planned
**Android:** not yet automated

**Notes:** Covered at the `mootmaker-api` unit layer (`MeetingValidatorTest`'s day-state cases
apply regardless of the requested time's relationship to "now" — there is no such check anywhere
in the validator, by design, per Decision 12). Planned here as an end-to-end confirmation using a
real meeting whose time has already passed.

---

<a id="tc-o121"></a>
### O.121 — Editing a meeting's date to a different day moves it, without changing its identity

**Use case:** [use-cases.md#uc-121](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-121) — "Editing a meeting's date to a different day moves it there (it disappears from the original date's view and appears on the new one) without changing its identity."
**Status:** ✅ Automated — [`tests/edit-and-cancel-meetings.spec.ts`](../tests/edit-and-cancel-meetings.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room and a meeting organised by the demo user, on
a known bookable date.

**Given** a meeting on date A
**When** it's edited (via `updateMeeting`) to date B, same room and time-of-day
**Then** the meeting is gone from date A's day and present on date B's, `meeting(id:)` for its
original id resolves to date B, and a second edit of the same meeting immediately afterward still
succeeds

**Steps:**
1. Create a meeting on date A via the API.
2. Call `updateMeeting` with `startTime`/`endTime` on date B, same room, same id.
3. Query `workspace(dates: [A, B])` and `meeting(id:)`.
4. Call `updateMeeting` again (a trivial no-op change) to prove the meeting is still fully
   editable, not left in some half-migrated state.

**Assertions:**
- Date A's `Day.meetings` no longer includes this meeting's id.
- Date B's `Day.meetings` includes it, with the new subject if one was set.
- `meeting(id:)` for the original id returns a meeting on date B.
- The second `updateMeeting` call succeeds (`errors: []`).

**Out of scope:** N/A — this is specifically the case `DayRepository.moveMeeting`'s two-write,
pointer-repoint mechanism exists for (Decision 17), so it's exercised here against a real
DynamoDB table, not a fake one — `mootmaker-api`'s own `DayRepositoryTest`/`UpdateMeetingHandlerTest`
already cover the mechanism's retry/idempotency edges against a fake client.

**Notes:** None.

---
