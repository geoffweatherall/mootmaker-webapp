# P. Rooms (admin only)

Use cases [mootmaker/use-cases.md § P](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#p-rooms-admin-only).
See [README.md](README.md) for the entry format and test-data conventions.

Supersedes section [J](j-settings-rooms.md) — Rooms moved out of Settings to its own top-level
`/rooms` page, reachable from a new "Admin" nav section, per
[the admin-rooms-and-people design doc](https://github.com/geoffweatherall/mootmaker/blob/main/designs/archive/admin-rooms-and-people.md).
Cases P.124–P.129 cover the same functional ground J.77–J.82 did, against the new page. J.83
("standard user forcing `createRoom`/`updateRoom` directly") is not repeated here — it's folded
into [L.90](l-authorization-boundaries.md#tc-l90), which now covers every admin mutation this way,
`deleteRoom` included, rather than each section re-proving the same rejection mechanism.

---

<a id="tc-p124"></a>
### P.124 — Standard user has no Rooms nav link and cannot reach the page directly

**Use case:** [use-cases.md#uc-124](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-124)
**Status:** ✅ Automated — [`tests/p-rooms.spec.ts`](../tests/p-rooms.spec.ts)
**Android:** not yet automated

**Given** a signed-in standard user
**When** they look at the sidebar, or navigate directly to `/rooms`
**Then** there is no "Rooms" nav link, and `/rooms` redirects to `/`

**Steps:**
1. Sign in as the e2e user.
2. Assert no "Rooms" link.
3. `page.goto('/rooms')`.

**Assertions:**
- `getByRole('link', { name: 'Rooms' })` has zero matches.
- After step 3, the URL is `/`.

**Out of scope:** the server-side rejection if the mutations are forced directly — that's [L.90](l-authorization-boundaries.md#tc-l90). This case is the presentation-only/client-routing half only, matching this catalog's established framing for this kind of case (see L.89's own notes).

**Notes:** The redirect is `RequireAdmin` (`webapp/src/components/RequireAdmin.tsx`) — a courtesy, not the real boundary.

---

<a id="tc-p125"></a>
### P.125 — Admin adds a room; it's immediately usable elsewhere

**Use case:** [use-cases.md#uc-125](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-125)
**Status:** ✅ Automated — [`tests/p-rooms.spec.ts`](../tests/p-rooms.spec.ts)
**Android:** not yet automated

Same mechanic as J.78, against `/rooms` instead of `/settings`: admin adds a room via the FAB, it
appears on the Rooms card grid, and is immediately selectable in Add Meeting and Room Availability
with no reload in between.

**Out of scope:** N/A. **Notes:** None.

---

<a id="tc-p126"></a>
### P.126 — Blank room name rejected

**Use case:** [use-cases.md#uc-126](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-126)
**Status:** ✅ Automated — [`tests/p-rooms.spec.ts`](../tests/p-rooms.spec.ts)
**Android:** not yet automated

Same as J.79: `NameRequired` → "Name must not be blank.", dialog stays open.

**Out of scope:** N/A. **Notes:** None.

---

<a id="tc-p127"></a>
### P.127 — Capacity below 2 rejected

**Use case:** [use-cases.md#uc-127](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-127)
**Status:** ✅ Automated — [`tests/p-rooms.spec.ts`](../tests/p-rooms.spec.ts)
**Android:** not yet automated

Same as J.80: `CapacityTooLow` → "Room capacity must be at least 2."

**Out of scope:** N/A. **Notes:** None.

---

<a id="tc-p128"></a>
### P.128 — Editing a room propagates everywhere it's referenced

**Use case:** [use-cases.md#uc-128](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-128)
**Status:** ✅ Automated — [`tests/p-rooms.spec.ts`](../tests/p-rooms.spec.ts)
**Android:** not yet automated

Same as J.81: a room's new name shows on an existing meeting's Details page and on Room
Availability, without reloading either.

**Out of scope:** N/A. **Notes:** None.

---

<a id="tc-p129"></a>
### P.129 — Reducing capacity below an already-booked meeting is allowed

**Use case:** [use-cases.md#uc-129](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-129)
**Status:** ✅ Automated — [`tests/p-rooms.spec.ts`](../tests/p-rooms.spec.ts)
**Android:** not yet automated

Same as J.82: capacity can be edited below an already-booked meeting's size — not retroactively
validated.

**Out of scope:** N/A. **Notes:** None.

---

<a id="tc-p130"></a>
### P.130 — Admin deletes a room with no upcoming meetings

**Use case:** [use-cases.md#uc-130](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-130) — "Admin deletes a room that has no meeting from today onward → removed from the Rooms list and no longer offered anywhere." **New in this design** — `deleteRoom` didn't exist before it.
**Status:** ✅ Automated — [`tests/p-rooms.spec.ts`](../tests/p-rooms.spec.ts)
**Android:** not yet automated

**Given** a room with no upcoming meetings
**When** an admin confirms its removal
**Then** it disappears from the Rooms grid and is no longer offered in Add Meeting

**Steps:**
1. Sign in as the demo admin; create a room.
2. Click its "Remove" icon; confirm in the dialog.
3. Check Add Meeting's Room dropdown.

**Assertions:**
- The room is gone from the grid.
- The room is not an option in Add Meeting.

**Out of scope:** N/A.

**Notes:** A genuine hard `DeleteItem`, not a soft delete — see the design doc's "Rollout &
migration" on why this is safe (`MeetingResponse.resolveRoom` already has a "Deleted room"
fallback for any past meeting referencing a since-deleted room).

---

<a id="tc-p131"></a>
### P.131 — Deleting a room with an upcoming meeting is rejected

**Use case:** [use-cases.md#uc-131](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-131) — "Admin attempts to delete a room with a meeting from today onward → rejected with a clear explanation, room not deleted." **New in this design.**
**Status:** ✅ Automated — [`tests/p-rooms.spec.ts`](../tests/p-rooms.spec.ts)
**Android:** not yet automated

**Given** a room with a meeting booked from today onward
**When** an admin attempts to remove it
**Then** the deletion is rejected with an explanation, and the room and its meeting are unaffected

**Steps:**
1. Sign in as the demo admin; create a room; book a meeting in it (today, via the pinned clock).
2. Click "Remove"; confirm.

**Assertions:**
- The dialog shows "This room has one or more meetings booked from today onward - reassign or cancel them before deleting it."
- After dismissing, the room is still present on the grid.

**Out of scope:** the specific case of a *past-only* meeting (which should NOT block deletion, per `RoomHasUpcomingMeetings`'s own definition) — not separately tested; the design doc's own reasoning for the cutoff is a Java-level concern (`UpcomingMeetings.isUpcoming`), already unit-tested in `mootmaker-api`.

**Notes:** Deliberately does not cascade (unlike `deletePerson`) — a room's upcoming meetings can
belong to many unrelated organisers, so this forces a deliberate "move these first" step. See the
design doc's own Trade-offs entry for the full reasoning.

---
