# C. Forgot password

Use cases [mootmaker/use-cases.md § C](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#c-forgot-password).
See [README.md](README.md) for the entry format and test-data conventions.

---

<a id="tc-c16"></a>
### C.16 — Reset password with a valid account and the real emailed code

**Use case:** [use-cases.md#uc-16](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-16) — "Request a reset code for a valid account → enter code + new password → signed in automatically with the new password."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** A confirmed account exists (`createConfirmedTestAccount`, which also sets `email_verified: true` — required, since the pool's `account_recovery_setting` is `verified_email`).

**Given** an account with a verified email
**When** the user requests a reset code, enters the real emailed code with a new password, and submits
**Then** the password is reset and they're signed in automatically with the *new* password

**Steps:**
1. `createConfirmedTestAccount(account)` with a fresh identity.
2. Navigate to `/forgot-password`.
3. Fill **Email** (`getByLabel('Email')`) with `account.email`; click **Send code** (`getByRole('button', { name: 'Send code' })`).
4. Assert the **Verification code** field is now visible.
5. `await waitForVerificationCode(account.email)`.
6. Fill **Verification code** and **New password** (`getByLabel('New password')`) with the code and a fresh policy-valid password.
7. Click **Reset password** (`getByRole('button', { name: 'Reset password' })`).

**Assertions:**
- `getByText('Sign out')` becomes visible (signed in automatically).
- Signing out and signing back in with the *old* password fails (proves the password actually changed, not just that the UI navigated away) — optional but recommended: sign out, go to `/signin`, attempt the old password, assert an error and that signing in with the *new* password from there succeeds instead.

**Out of scope:** an account with no verified email at all (not reachable through this app's own account-creation paths, which all verify the email); a wrong code (C.18); a too-weak new password (C.19).

**Notes:** None.

---

<a id="tc-c17"></a>
### C.17 — Requesting a reset code for an unknown email behaves identically to a known one

**Use case:** [use-cases.md#uc-17](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-17) — "Request a reset code for an email with no account behaves identically (no information leak about account existence)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** None beyond a known-existing account (the demo user, or a freshly created one) to compare against, and a fresh never-registered email.

**Given** an email address with no account at all
**When** a user requests a reset code for it
**Then** the UI behaves exactly as it would for a real account — advances to the code-entry step, shows no error revealing "no such account"

**Steps:**
1. Navigate to `/forgot-password`.
2. Fill **Email** with a fresh, never-registered `uniqueTestEmail()`.
3. Click **Send code**.
4. In the same test, repeat with a known account's email (e.g. the demo user's) for comparison.

**Assertions:**
- Both cases: the **Verification code** field becomes visible (advances to step 2) with no error shown.
- No message anywhere states or implies the first address has no account.

**Out of scope:** actually completing the reset for the unknown address (impossible — no code will ever arrive for it); the underlying Cognito `prevent_user_existence_errors` setting itself (see B.10's identical note).

**Notes:** Companion to B.10 for the same underlying Cognito setting, applied to the forgot-password flow instead of sign-in.

---

<a id="tc-c18"></a>
### C.18 — Wrong reset code is rejected

**Use case:** [use-cases.md#uc-18](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-18) — "Wrong reset code is rejected."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** A confirmed account exists (`createConfirmedTestAccount`).

**Given** a user on the reset step (code + new password) for a real account
**When** they submit an incorrect code with a policy-valid new password
**Then** the reset is rejected with an error, and the user is not signed in

**Steps:**
1. `createConfirmedTestAccount(account)`.
2. Navigate to `/forgot-password`; request a code for `account.email`.
3. Fill **Verification code** with an obviously-wrong value; fill **New password** with a valid new password.
4. Click **Reset password**.

**Assertions:**
- `ErrorBanner` shows a message (Cognito's `CodeMismatchException`).
- `getByText('Sign out')` is NOT visible.
- The account's password is unchanged (optional strengthening: sign in afterward with the *original* password and confirm it still works).

**Out of scope:** an expired code.

**Notes:** Unlike A.4, this test doesn't need to also fetch and use the *real* code afterward — "wrong code is rejected" is the whole of what this use case asks; C.16 already proves the real-code success path independently.

---

<a id="tc-c19"></a>
### C.19 — New password failing the strength rule is rejected

**Use case:** [use-cases.md#uc-19](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-19) — "New password failing the strength rule is rejected."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** A confirmed account exists (`createConfirmedTestAccount`).

**Given** a user on the reset step with the real emailed code in hand
**When** they submit that correct code together with a too-weak new password
**Then** the reset is rejected with an error, and the old password still works

**Steps:**
1. `createConfirmedTestAccount(account)`.
2. Navigate to `/forgot-password`; request a code; `await waitForVerificationCode(account.email)`.
3. Fill **Verification code** with the real code; fill **New password** with a policy-violating value (e.g. too short).
4. Click **Reset password**.

**Assertions:**
- `ErrorBanner` shows a message (Cognito's `InvalidPasswordException`).
- `getByText('Sign out')` is NOT visible.

**Out of scope:** exact policy-violation wording; reusing the same (now-consumed?) code afterward for a valid retry — Cognito's behaviour on a rejected-for-password-reasons code reuse isn't part of what this use case asks.

**Notes:** Needs the *real* code (unlike C.18) specifically so the only variable under test is password strength, not also an invalid code — otherwise a failure could be ambiguous about which rule actually rejected it.

---

<a id="tc-c20"></a>
### C.20 — Sign-in ↔ Forgot Password cross-links

**Use case:** [use-cases.md#uc-20](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-20) — "Sign-in form links to Forgot Password; Forgot Password flow links back to sign-in."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed out.

**Given** a signed-out visitor
**When** they follow the "Forgot password?" link from sign-in, then the "Sign in" link from forgot-password
**Then** each link lands on the expected page

**Steps:**
1. Navigate to `/signin`.
2. Click the **Forgot password?** link (`getByRole('link', { name: 'Forgot password?' })`).
3. Assert URL is `/forgot-password`.
4. Click the **Sign in** link (`getByRole('link', { name: 'Sign in' })`, within `ForgotPasswordPage`'s "Remembered it?" line).
5. Assert URL is `/signin`.

**Assertions:**
- Both navigations land on the correct URL with the correct page heading visible.

**Out of scope:** the sign-up page's own "Already have an account? Sign in" link (not part of this use case's wording, though structurally identical — arguably worth its own tiny case later if this area ever gets a broader link-audit pass).

**Notes:** Purely a navigation/routing check — no real Cognito interaction needed, cheapest test in this section.
