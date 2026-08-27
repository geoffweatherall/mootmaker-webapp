# A. Sign up

Use cases [mootmaker/use-cases.md § A](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#a-sign-up).
See [README.md](README.md) for the entry format and test-data conventions referenced below (the
demo user, the e2e user, `freshTestAccount`/`waitForVerificationCode`, `createConfirmedTestAccount`).

All six cases exercise the **real** Cognito pool and (for 1, 3, 4, 5) the real SES→SNS→SQS email
pipeline — none of this section can be faked with the mocked-auth integration layer, since the
whole point is proving the real sign-up + email + PostConfirmation-trigger chain actually works.

---

<a id="tc-a1"></a>
### A.1 — Sign up with a valid name, email, and password

**Use case:** [use-cases.md#uc-1](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-1) — "Sign up with a valid name, email, and password → verification code step → correct code confirms and signs the user in automatically."
**Status:** ✅ Automated — [`tests/sign-up.spec.ts`](../tests/sign-up.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed out. A fresh, never-used email address (`support/email.ts`'s `uniqueTestEmail`).

**Given** a signed-out visitor on the sign-up page with a valid name, a fresh email, and a password meeting the strength rule
**When** they submit the details step, then enter the code emailed to that address and submit the confirm step
**Then** the account is confirmed and they're signed in automatically, landing back in the signed-in app shell

**Steps:**
1. Navigate to `/signup`.
2. Fill **Name** (`getByLabel('Name')`), **Email** (`getByLabel('Email')`), **Password** (`getByLabel('Password')`) with a fresh `freshTestAccount()`.
3. Click **Sign up** (`getByRole('button', { name: 'Sign up' })`).
4. Assert the **Verification code** field (`getByLabel('Verification code')`) is now visible (confirms the step transition, independent of email delivery timing).
5. `await waitForVerificationCode(account.email)`.
6. Fill **Verification code** with the real code.
7. Click **Confirm** (`getByRole('button', { name: 'Confirm' })`).

**Assertions:**
- `getByText('Sign out')` becomes visible (signed in automatically, no separate sign-in step).
- Not just "no error was thrown" — see A.5 for the linked-Person business effect this implies, verified there rather than duplicated here.

**Out of scope:** the linked-Person auto-creation and its name/class (A.5), immediately scheduling a meeting as the new user (A.6), a wrong code (A.4), a duplicate email (A.3), a too-weak password (A.2).

**Notes:** Every test in this section must call `uniqueTestEmail()` fresh — never reuse an address across tests/runs, or a slow/retried `waitForVerificationCode` poll could pick up a different test's code (see `support/email.ts`'s own doc comment).

---

<a id="tc-a2"></a>
### A.2 — Password below the minimum strength is rejected

**Use case:** [use-cases.md#uc-2](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-2) — "Password below the minimum (10 chars, needs a lowercase letter + a number) is rejected before submission."
**Status:** ✅ Automated — [`tests/sign-up.spec.ts`](../tests/sign-up.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed out. A fresh email address.

**Given** a signed-out visitor filling in the sign-up form with a password that doesn't meet Cognito's policy (e.g. `"short1"`, under 10 characters)
**When** they submit the details step
**Then** the account is not created, no verification-code step is reached, and an error is shown

**Steps:**
1. Navigate to `/signup`.
2. Fill **Name** and **Email** with a fresh identity; fill **Password** with a value that violates the policy (too short, e.g. 6 characters).
3. Click **Sign up**.

**Assertions:**
- An error message is visible (the `ErrorBanner`, populated from Cognito's own `InvalidPasswordException` message — content isn't this app's own copy, so assert on banner *presence*, not exact wording).
- The **Verification code** field is NOT shown (the confirm step was never reached).
- The URL is still `/signup`.

**Out of scope:** the exact wording of Cognito's password-policy error message (owned by Cognito, not this app); every other policy edge (missing digit, missing lowercase letter, exactly-10-chars boundary) — one representative under-length case is enough to prove the rejection path works, per this catalog's "one case per use case" default.

**Notes:** There is **no client-side length/character-class check** in `SignUpPage.tsx` — the password field's helper text is a hint only. "Rejected before submission" in the use case's wording means *before the account is actually created / before advancing to the code step*, not that the Sign up button is disabled client-side; this test asserts that reading. The real submission still goes to the real Cognito pool.

---

<a id="tc-a3"></a>
### A.3 — Signing up with an email that already has an account

**Use case:** [use-cases.md#uc-3](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-3) — "Signing up with an email that already has an account."
**Status:** ✅ Automated — [`tests/sign-up.spec.ts`](../tests/sign-up.spec.ts)
**Android:** not yet automated

**Preconditions:** A confirmed account already exists (create via `createConfirmedTestAccount` — no need for the real code path, since this test isn't the thing proving sign-up-with-a-code works).

**Given** an email address that already has a confirmed account
**When** a signed-out visitor tries to sign up again with that same email
**Then** the sign-up is rejected with an error, and no verification-code step is reached

**Steps:**
1. `createConfirmedTestAccount(existingAccount)` for a fresh `freshTestAccount()`-generated identity.
2. Navigate to `/signup`.
3. Fill **Name** (any value), **Email** with `existingAccount.email`, **Password** with a policy-valid password.
4. Click **Sign up**.

**Assertions:**
- An error message is visible in the `ErrorBanner` (Cognito's `UsernameExistsException`).
- The **Verification code** field is NOT shown.

**Out of scope:** whether the error message text leaks account existence (that's C.17's concern, for forgot-password — Cognito's sign-up flow is expected to say an account exists, unlike forgot-password's deliberately generic behaviour); signing in with the existing account afterward.

**Notes:** `createConfirmedTestAccount` triggers its own sign-up confirmation email as a side effect and drains it via `discardAnyPendingMessages` internally — no extra cleanup needed here since this test never calls `waitForVerificationCode` itself.

---

<a id="tc-a4"></a>
### A.4 — Wrong verification code is rejected; correct code afterward still succeeds

**Use case:** [use-cases.md#uc-4](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-4) — "Wrong verification code is rejected; correct code after a wrong attempt still succeeds."
**Status:** ✅ Automated — [`tests/sign-up.spec.ts`](../tests/sign-up.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed out. A fresh email address.

**Given** a signed-up-but-unconfirmed account on the verification-code step
**When** the user first enters an incorrect code, then enters the real emailed code
**Then** the first attempt is rejected with an error and the user stays on the code step; the second attempt confirms and signs them in

**Steps:**
1. Navigate to `/signup`; fill and submit the details step with a fresh `freshTestAccount()`.
2. `await waitForVerificationCode(account.email)` to obtain the real code (fetched now so it's in hand for step 5, but not used yet).
3. Fill **Verification code** with an obviously-wrong 6-digit value that isn't the real code (e.g. increment the last digit, wrapping if needed).
4. Click **Confirm**; assert an error is visible and the **Verification code** field is still present (still on the confirm step).
5. Clear the field, fill it with the real code from step 2, click **Confirm** again.

**Assertions:**
- After step 4: `ErrorBanner` shows a message (Cognito's `CodeMismatchException`); `getByText('Sign out')` is NOT visible.
- After step 5: `getByText('Sign out')` becomes visible.

**Out of scope:** an expired code (Cognito's code TTL isn't practical to wait out in a test); rate-limiting after repeated wrong attempts.

**Notes:** Fetch the real code *before* attempting the wrong one (step 2 before step 3), not after — `waitForVerificationCode`'s long-poll adds real latency, and doing it up front avoids stacking that wait after an already-rejected attempt.

---

<a id="tc-a5"></a>
### A.5 — Confirming sign-up auto-creates a linked Person with the entered name, `standard` class

**Use case:** [use-cases.md#uc-5](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-5) — "Newly confirmed account has a linked Person auto-created with the entered name (visible in sidebar/Settings), and is `standard` class (no admin sections in Settings)."
**Status:** ✅ Automated (partial — the linked-Person name check only) — [`tests/sign-up.spec.ts`](../tests/sign-up.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed out. A fresh email address.

**Given** a freshly confirmed sign-up
**When** the user lands in the signed-in app and visits Settings
**Then** the sidebar and the Settings "Your name" field both show the name entered at sign-up, and no admin-only sections (Rooms, People) are present

**Steps:**
1. Complete a real sign-up + confirmation (same as A.1) with a chosen `name`.
2. Assert the sidebar's account name text (`AccountBox`, the row showing the signed-in display name) reads `name` — this is the "visible in sidebar" half not currently asserted by the existing spec.
3. Navigate to `/settings`.
4. Assert the **Name** field (`getByLabel('Name')`) has value `name`.
5. Assert no heading reading "Rooms" or "People" is present on the page (`getByRole('heading', { name: 'Rooms' })` / `'People'` — both should have zero matches).

**Assertions:**
- Sidebar display name equals the entered name.
- Settings "Your name" field value equals the entered name.
- No "Rooms" or "People" `<h2>` sections are rendered.

**Out of scope:** the underlying `custom:class` Cognito attribute value directly (that's an infrastructure detail; its *effect* — no admin sections — is what's asserted); server-side rejection of an admin mutation attempted directly by a standard user (L.90).

**Notes:** The existing `sign-up.spec.ts` already asserts the Settings-page half of this (case "plus a touch of case 5" per its own comment); this entry additionally calls out the sidebar-visibility and no-admin-sections checks the use case's wording also promises, which aren't currently asserted anywhere. Extending the existing spec (rather than writing a wholly separate one) is the natural way to close that gap, since it's already mid-way through the same sign-up flow.

---

<a id="tc-a6"></a>
### A.6 — Can immediately schedule a meeting as themselves right after signing up

**Use case:** [use-cases.md#uc-6](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-6) — "Can immediately schedule a meeting as themselves right after signing up (organiser defaults to them)."
**Status:** ✅ Automated — [`tests/sign-up.spec.ts`](../tests/sign-up.spec.ts)
**Android:** not yet automated

**Preconditions:** A room must already exist (created by the demo user first, since a freshly signed-up standard user can't create one). A fresh email address for the sign-up itself.

**Given** a user who just confirmed their sign-up, with an existing room to book
**When** they go straight to Add Meeting without visiting Settings first
**Then** the Organiser field is already pre-filled with their own name, and submitting with just subject + room succeeds

**Steps:**
1. Sign in as the demo user; create a uniquely-named room via Settings → "Add room"; sign out.
2. Complete a real sign-up + confirmation (as in A.1) with a fresh `freshTestAccount()`.
3. Pin `page.clock.setFixedTime(...)` to a time safely inside business hours (08:00–17:00) before navigating to the form — see F.38's Notes for why.
4. Navigate to `/meetings/add`.
5. Assert the **Organiser** select (`getByRole('combobox', { name: 'Organiser' })`) already shows the signed-up account's own name, with no manual selection.
6. Fill **Subject**; select the room from step 1.
7. Click **Save**.

**Assertions:**
- Organiser field's displayed value equals the freshly-signed-up user's own name, before any interaction with that field.
- Submission succeeds: URL matches `/rooms/<date>/availability`, the success toast is visible, the meeting's subject is visible on the grid.
- On `MeetingDetailsPage` (or the grid tooltip), the Organiser is this user, not blank.

**Out of scope:** the documented race between the organiser-defaulting effect and picking yourself as an attendee before your own `personId` resolves — explicitly called out as not automated anywhere yet (see the main webapp README's "Organiser/attendee mutual exclusivity" section); this case only needs the ordinary (non-racing) default to have resolved by the time the form is submitted, which a real navigation after a completed sign-in reliably allows time for.

**Notes:** This is the one case in this section that also depends on F.38's/F.39's underlying mechanics (room creation as a precondition, organiser defaulting) — see [f-add-meeting.md](f-add-meeting.md) for those in isolation with the demo user instead.
