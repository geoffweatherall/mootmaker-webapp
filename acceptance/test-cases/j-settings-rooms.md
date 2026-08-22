# J. Settings — Rooms (admin only)

Use cases [mootmaker/use-cases.md § J](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#j-settings--rooms-admin-only).
See [README.md](README.md) for the entry format and test-data conventions.

---

<a id="tc-j77"></a>
### J.77 — Standard user does not see the Rooms section

**Use case:** [use-cases.md#uc-77](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-77) — "Standard user does not see the Rooms section."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the e2e user (standard).

**Given** a signed-in standard user
**When** they view Settings
**Then** there is no "Rooms" heading or "Add room" button anywhere on the page

**Steps:**
1. Sign in as the e2e user.
2. Navigate to `/settings`.

**Assertions:**
- `getByRole('heading', { name: 'Rooms' })` has zero matches.
- `getByRole('button', { name: 'Add room' })` has zero matches.
- The "Your name" section is still present (proving the page rendered at all, not just that everything is hidden).

**Out of scope:** the equivalent check for the People section (K.84 — same mechanism, kept as its own case per this catalog's 1:1 default).

**Notes:** None.

---

<a id="tc-j78"></a>
### J.78 — Admin adds a room; it's immediately usable elsewhere

**Use case:** [use-cases.md#uc-78](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-78) — "Admin adds a new room with a valid name + capacity ≥ 2 → appears in the room list and is immediately selectable in Add Meeting / Room Availability."
**Status:** ⬜ Planned (this exact behaviour is already relied on as a *precondition* by the automated `add-meeting.spec.ts`, but not directly asserted as its own outcome anywhere yet)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** an admin adding a new room
**When** they submit a valid name and capacity 2
**Then** it appears in Settings' Rooms list, and is selectable in both the Add Meeting room dropdown and Room Availability's grid, with no manual refresh needed in between

**Steps:**
1. Sign in as the demo user; navigate to `/settings`.
2. Click **Add room**; fill **Name** (unique) and **Capacity** `2`; click **Save** (within the dialog).
3. Assert the new room appears in the Rooms list.
4. Without reloading, navigate to `/meetings/add`; open the Room dropdown.
5. Without reloading, navigate to today's Room Availability.

**Assertions:**
- Step 3: room row with the correct name/capacity is present.
- Step 4: the new room is an option in the Room `Select`.
- Step 5: the new room has its own lane in the grid.

**Out of scope:** the happy-path meeting creation itself (F.38, which already uses this exact mechanism as its own precondition).

**Notes:** `LIST_ROOMS` uses `cache-first` on `RoomAvailabilityPage`/`AddMeetingPage` but `cache-and-network` on `SettingsPage` — Apollo's `InMemoryCache` normalization is what makes the newly created room show up on the other two pages without an explicit refetch there; if this test ever fails specifically at steps 4/5 despite step 3 passing, that cache-normalization assumption is the first thing to check.

---

<a id="tc-j79"></a>
### J.79 — Blank room name rejected

**Use case:** [use-cases.md#uc-79](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-79) — "Add a room with a blank name → validation error."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** the "Add room" dialog
**When** submitted with a blank Name and a valid Capacity
**Then** `NameRequired` is shown as "Name must not be blank."; no room is created

**Steps:**
1. Sign in; open **Add room**; leave **Name** blank; fill **Capacity** `4`; click **Save**.

**Assertions:**
- `ErrorBanner` (within the dialog) shows "Name must not be blank."
- The dialog remains open (not dismissed on failure).

**Out of scope:** N/A.

**Notes:** None.

---

<a id="tc-j80"></a>
### J.80 — Capacity below 2 rejected

**Use case:** [use-cases.md#uc-80](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-80) — "Add a room with capacity 1 (or 0/negative) → `CapacityTooLow` error."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** the "Add room" dialog with a valid Name
**When** Capacity is `1`
**Then** `CapacityTooLow` is shown as "Room capacity must be at least 2."

**Steps:**
1. Sign in; open **Add room**; fill **Name** (unique); fill **Capacity** `1`; click **Save**.
2. Repeat with Capacity `0` in a second attempt (same test, reopening the dialog).

**Assertions:**
- Both attempts: `ErrorBanner` shows "Room capacity must be at least 2."

**Out of scope:** a genuinely negative capacity (e.g. `-1`) — the field is `type="number"` with `min: 0`; browser-level number-input behaviour around typing a leading minus with `min={0}` set is inconsistent enough across engines that it isn't a reliable, deterministic thing to script. `0` already exercises the same server-side rule via a value every browser will actually accept typing.

**Notes:** None.

---

<a id="tc-j81"></a>
### J.81 — Editing a room propagates everywhere it's referenced

**Use case:** [use-cases.md#uc-81](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-81) — "Edit an existing room's name/capacity → change reflected everywhere it's referenced (existing meetings, availability view) without a manual refresh."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room with an existing meeting booked into it.

**Given** a room already referenced by a meeting
**When** its name is changed in Settings
**Then** the new name shows up on that meeting's Details page and on Room Availability's grid, without reloading either

**Steps:**
1. Sign in; create a room (original name); create a meeting in it.
2. Navigate to `/settings`; click the room's edit icon (`getByLabel('Edit <original name>')`); change **Name**; click **Save**.
3. Without reloading, navigate to `/meetings/<id>`.
4. Without reloading, navigate to that day's Room Availability.

**Assertions:**
- Step 3: Room row shows the *new* name.
- Step 4: the grid's lane label shows the *new* name.

**Out of scope:** N/A.

**Notes:** Meetings aren't denormalised by room name (per the API README's "Storage" section) — this test is really proving that fact end-to-end through the UI, not just that Settings' own list updates.

---

<a id="tc-j82"></a>
### J.82 — Reducing capacity below an already-booked meeting is allowed

**Use case:** [use-cases.md#uc-82](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-82) — "Reduce a room's capacity below a meeting already booked into it → allowed (not retroactively validated)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room with capacity 4, and a meeting in it with 1 organiser + 2 attendees (3 distinct people, within the current capacity).

**Given** a room already booked with 3 people, capacity 4
**When** the admin edits the room's capacity down to 2 (below the 3 already booked)
**Then** the edit succeeds with no error — the past booking is left alone

**Steps:**
1. Sign in; create a capacity-4 room; create two extra people; create a meeting with the demo user as organiser + both as attendees.
2. Navigate to `/settings`; edit the room's Capacity to `2`; click **Save**.

**Assertions:**
- No error is shown; the dialog closes; the Rooms list shows capacity 2.
- The existing meeting's Details page is unaffected (still shows all 3 participants, no error, no retroactive rejection).

**Out of scope:** N/A.

**Notes:** This is the positive-confirmation counterpart to F.49 (a *new* meeting exceeding capacity is rejected) — this case exists specifically to prove that rule is **not** applied retroactively to already-existing bookings, per the API README's explicit callout.

---

<a id="tc-j83"></a>
### J.83 — Standard user calling `createRoom`/`updateRoom` directly is rejected server-side

**Use case:** [use-cases.md#uc-83](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-83) — "A standard user attempting the `updateRoom`/`createRoom` operations directly (bypassing the UI) is rejected server-side regardless of what the UI would show."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** A confirmed standard test account, signed in (for its auth token).

**Given** a standard user's real auth token
**When** a raw `createRoom` mutation is sent directly to the GraphQL endpoint with that token (bypassing the UI entirely, which wouldn't even show the option)
**Then** the server rejects it with an authorization error, not a normal `CreateRoomResult`

**Steps:**
1. `createConfirmedTestAccount(account)`; sign in as it to obtain a real id token from `localStorage`.
2. Issue a raw `createRoom` mutation via `page.request.post(GRAPHQL_API_URL, { headers: { Authorization: token }, data: {...} })` with a valid room name/capacity.
3. Repeat for `updateRoom` against any existing room id.

**Assertions:**
- Both responses are GraphQL errors (`Identity.requireAdmin`'s rejection — likely surfaced as an `errors` array at the top level of the GraphQL response, not the mutation's own `CreateRoomResult.errors` field — confirm the exact shape against a real response when implementing, since this is a different error channel than the structured validation results elsewhere in this API).
- No room was actually created (spot-check the Rooms list afterward as the demo user, if the response shape alone isn't conclusive).

**Out of scope:** the UI not showing the option at all (J.77 — this case is specifically the "if forced" server-side proof, matching F.45's identical framing for `OrganiserIsAttendee`).

**Notes:** This is a `mootmaker-api`-level authorization check (`Identity.requireAdmin`), already covered by that project's own `verify/` acceptance suite per its README — duplicated here at the UI-adjacent layer specifically because `use-cases.md` lists it as a webapp-relevant case too, matching this catalog's no-gatekeeping scope.
