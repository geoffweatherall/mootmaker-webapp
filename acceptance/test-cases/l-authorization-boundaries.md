# L. Authorization boundaries

Use cases [mootmaker/use-cases.md § L](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#l-authorization-boundaries).
See [README.md](README.md) for the entry format and test-data conventions. This section is
largely a cross-reference layer over cases already built in sections P/Q/I — `use-cases.md` lists
these as their own items because they're the general *authorization-boundary* framing of
specific P/Q/I mechanics, not because they need wholly separate test code.

---

<a id="tc-l89"></a>
### L.89 — Standard user cannot reach admin-only UI

**Use case:** [use-cases.md#uc-89](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-89) — "Standard user cannot reach admin-only UI (Rooms/Persons pages) — a presentation-only check."
**Status:** ✅ Automated — [`tests/authorization-boundaries.spec.ts`](../tests/authorization-boundaries.spec.ts)
**Android:** not yet automated

**Preconditions/Steps/Assertions:** Identical to [P.124](p-rooms.md#tc-p124) + [Q.132](q-persons.md#tc-q132) combined — no "Rooms"/"Persons" nav link, and `/rooms`/`/persons` each redirect to `/`, checked in one standard-user session.

**Out of scope:** N/A.

**Notes:** This is the same test as P.124/Q.132, generalised — one spec asserts both pages' absence, and this entry, P.124, and Q.132 are three `use-cases.md` numbers pointing at that one spec, not three separate test runs. Previously this was framed around Settings' old admin *sections* (superseded J.77/K.84) — Rooms and Persons are now separate top-level pages, gated by `RequireAdmin`, not hidden sections of Settings.

---

<a id="tc-l90"></a>
### L.90 — Standard user directly invoking an admin mutation is rejected

**Use case:** [use-cases.md#uc-90](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-90) — "Standard user directly invoking an admin mutation is rejected (belongs more in API-level testing, but worth a UI-adjacent smoke test)."
**Status:** ✅ Automated — [`tests/authorization-boundaries.spec.ts`](../tests/authorization-boundaries.spec.ts)
**Android:** not yet automated

**Preconditions:** A confirmed standard test account, signed in (for its auth token). A real room and person fixture, created via the M2M admin-equivalent token.

**Given** a standard user's real auth token
**When** `createRoom`, `updateRoom`, `deleteRoom`, `createPerson`, `renamePerson`, `setPersonAdmin`, and `deletePerson` are each called directly (bypassing the UI)
**Then** all seven are rejected server-side by `Identity.requireAdmin`, and none of the targeted rooms/people were actually changed

**Steps:** One test, one standard account, all seven mutations attempted in sequence against real fixtures, then a spot-check query confirming nothing changed.

**Assertions:**
- Every attempt returns a top-level GraphQL `errors` array (not a structured `Result.errors` field) and no data for that mutation.
- The fixture room's name and the fixture person's name are unchanged afterward; neither was deleted.

**Out of scope:** `updateMyName`, which is deliberately **not** admin-only (self-only, no `id` argument at all — see L.91) — including it here would misrepresent it as symmetric with the other seven when it isn't.

**Notes:** This use case explicitly frames itself as "belongs more in API-level testing" — `mootmaker-api/verify/` already covers this authoritatively; this entry exists per this catalog's no-gatekeeping scope, as a smoke-test-level duplicate one layer up. Widened from three mutations (`createRoom`/`updateRoom`/`createPerson`) to all seven admin mutations this design adds, specifically so P/Q don't each need their own "forced direct call" case.

---

<a id="tc-l91"></a>
### L.91 — Self-rename works for a standard user; there is no way to rename someone else

**Use case:** [use-cases.md#uc-91](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-91) — "Self-rename works for a standard user; renaming someone else does not (UI shouldn't offer it, and server should reject if forced)."
**Status:** ✅ Automated — [`tests/authorization-boundaries.spec.ts`](../tests/authorization-boundaries.spec.ts) (parts (b)/(c); part (a) intentionally references [I.74](i-settings-your-name.md#tc-i74) rather than re-implementing it)
**Android:** not yet automated

**Preconditions:** Two confirmed standard test accounts (`accountA`, `accountB`), each with its own linked Person.

**Given (a)** `accountA`, self-renaming via Settings (which calls `updateMyName`)
**Then (a)** it succeeds — already proven by [I.74](i-settings-your-name.md#tc-i74), which uses exactly this account shape

**Given (b)** `accountA`, looking for any UI path to rename `accountB`'s Person
**Then (b)** none exists — `accountA` has no Persons page at all (L.89/Q.132), and even Settings' own "Your name" section calls `updateMyName`, which takes no `id` argument at all, so there is structurally nothing that could target anyone but the caller

**Given (c)** a direct `renamePerson` mutation, using `accountA`'s real token, targeting `accountB`'s Person id
**When (c)** sent
**Then (c)** rejected server-side — `renamePerson` is unconditionally `Identity.requireAdmin` now, the same rejection shape as every mutation in [L.90](#tc-l90)

**Steps:**
1. **(a)**: reuse/reference I.74 rather than re-running it here.
2. **(b)**: sign in as `accountA`; confirm no "Persons" nav link is present (reuse Q.132's assertion).
3. **(c)**: with `accountA` signed in (real token), issue a raw `renamePerson` mutation for `accountB`'s Person id with a new name.

**Assertions:**
- (c): the mutation is rejected with a top-level GraphQL `errors` array, no data for `renamePerson`.
- `accountB`'s Person name is unchanged afterward.

**Out of scope:** N/A.

**Notes:** Originally written against `updatePerson`'s merged "`isAdmin` OR self, fails both ways" check — that check no longer exists. `updatePerson` was split into `updateMyName` (self-only, no `id` argument, so it structurally cannot target anyone else — part (b) above) and `renamePerson` (unconditionally admin-only — part (c), now just another instance of L.90's rejection). This is the one L case that needed genuinely new test code (parts (b)/(c)) rather than being a pure duplicate of an existing entry — part (a) is intentionally *not* re-implemented, only referenced, to avoid a third copy of I.74's exact steps.
