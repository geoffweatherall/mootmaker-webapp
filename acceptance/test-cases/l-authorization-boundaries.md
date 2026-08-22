# L. Authorization boundaries

Use cases [mootmaker/use-cases.md § L](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#l-authorization-boundaries).
See [README.md](README.md) for the entry format and test-data conventions. This section is
largely a cross-reference layer over cases already built in sections J/K/I — `use-cases.md` lists
these as their own items because they're the general *authorization-boundary* framing of
specific J/K/I mechanics, not because they need wholly separate test code.

---

<a id="tc-l89"></a>
### L.89 — Standard user cannot reach admin-only UI

**Use case:** [use-cases.md#uc-89](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-89) — "Standard user cannot reach admin-only UI (Rooms/People sections hidden) — a presentation-only check."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions/Steps/Assertions:** Identical to [J.77](j-settings-rooms.md#tc-j77) + [K.84](k-settings-people.md#tc-k84) combined (both sections hidden, checked in the same `/settings` visit as a standard user).

**Out of scope:** N/A.

**Notes:** This is the same test as J.77/K.84, generalised. Recommend implementing **one** spec that asserts both sections' absence in a single standard-user visit to `/settings`, and treating this entry, J.77, and K.84 as three `use-cases.md` numbers pointing at that one spec — not three separate test runs. This catalog still gives each its own entry/anchor so `use-cases.md`'s per-item back-links stay meaningful individually.

---

<a id="tc-l90"></a>
### L.90 — Standard user directly invoking an admin mutation is rejected

**Use case:** [use-cases.md#uc-90](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-90) — "Standard user directly invoking an admin mutation is rejected (belongs more in API-level testing, but worth a UI-adjacent smoke test)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** A confirmed standard test account, signed in (for its auth token).

**Given** a standard user's real auth token
**When** `createRoom`, `updateRoom`, and `createPerson` are each called directly (bypassing the UI)
**Then** all three are rejected server-side by `Identity.requireAdmin`

**Steps:** Same mechanism as [J.83](j-settings-rooms.md#tc-j83), extended to also call `createPerson` (also `requireAdmin`-gated per the API README, but not otherwise covered anywhere else in this catalog since `createPerson`'s own validation-focused cases, K.85/K.86, use the demo admin).

**Assertions:**
- All three mutation attempts return an authorization-rejection response, not a normal result payload.

**Out of scope:** `updatePerson`, which is deliberately **not** admin-only (`Identity.isAdmin` OR self — see L.91) — including it here would misrepresent it as symmetric with the other three when it isn't.

**Notes:** This use case explicitly frames itself as "belongs more in API-level testing" — `mootmaker-api/verify/` already covers this authoritatively; this entry exists per this catalog's no-gatekeeping scope, as a smoke-test-level duplicate one layer up. The one genuinely new thing this entry adds over J.83 alone is `createPerson`.

---

<a id="tc-l91"></a>
### L.91 — Self-rename works for a standard user; renaming someone else does not

**Use case:** [use-cases.md#uc-91](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-91) — "Self-rename works for a standard user; renaming someone else does not (UI shouldn't offer it, and server should reject if forced)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Two confirmed standard test accounts (`accountA`, `accountB`), each with its own linked Person.

**Given (a)** `accountA`, self-renaming via Settings
**Then (a)** it succeeds — already proven by [I.74](i-settings-your-name.md#tc-i74), which uses exactly this account shape

**Given (b)** `accountA`, looking for any UI path to rename `accountB`'s Person
**Then (b)** none exists — `accountA` has no People section at all (L.89/K.84), so there is structurally nothing to click

**Given (c)** a direct `updatePerson` mutation, using `accountA`'s real token, targeting `accountB`'s Person id
**When (c)** sent
**Then (c)** rejected server-side (`UpdatePersonHandler`'s `Identity.isAdmin` OR "target's `cognitoSub` matches caller's own `sub`" check fails both ways for this combination)

**Steps:**
1. **(a)**: reuse/reference I.74 rather than re-running it here.
2. **(b)**: sign in as `accountA`; navigate to `/settings`; confirm no People section is present (reuse K.84's assertion).
3. **(c)**: with `accountA` signed in (real token), issue a raw `updatePerson` mutation for `accountB`'s Person id with a new name.

**Assertions:**
- (c): the mutation is rejected (an authorization error, or `PersonError` — confirm the exact shape: `UpdatePersonHandler` uses the softer `isAdmin`-or-self check rather than `requireAdmin`, so its rejection path may differ in shape from the hard `requireAdmin` rejections in L.90 — verify which when implementing, since asserting the wrong shape would make this test pass for the wrong reason).
- `accountB`'s Person name is unchanged afterward.

**Out of scope:** N/A.

**Notes:** This is the one L case that needs genuinely new test code (parts (b)/(c)) rather than being a pure duplicate of an existing entry — part (a) is intentionally *not* re-implemented, only referenced, to avoid a third copy of I.74's exact steps.
