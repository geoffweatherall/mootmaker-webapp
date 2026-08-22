# D. Home page

Use cases [mootmaker/use-cases.md § D](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#d-home-page).
See [README.md](README.md) for the entry format and test-data conventions.

---

<a id="tc-d21"></a>
### D.21 — Signed-out home page shows the sign-in form, demo credentials, and sign-up steps

**Use case:** [use-cases.md#uc-21](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-21) — "Signed out: shows sign-in form + demo credentials + sign-up steps."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed out.

**Given** a signed-out visitor
**When** they land on `/`
**Then** they see the embedded sign-in form pre-filled with the demo user's credentials shown in plain text, and the three-step "sign up for your own account" section

**Steps:**
1. Navigate to `/`.
2. Assert **Email**/**Password** fields are present and pre-filled with `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD`.
3. Assert the demo email/password are also shown as visible plain text elsewhere on the page.
4. Assert the "Or sign up for your own account" section is visible with its ordered list of three steps and a **Sign up** link/button.

**Assertions:**
- All of the above elements are present and visible on a single unauthenticated load.

**Out of scope:** actually using either the sign-in form (B.8/B.11) or the sign-up link (section A) — this case is purely "what's on the page."

**Notes:** Overlaps substantially with B.8/B.11's preconditions; kept separate since this use case is specifically about the page's *content*, not about completing a sign-in.

---

<a id="tc-d22"></a>
### D.22 — Signed in with a linked Person: entry points + Today/Tomorrow agenda

**Use case:** [use-cases.md#uc-22](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-22) — "Signed in with a linked Person: shows Calendar/Room availability/Add Meeting entry points plus 'Today' and 'Tomorrow' agenda lists, sorted by start time, each linking to its meeting's details."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Two meetings created for today (different start times, deliberately out of chronological order when created) and one for tomorrow, all organised by or attending the demo user, via the real Add Meeting form. A room must exist first.

**Given** a signed-in user with a linked Person and known meetings today and tomorrow
**When** they view the home page
**Then** the "Today" and "Tomorrow" lists show exactly those meetings, each sorted by start time, and each links through to its own Meeting Details page

**Steps:**
1. Sign in as the demo user; create a room.
2. Create three meetings via `/meetings/add`: two today at deliberately non-chronological creation order (e.g. create the 14:00 one before the 10:00 one) with distinct subjects, one tomorrow.
3. Pin the clock (`page.clock.setFixedTime`) to a fixed business-hours time on the test's "today" throughout, so "today"/"tomorrow" are unambiguous and meetings land inside the visible business-hours window.
4. Navigate to `/`.
5. Within the "Today" `AgendaList`, read the two meeting rows in DOM order.
6. Click the first "Today" row.

**Assertions:**
- **Calendar**, **Room availability today**, **Add Meeting** buttons/links are all present.
- "Today" list shows exactly the two today-meetings, in ascending start-time order (10:00 row before 14:00 row) regardless of creation order.
- "Tomorrow" list shows exactly the one tomorrow-meeting.
- Each row's secondary text shows the correct time range and room name.
- Clicking a row navigates to `/meetings/<id>` for that specific meeting (assert the details page shows the matching subject).

**Out of scope:** the empty-state variant (D.23); the no-linked-Person variant (D.24); meetings organised by *other* people that this user merely attends (implicitly exercised if such a fixture existed, but not specifically required here — this case only needs meetings visibly tied to the signed-in user).

**Notes:** Creating fixture meetings through the real UI (there's no seeding bypass) makes this one of the more expensive cases in the catalog — consider whether some of its sub-assertions (sort order specifically) might be cheaper and more deterministic at the mocked `webapp/tests/` layer, while this acceptance test keeps the "real data really shows up" proof. (Per this catalog's scope decision, both are written regardless of that overlap.)

---

<a id="tc-d23"></a>
### D.23 — No meetings today/tomorrow shows an empty state

**Use case:** [use-cases.md#uc-23](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-23) — "Signed in with a linked Person but no meetings today/tomorrow: empty state shown instead of an empty list."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** A freshly signed-up account (`createConfirmedTestAccount`) — guaranteed to have zero meetings, unlike the demo user whose meeting history depends on what else has run against the environment.

**Given** a signed-in user with a linked Person and no meetings today or tomorrow
**When** they view the home page
**Then** both "Today" and "Tomorrow" show the `EmptyState` component ("No meetings.", with its illustration), not an empty list with no explanation

**Steps:**
1. `createConfirmedTestAccount(account)`; sign in as that account.
2. Navigate to `/`.

**Assertions:**
- Both "Today" and "Tomorrow" panels show text "No meetings." and an `<img>` (the `empty-meetings.svg` illustration), not a bare empty `List`.

**Out of scope:** the populated case (D.22).

**Notes:** A freshly created account is the cleanest way to guarantee zero meetings without needing to first query/clear existing ones — much cheaper than D.22's fixture setup.

---

<a id="tc-d24"></a>
### D.24 — Signed in with no linked Person: degraded Home page

**Use case:** [use-cases.md#uc-24](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-24) — "Signed in with **no** linked Person (e.g. demo/e2e-style account): 'account hasn't been set up' message replaces Calendar/agenda; 'Room availability today' and 'Add Meeting' still work but Add Meeting has no organiser pre-filled."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the e2e user (`E2E_USER_EMAIL`/`E2E_USER_PASSWORD` — standard, no linked Person; see [README.md](README.md)'s account matrix).

**Given** a signed-in user whose account has no linked Person
**When** they view the home page and then use its "Add Meeting" entry point
**Then** the Calendar button and the Today/Tomorrow agenda are replaced by an "account hasn't been set up" error message; "Room availability today" and "Add Meeting" still work; the Add Meeting form's Organiser field is left blank rather than defaulted

**Steps:**
1. Sign in as the e2e user.
2. Navigate to `/`.
3. Assert the error `Alert` ("Your account hasn't been set up properly...") is visible in place of the agenda.
4. Assert **Room availability today** and **Add Meeting** buttons are both still present and enabled.
5. Click **Add Meeting**.
6. Assert the **Organiser** select shows no selection (placeholder/empty), not pre-filled.

**Assertions:**
- Error alert visible; no "Calendar" button, no "Today"/"Tomorrow" panels.
- `/meetings/add` reachable and its Organiser field is empty.
- Clicking **Room availability today** from home navigates successfully (see D.25 for the date-correctness detail).

**Out of scope:** actually submitting a meeting from this state (would need a manual Organiser pick — not what this use case is checking); the "Calendar" nav item's own disabled state in the sidebar (G.67 covers that specifically).

**Notes:** This is the entry point to the one **not automated, documented** race condition (organiser-default vs. self-attendee-pick) described in the main webapp README — that race needs a Person-linked account (like A.6/F.39 use), not this no-Person one, so it's out of scope here by construction, not by choice.

---

<a id="tc-d25"></a>
### D.25 — "Add Meeting" and "Room availability today" deep-link correctly

**Use case:** [use-cases.md#uc-25](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-25) — "'Add Meeting' and 'Room availability today' both correctly navigate/deep-link (today's date)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Clock pinned to a known date.

**Given** a signed-in user on the home page
**When** they click "Room availability today"
**Then** they land on `/rooms/<today's date, YYYY-MM-DD>/availability` — specifically *today's* date, not a placeholder or yesterday's

**Steps:**
1. Sign in as the demo user; `page.clock.setFixedTime(new Date('2026-08-24T10:00:00'))` (a known Monday, safely inside business hours).
2. Navigate to `/`.
3. Click **Room availability today**.
4. Assert URL.
5. Navigate back to `/`; click **Add Meeting**.
6. Assert URL is `/meetings/add`, and the form's **Date** field defaults to the same pinned date.

**Assertions:**
- Step 4: URL is exactly `/rooms/2026-08-24/availability`.
- Step 6: URL is `/meetings/add`; **Date** picker shows `24 Aug 2026`/`2026-08-24` (whatever `DatePicker`'s rendered format is — confirm against `MM/DD/YYYY`-vs-locale rendering when the test is implemented).

**Out of scope:** navigating from `RoomAvailabilityPage`'s own "Add Meeting" button (E.37 covers that, with the currently-viewed date instead of today's).

**Notes:** Pinning the clock is what makes "today's date" a checkable, non-flaky assertion instead of a moving target.
