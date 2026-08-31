# N. Settings — Date and time format (all users)

Use cases [mootmaker/use-cases.md § N](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#n-settings--date-and-time-format-all-users).
See [README.md](README.md) for the entry format and test-data conventions.

These preferences are **display-only**. The API always speaks ISO-8601 in both directions; a format
changes how this client writes date/times for its own viewer and how it parses what that viewer
types, and nothing else. Several cases below exist specifically to pin that boundary, so a future
change can't quietly turn the setting into a wire-format switch.

**Account policy for this whole section:** every case uses a freshly signed-up account
(`createConfirmedTestAccount`), never the shared demo user. Changing the demo user's format would
alter how *every other test in this suite* reads dates and times — the same hazard I.74 avoids for
renames, but far wider, since almost every spec asserts on a date or a time somewhere.

---

<a id="tc-n100"></a>
### N.100 — Change your date format

**Use case:** [use-cases.md#uc-100](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-100) — "Change your date format → every date shown to you switches to it, and the change persists across a reload."
**Status:** ✅ Automated — [`tests/settings-date-time-format.spec.ts`](../tests/settings-date-time-format.spec.ts)
**Android:** not yet automated

**Preconditions:** A freshly signed-up account, which starts at the defaults (`Iso` + `TwentyFourHour`).

**Given** a signed-in user whose date format is the default ISO
**When** they choose the British format and save
**Then** a meeting's date renders as `DD/MM/YYYY` wherever it's shown, and still does after a reload

**Steps:**
1. `createConfirmedTestAccount(account)`; sign in.
2. Create a meeting on a known date, so there is a date to read back.
3. Navigate to `/settings`, set **Date format** to the `24/08/2026`-style option, click **Save**.
4. Open that meeting's details page.
5. `page.reload()`.

**Assertions:**
- Meeting Details' "Date" row matches `\d{2}/\d{2}/\d{4}` and equals the expected `DD/MM/YYYY` string for the meeting's date — not the ISO one.
- The same holds after the reload (persisted server-side, not just local component state).

**Out of scope:** the time format (N.101); whether the API stored anything differently (N.103 covers that it did not).

---

<a id="tc-n101"></a>
### N.101 — Change your time format

**Use case:** [use-cases.md#uc-101](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-101) — "Change your time format → every time shown to you switches to it, and the change persists across a reload."
**Status:** ✅ Automated — [`tests/settings-date-time-format.spec.ts`](../tests/settings-date-time-format.spec.ts)
**Android:** not yet automated

**Preconditions:** A freshly signed-up account, at the defaults.

**Given** a signed-in user whose time format is the default 24-hour
**When** they choose AM/PM and save
**Then** a meeting's time range renders with an AM/PM marker, and still does after a reload

**Steps:**
1. `createConfirmedTestAccount(account)`; sign in.
2. Create a meeting at a known afternoon time (so AM/PM is unambiguous — a morning time would read the same in both formats apart from the marker).
3. Navigate to `/settings`, set **Time format** to the `02:30 PM`-style option, click **Save**.
4. Open that meeting's details page, then reload.

**Assertions:**
- The "Time" row contains `PM` and the 12-hour rendering of the meeting's start (e.g. `02:30 PM`), not `14:30`.
- Still true after the reload.

**Notes:** Uses an afternoon time deliberately. A 10:15 meeting renders `10:15` vs `10:15 AM`, which a substring assertion could pass on accidentally.

---

<a id="tc-n102"></a>
### N.102 — Both formats save together, with confirmation

**Use case:** [use-cases.md#uc-102](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-102) — "Both formats are saved together in one action, and a success message confirms it."
**Status:** ✅ Automated — [`tests/settings-date-time-format.spec.ts`](../tests/settings-date-time-format.spec.ts)
**Android:** not yet automated

**Preconditions:** A freshly signed-up account, at the defaults.

**Given** a signed-in user on the Settings page
**When** they change *both* fields and click Save once
**Then** a success message appears and both changes stick

**Steps:**
1. Sign in as a fresh account; go to `/settings`.
2. Change **Date format** and **Time format** in the same visit.
3. Click **Save** once.
4. Navigate away and back to `/settings`.

**Assertions:**
- The success message "Your date and time formats were updated." is visible.
- Both fields still show the chosen values after navigating away and back.

**Notes:** The mutation takes both formats as non-null and replaces the pair, so "save one, lose the other" is the specific regression this guards. One Save click, two changed fields.

---

<a id="tc-n103"></a>
### N.103 — Add Meeting accepts input in your own format, and stores the same instant

**Use case:** [use-cases.md#uc-103](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-103) — "The Add Meeting date/time fields accept input in your own chosen format, and a meeting created that way stores the same instant a default-format account would have stored."
**Status:** ✅ Automated — [`tests/settings-date-time-format.spec.ts`](../tests/settings-date-time-format.spec.ts)
**Android:** not yet automated

**Preconditions:** A freshly signed-up account, switched to `Usa` + `AmPm`.

**Given** a user whose format is USA + AM/PM
**When** they book a meeting by typing into the Add Meeting pickers in *that* format
**Then** the meeting is created, and a *different* account on the default format sees the very same instant, written ISO/24-hour

**Steps:**
1. Sign in as fresh account A; set format to `Usa` + `AmPm`.
2. Book a meeting at a known date and afternoon time, typing `MM/DD/YYYY` into the Date field (sections run Month, Day, Year for this setting) and a 12-hour time plus a `PM` keystroke into the time fields.
3. Assert the meeting was created and reads back correctly for A.
4. Sign in as a second, default-format account B (or the demo user, read-only) and open the same meeting.

**Assertions:**
- The meeting is created without validation errors — the picker parsed the typed value in the chosen format.
- For A, the details page shows the USA date and the AM/PM time.
- For B, the *same* meeting shows the ISO date and the 24-hour time, for the same instant.

**Notes:** This is the load-bearing case for the whole design. It proves the format is applied at the presentation edge only: the same stored instant, written two ways, for two viewers. It is also the only case exercising a format driving *input parsing* rather than display.

---

<a id="tc-n104"></a>
### N.104 — A shared view uses the viewer's format, not the author's

**Use case:** [use-cases.md#uc-104](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-104) — "A shared view renders in the *viewer's* own format, not the format chosen by whoever created the data."
**Status:** ✅ Automated — [`tests/settings-date-time-format.spec.ts`](../tests/settings-date-time-format.spec.ts)
**Android:** not yet automated

**Preconditions:** Two fresh accounts on deliberately different formats.

**Given** account A on `Usa` + `AmPm` has organised a meeting
**When** account B, on the default `Iso` + `TwentyFourHour`, views that same meeting
**Then** B sees it in *B's* format

**Assertions:**
- B's Meeting Details "Date" row is ISO and its "Time" row is 24-hour, for a meeting A created while on USA + AM/PM.
- A's own view of the same meeting is unchanged by anything B did.

**Notes:** Written as its own case, rather than folded into N.103, because it is the decision most likely to be reinvented differently on Android later — the design doc calls it out for exactly that reason. The alternative (render in the data owner's format) would make one meeting look different depending on who opened it.

---

<a id="tc-n105"></a>
### N.105 — Degraded state: an account with no linked Person

**Use case:** [use-cases.md#uc-105](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-105) — "An account with no linked Person sees the section disabled with an explanation, rather than a save that fails."
**Status:** ✅ Automated — [`tests/settings-date-time-format.spec.ts`](../tests/settings-date-time-format.spec.ts)
**Android:** not yet automated

**Preconditions:** The e2e user, which deliberately has no linked Person (the same account I.76 uses for the equivalent "Your name" case).

**Given** a signed-in account with no linked Person
**When** they open Settings
**Then** both format fields are disabled, with an explanation, and no save is offered that could fail

**Assertions:**
- Both selects are disabled.
- The explanatory note ("Your account has no linked person yet, so these can't be changed here.") is visible.
- Dates elsewhere still render in the default format rather than breaking — a missing preference must never mean a missing date.

**Notes:** Mirrors I.76's shape for the "Your name" section. The server-side `NoLinkedPerson` error exists as a backstop for a client that submits anyway; this case covers the UI making that unreachable in the first place.
