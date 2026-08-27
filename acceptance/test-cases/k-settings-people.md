# K. Settings — People (admin only)

Use cases [mootmaker/use-cases.md § K](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#k-settings--people-admin-only).
See [README.md](README.md) for the entry format and test-data conventions.

---

<a id="tc-k84"></a>
### K.84 — Standard user does not see the People section

**Use case:** [use-cases.md#uc-84](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-84) — "Standard user does not see the People section."
**Status:** ✅ Automated — [`tests/settings-people.spec.ts`](../tests/settings-people.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the e2e user.

**Given/When/Then/Steps/Assertions:** Identical in shape to [J.77](j-settings-rooms.md#tc-j77), substituting "People"/"Add person" for "Rooms"/"Add room".

**Out of scope:** N/A.

**Notes:** Same mechanism as J.77 (`isAdmin && <PeopleSection />`) — consider a single shared spec asserting both sections' absence together in one visit to `/settings` as a standard user, rather than two fully independent test runs, while still tracking both use-case numbers here for traceability.

---

<a id="tc-k85"></a>
### K.85 — Admin adds a guest person; usable as organiser/attendee/calendar subject

**Use case:** [use-cases.md#uc-85](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-85) — "Admin adds a new person (e.g. a guest with no login) → appears in People, selectable as organiser/attendee/calendar subject."
**Status:** ✅ Automated — [`tests/settings-people.spec.ts`](../tests/settings-people.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** an admin adding a guest Person (no Cognito account at all — this is the *only* way to create one, per this catalog's Test data conventions)
**When** they submit a valid name
**Then** the new Person appears in Settings' People list, and is immediately selectable as Organiser, as an Attendee, and as a Person-Calendar subject

**Steps:**
1. Sign in as the demo user; navigate to `/settings`.
2. Click **Add person**; fill **Name** (unique, e.g. "Guest Fixture"); click **Save**.
3. Assert the new person appears in the People list.
4. Navigate to `/meetings/add`; assert "Guest Fixture" is an option in both Organiser and Attendees.
5. Navigate to own Calendar; assert "Guest Fixture" is an option in the Person selector.

**Assertions:**
- All three selectability checks (step 4 ×2, step 5) pass with no reload between step 2 and any of them.

**Out of scope:** actually using them in a meeting (F.38 already proves the general Add Meeting submission path).

**Notes:** None.

---

<a id="tc-k86"></a>
### K.86 — Blank person name rejected

**Use case:** [use-cases.md#uc-86](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-86) — "Add a person with a blank name → validation error."
**Status:** ✅ Automated — [`tests/settings-people.spec.ts`](../tests/settings-people.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** the "Add person" dialog
**When** submitted with a blank Name
**Then** an error is shown; no person is created

**Steps:**
1. Sign in; open **Add person**; leave **Name** blank; click **Save**.

**Assertions:**
- `ErrorBanner` (within the dialog) shows "Name must not be blank." (`PERSON_ERROR_MESSAGES.NameRequired`).
- The dialog remains open.

**Out of scope:** N/A.

**Notes:** Unlike room/meeting creation, `createPerson` performs **no server-side validation at all** beyond the GraphQL schema's non-null `name` (per the API README's Validation section) — the blank-name check for *creation* specifically is enforced **client-side only**, in `SettingsPage.tsx`'s `PersonDialog.handleSubmit` (`if (!name.trim()) { setFieldErrors([PERSON_ERROR_MESSAGES.NameRequired]); return }`), not by a round trip to the server. This is a deliberate asymmetry worth confirming still holds when this test is implemented — if it's ever removed from the client without a matching server-side check added, this specific validation would silently stop working (an empty-string name could reach `createPerson`, which the schema alone doesn't forbid... unless GraphQL's `String!` non-null still rejects blank instead of only `null`, which the schema's `name: String!` doesn't currently distinguish either — worth a `mootmaker-api` follow-up question, not something this test alone can resolve).

---

<a id="tc-k87"></a>
### K.87 — Admin edits another person's name: propagates to calendar, meetings, and (if linked) Cognito

**Use case:** [use-cases.md#uc-87](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-87) — "Admin edits another person's name → reflected in their calendar, past/future meetings, and (if linked to a Cognito account) that account's next sign-in / display name."
**Status:** ✅ Automated — [`tests/settings-people.spec.ts`](../tests/settings-people.spec.ts)
**Android:** not yet automated

**Preconditions:** A confirmed standard test account (`createConfirmedTestAccount`) — Cognito-linked, so the "if linked" half is actually exercised, not skipped. A meeting involving that person.

**Given** a Cognito-linked Person, renamed by an admin
**When** the target account next signs in
**Then** their calendar/meetings show the new name everywhere, AND their own sidebar display name reflects it too — not just other people's view of them

**Steps:**
1. `createConfirmedTestAccount(account)` with an original name.
2. Sign in as the demo user; create a room; create a meeting where `account`'s Person is an attendee.
3. In Settings' People list, find `account`'s Person by its original name; edit it to a new name; save.
4. Sign out; sign in as `account`.
5. Assert the sidebar shows the *new* name.
6. Navigate to own Calendar / the meeting's Details page; assert the new name appears there too.

**Assertions:**
- Step 5: sidebar name = new name (Cognito's `name` attribute was updated server-side by `UpdatePersonHandler`, best-effort, and `AuthProvider`'s `myPerson` query is the ultimate source of truth regardless).
- Step 6: the meeting's Attendees row shows the new name.

**Out of scope:** N/A.

**Notes:** `UpdatePersonHandler`'s Cognito `name`-attribute sync is explicitly best-effort (logged and swallowed on failure) — this test's assertions rely on `myPerson` (the DynamoDB `Person.name`, the actual source of truth) rather than the Cognito JWT `name` claim directly, since the JWT claim could be briefly stale even on success (only updated on the *next* token refresh/sign-in) while `myPerson` is correct immediately. Signing out and back in (step 4) is what makes the JWT-claim path relevant at all; without it, this test would only be proving the DynamoDB-side update, which K.88 already covers more cheaply.

---

<a id="tc-k88"></a>
### K.88 — Admin renames a person with no Cognito account

**Use case:** [use-cases.md#uc-88](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-88) — "Admin renaming a person NOT linked to a Cognito account (no auth-side propagation needed)."
**Status:** ✅ Automated — [`tests/settings-people.spec.ts`](../tests/settings-people.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A guest Person with no Cognito account (K.85's kind of fixture), involved in a meeting.

**Given** a guest Person with no linked Cognito account
**When** the admin renames them
**Then** the rename succeeds and shows up everywhere the same way K.87 checks — there is simply no separate Cognito-account assertion to make, since none exists

**Steps:**
1. Sign in as the demo user; create a guest Person; create a meeting they're part of.
2. Rename the guest Person in Settings.
3. Assert the new name on the meeting's Details page and in Settings' own list.

**Assertions:**
- New name reflected in both places.
- No error, no unexpected Cognito-related side effect (nothing to assert here specifically — the *absence* of a sign-in/JWT dimension is the actual content of "not linked," not something to positively probe).

**Out of scope:** N/A.

**Notes:** This is the cheaper sibling of K.87 — same rename mechanism, minus the sign-out/sign-in round trip, precisely because there's no Cognito side to verify.
