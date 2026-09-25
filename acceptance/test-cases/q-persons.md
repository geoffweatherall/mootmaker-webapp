# Q. Persons (admin only)

Use cases [mootmaker/use-cases.md § Q](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#q-persons-admin-only).
See [README.md](README.md) for the entry format and test-data conventions.

Supersedes section [K](k-settings-people.md) — People moved out of Settings to its own top-level
`/persons` page, per
[the admin-rooms-and-people design doc](https://github.com/geoffweatherall/mootmaker/blob/main/designs/admin-rooms-and-people.md),
which also adds admin badges/linked-email display, grant/revoke admin, and delete-with-cascade —
none of which existed before this design. K.84–K.88's own cases carry over as Q.132–Q.136; a
standard user forcing `renamePerson`/`setPersonAdmin`/`deletePerson` directly is folded into
[L.90](l-authorization-boundaries.md#tc-l90) rather than repeated per section.

---

<a id="tc-q132"></a>
### Q.132 — Standard user has no Persons nav link and cannot reach the page directly

**Use case:** [use-cases.md#uc-132](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-132)
**Status:** ✅ Automated — [`tests/q-persons.spec.ts`](../tests/q-persons.spec.ts)
**Android:** not yet automated

Same shape as P.124, for `/persons`.

**Out of scope:** the server-side rejection — [L.90](l-authorization-boundaries.md#tc-l90).
**Notes:** None.

---

<a id="tc-q133"></a>
### Q.133 — Admin adds a guest person; usable as organiser/attendee/calendar subject

**Use case:** [use-cases.md#uc-133](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-133)
**Status:** ✅ Automated — [`tests/q-persons.spec.ts`](../tests/q-persons.spec.ts)
**Android:** not yet automated

Same as K.85, against `/persons`.

**Out of scope:** N/A. **Notes:** None.

---

<a id="tc-q134"></a>
### Q.134 — Blank person name rejected

**Use case:** [use-cases.md#uc-134](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-134)
**Status:** ✅ Automated — [`tests/q-persons.spec.ts`](../tests/q-persons.spec.ts)
**Android:** not yet automated

Same as K.86.

**Out of scope:** N/A. **Notes:** None.

---

<a id="tc-q135"></a>
### Q.135 — Admin renames a Cognito-linked person; propagates to their own sidebar

**Use case:** [use-cases.md#uc-135](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-135)
**Status:** ✅ Automated — [`tests/q-persons.spec.ts`](../tests/q-persons.spec.ts)
**Android:** not yet automated

Same as K.87 (a real, Cognito-linked test account, renamed by the admin, sees the new name in
their own sidebar on next sign-in). **Reduced scope from K.87:** does not separately re-check a
meeting-details page for the propagated name (K.87 did) — the underlying "meetings aren't
denormalised by person name" fact is already proven for rooms by P.128, and for the Cognito-name
propagation specifically the sidebar check is the part unique to this case.

**Out of scope:** N/A. **Notes:** Trimmed relative to K.87 for time; worth restoring the
meeting-details check if this case is revisited.

---

<a id="tc-q136"></a>
### Q.136 — Admin renames a person with no Cognito account

**Use case:** [use-cases.md#uc-136](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-136)
**Status:** ✅ Automated — [`tests/q-persons.spec.ts`](../tests/q-persons.spec.ts)
**Android:** not yet automated

Same as K.88 (no auth-side propagation needed for a guest Person).

**Out of scope:** N/A. **Notes:** None.

---

<a id="tc-q137"></a>
### Q.137 — Cards show the admin badge and linked email(s); a guest shows "Not signed up yet"

**Use case:** [use-cases.md#uc-137](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-137) — "Persons with a linked Cognito account show its email address(es); an admin shows an Admin badge; a guest shows a 'not signed up' indicator." **New in this design** — this was the very first prototype requirement (`Person.linkedEmails`/`isAdmin` didn't exist before it).
**Status:** ✅ Automated — [`tests/q-persons.spec.ts`](../tests/q-persons.spec.ts)
**Android:** not yet automated

**Given** the Persons grid, with a Cognito-linked person, a guest, and the (admin) demo user all present
**Then** the linked person's card shows their email, the guest's card shows "Not signed up yet", and the demo user's card shows an "Admin" badge alongside their own email

**Steps:**
1. Sign in as the demo admin; create a real Cognito-linked test account and a guest person.
2. Navigate to `/persons`.

**Assertions:**
- The linked account's card shows its email.
- The guest's card shows "Not signed up yet".
- The demo user's card shows "Admin" and the demo email.

**Out of scope:** a person with more than one linked Cognito account (the schema supports
`linkedEmails: [String!]!` as a list, but nothing in this app's sign-up flow links a second
account to an existing Person today — see mootmaker-api#70, out of scope for this design).

**Notes:** None.

---

<a id="tc-q138"></a>
### Q.138 — Admin grants admin access to a person with a linked account

**Use case:** [use-cases.md#uc-138](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-138) — "Admin flips the Admin switch for a Cognito-linked person → they gain admin access, provably (their own next sign-in shows the admin nav)." **New in this design.**
**Status:** ✅ Automated — [`tests/q-persons.spec.ts`](../tests/q-persons.spec.ts)
**Android:** not yet automated

**Given** a real, Cognito-linked, non-admin person
**When** an admin enables their Admin switch and saves
**Then** their card shows the Admin badge, and their own next sign-in shows the Rooms/Persons nav (not just a DynamoDB-side badge — see the design doc's `cognitoSyncFailed` reasoning for why this distinction matters)

**Steps:**
1. Create a real confirmed test account.
2. Sign in as the demo admin; edit that person; enable Admin; save.
3. Sign out; sign back in as that account.

**Assertions:**
- Step 2: the switch is enabled (not disabled — contrast Q.139/Q.140) and the card shows "Admin" afterward.
- Step 3: "Rooms" and "Persons" nav links are now visible.

**Out of scope:** the `cognitoSyncFailed: true` retry/cancel path — there's no reliable way to
force a real Cognito failure against a real environment on demand. Fully covered at the Unit
(`SetPersonAdminHandlerTest`) and Integration (`persons-page.spec.ts`) layers instead, per the
design doc's own Testing impacts section.

**Notes:** None.

---

<a id="tc-q139"></a>
### Q.139 — Admin switch is disabled, with an explanation, for a person with no linked account

**Use case:** [use-cases.md#uc-139](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-139) — "Editing a guest Person's admin switch is disabled with inline copy explaining why, rather than allowing a flip that silently can't apply." **New in this design.**
**Status:** ✅ Automated — [`tests/q-persons.spec.ts`](../tests/q-persons.spec.ts)
**Android:** not yet automated

**Assertions:** the switch is disabled; inline copy names why ("hasn't signed in yet").

**Out of scope:** N/A. **Notes:** Enforced server-side too (`PersonError.NoLinkedAccount`) — this case is the webapp-side courtesy explanation; the guarantee itself is `SetPersonAdminHandlerTest`'s job.

---

<a id="tc-q140"></a>
### Q.140 — Admin switch is disabled for the signed-in admin's own person

**Use case:** [use-cases.md#uc-140](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-140) — "An admin editing their own Person sees the admin switch disabled, rather than being able to attempt (and have rejected) revoking their own access." **New in this design.**
**Status:** ✅ Automated — [`tests/q-persons.spec.ts`](../tests/q-persons.spec.ts)
**Android:** not yet automated

**Assertions:** the switch is disabled; inline copy names why.

**Out of scope:** N/A. **Notes:** Enforced server-side too (`PersonError.CannotRevokeOwnAdminAccess`) — same "courtesy vs. guarantee" split as Q.139.

---

<a id="tc-q141"></a>
### Q.141 — Admin deletes a person: organised meetings cancelled, attended-only meetings just lose them

**Use case:** [use-cases.md#uc-141](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-141) — "Admin deletes a Person → every upcoming meeting they organise is cancelled, they're removed from every upcoming meeting they only attend, past meetings are untouched." **New in this design** — `deletePerson` didn't exist before it.
**Status:** ✅ Automated — [`tests/q-persons.spec.ts`](../tests/q-persons.spec.ts)
**Android:** not yet automated

**Given** a person who organises one upcoming meeting and attends a second (organised by someone else)
**When** an admin deletes them
**Then** the meeting they organised is cancelled entirely; the meeting they only attended still exists, with them no longer listed

**Steps:**
1. Create the person, a room, and both meetings.
2. Delete the person from `/persons`.
3. Check Room Availability for the organised meeting (gone) and the attended one (still present, other attendee still listed).

**Assertions:**
- The organised meeting's subject no longer appears anywhere on that day's Room Availability.
- The attended-only meeting is still bookable/visible; the other attendee's name is still shown on it.

**Out of scope:** re-proving the full cascade mechanism from scratch — this is the same write
order/logic `deleteMyAccount` already proves for the caller's own account (see the design doc's
"this path is proven, not new"); this case exists to prove `deletePerson` correctly *invokes* it
admin-side, not to re-derive it. Verifying the deleted person's own Cognito account no longer
signs in is also not separately checked here (would need a second real account + sign-in attempt
for marginal additional confidence over what's already implied by a successful `AdminDeleteUser`
call, itself unit-tested in `DeletePersonHandlerTest`).

**Notes:** None.

---

<a id="tc-q142"></a>
### Q.142 — An admin cannot delete their own person this way

**Use case:** [use-cases.md#uc-142](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-142) — "An admin attempting to delete their own Person via the admin Persons page is rejected, with a pointer to Delete account in Settings instead." **New in this design.**
**Status:** ✅ Automated — [`tests/q-persons.spec.ts`](../tests/q-persons.spec.ts)
**Android:** not yet automated

**Assertions:** the deletion is rejected with copy pointing at "Delete account in Settings"; the admin's own card is unaffected.

**Out of scope:** the reserved-account guard (`PersonError.ReservedAccount`, protecting the
Terraform-managed demo Person specifically) — not exercised here, since deliberately attempting to
delete the one admin every fresh/shared environment is guaranteed to have is exactly the kind of
thing not worth risking against a real environment for a guard already unit-tested
(`DeletePersonHandlerTest`).

**Notes:** None.

---
