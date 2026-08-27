# I. Settings — Your name (all users)

Use cases [mootmaker/use-cases.md § I](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#i-settings--your-name-all-users).
See [README.md](README.md) for the entry format and test-data conventions.

---

<a id="tc-i74"></a>
### I.74 — Update your own display name

**Use case:** [use-cases.md#uc-74](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-74) — "Update your own display name → saved, reflected immediately in the sidebar without a page refresh."
**Status:** ✅ Automated — [`tests/settings-your-name.spec.ts`](../tests/settings-your-name.spec.ts)
**Android:** not yet automated

**Preconditions:** A freshly signed-up account (`createConfirmedTestAccount`) — avoids permanently renaming the shared demo user's Person, which every other test in this catalog relies on reading as "Demo Strater."

**Given** a signed-in user with a linked Person
**When** they change their name in Settings and save
**Then** a success toast appears, the field keeps the new value, and the sidebar's own name display updates immediately — no reload

**Steps:**
1. `createConfirmedTestAccount(account)`; sign in.
2. Navigate to `/settings`.
3. Clear and refill **Name** (`getByLabel('Name')`) with a new value.
4. Click **Save** (within the "Your name" section).

**Assertions:**
- A success toast/message is visible ("Your name was updated.").
- The sidebar's account-name text (`AccountBox`) shows the new name, without any `page.reload()`.
- Navigating away and back to `/settings` still shows the new name (persisted, not just local state).

**Out of scope:** admin renaming *someone else* (K.87); a standard user attempting to rename someone else directly (L.91).

**Notes:** Deliberately avoids the demo user specifically so this test doesn't leave "Demo Strater" renamed for every other test that depends on that literal string (E.35, G.59, H.68, etc.) — a fresh account is cheap and self-contained here.

---

<a id="tc-i75"></a>
### I.75 — Blank name rejected

**Use case:** [use-cases.md#uc-75](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-75) — "Submit a blank name → validation error."
**Status:** ✅ Automated — [`tests/settings-your-name.spec.ts`](../tests/settings-your-name.spec.ts)
**Android:** not yet automated

**Preconditions:** A freshly signed-up account.

**Given** a signed-in user with a linked Person
**When** they clear the Name field entirely and save
**Then** `NameRequired` is shown as "Name must not be blank."; the stored name is unchanged

**Steps:**
1. `createConfirmedTestAccount(account)`; sign in.
2. Navigate to `/settings`; clear **Name** entirely; click **Save**.

**Assertions:**
- `ErrorBanner` shows "Name must not be blank."
- Reloading the page shows the *original* name still in the field (nothing was saved).

**Out of scope:** N/A.

**Notes:** None.

---

<a id="tc-i76"></a>
### I.76 — Section disabled with no linked Person

**Use case:** [use-cases.md#uc-76](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-76) — "Section disabled with an explanatory note for an account with no linked Person."
**Status:** ✅ Automated — [`tests/settings-your-name.spec.ts`](../tests/settings-your-name.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the e2e user (no linked Person).

**Given** a signed-in user with no linked Person
**When** they view Settings
**Then** the Name field and Save button are both disabled, and an explanatory note is shown

**Steps:**
1. Sign in as the e2e user.
2. Navigate to `/settings`.

**Assertions:**
- **Name** field has the disabled attribute.
- **Save** button (within this section) is disabled.
- The note "Your account has no linked person yet, so your name can't be changed here." is visible.

**Out of scope:** N/A.

**Notes:** None.
