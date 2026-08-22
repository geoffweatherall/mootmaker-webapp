# B. Sign in / sign out

Use cases [mootmaker/use-cases.md § B](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#b-sign-in--sign-out).
See [README.md](README.md) for the entry format and test-data conventions.

---

<a id="tc-b7"></a>
### B.7 — Sign in with correct credentials from `/signin`

**Use case:** [use-cases.md#uc-7](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-7) — "Sign in with correct credentials from `/signin`."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed out. The demo user's credentials.

**Given** a signed-out visitor on `/signin`
**When** they enter the demo user's correct email and password and submit
**Then** they're signed in and land on the destination `RequireAuth` would otherwise have sent them from (here, straight back to `/` since they navigated to `/signin` directly, not via a redirect)

**Steps:**
1. Navigate to `/signin`.
2. Fill **Email** and **Password** (`getByLabel('Email')`, `getByLabel('Password')`) with `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD`.
3. Click **Sign in** (`getByRole('button', { name: 'Sign in' })`).

**Assertions:**
- `getByText('Sign out')` becomes visible.
- URL is `/` (no `from` state was set, since this wasn't reached via a `RequireAuth` redirect).

**Out of scope:** the redirect-back-to-original-destination behaviour (B.14); the embedded home-page form (B.8); the pre-filled demo credentials themselves (B.11).

**Notes:** None.

---

<a id="tc-b8"></a>
### B.8 — Sign in via the embedded form on the signed-out home page

**Use case:** [use-cases.md#uc-8](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-8) — "Sign in with correct credentials via the embedded form on the signed-out home page."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed out. The demo user's credentials.

**Given** a signed-out visitor on `/` (the marketing/landing content)
**When** they fill in and submit the `SignInForm` embedded on that page
**Then** they're signed in and the page swaps to the signed-in Home layout without a full navigation

**Steps:**
1. Navigate to `/`.
2. Within the "Try it now" `Paper` section, fill **Email**/**Password** with the demo user's credentials (there are two forms with `Email`/`Password` labels only if the sidebar has none — confirm this is the only match, or scope via the section's heading text `getByRole('heading', { name: 'Try it now — no account needed' })`'s container).
3. Click **Sign in**.

**Assertions:**
- `getByText('Sign out')` becomes visible.
- The signed-in Home content (e.g. `getByRole('button', { name: 'Add Meeting' })`) replaces the signed-out hero — same URL (`/`), a client-side content swap not a navigation.

**Out of scope:** the pre-filled demo credentials shown as plain text next to the form (B.11 covers reading and using them specifically); the sign-up steps section also on this page (covered by section A).

**Notes:** `SignInForm.tsx` calls `window.scrollTo({ top: 0 })` on success — irrelevant to an automated assertion, but explains why a human manually testing this might notice a scroll jump.

---

<a id="tc-b9"></a>
### B.9 — Wrong password shows an error, doesn't sign in

**Use case:** [use-cases.md#uc-9](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-9) — "Wrong password shows an error, doesn't sign in."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed out. The demo user's email (a known-valid account), an intentionally wrong password.

**Given** a signed-out visitor entering a valid email with an incorrect password
**When** they submit
**Then** an error is shown and they remain signed out

**Steps:**
1. Navigate to `/signin`.
2. Fill **Email** with `DEMO_USER_EMAIL`; fill **Password** with an obviously wrong value.
3. Click **Sign in**.

**Assertions:**
- `ErrorBanner` shows a message (Cognito's `NotAuthorizedException`).
- `getByText('Sign out')` is NOT visible.
- URL is still `/signin`.

**Out of scope:** the exact error wording (Cognito-owned copy); whether repeated failures trigger Cognito's own throttling (not exercised deliberately).

**Notes:** None.

---

<a id="tc-b10"></a>
### B.10 — Unknown email shows an error

**Use case:** [use-cases.md#uc-10](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-10) — "Unknown email shows an error (check whether it distinguishes 'no such user' — API's Cognito settings should behave consistently)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed out. An email address guaranteed to have no account (a fresh `uniqueTestEmail()`, unused).

**Given** a signed-out visitor entering an email with no account at all
**When** they submit sign-in with any password
**Then** an error is shown, and — per the "consistency" question this use case itself raises — it should read the same as B.9's wrong-password error, not reveal that the account doesn't exist

**Steps:**
1. Navigate to `/signin`.
2. Fill **Email** with a fresh, never-registered `uniqueTestEmail()`; fill **Password** with any value.
3. Click **Sign in**.
4. Capture the exact `ErrorBanner` text.
5. Repeat B.9 (wrong password, known-good email) in the same test and capture its `ErrorBanner` text.

**Assertions:**
- An error is shown; sign-in does not succeed.
- The two captured messages from steps 4 and 5 are identical — this is the actual thing this use case is checking for, not just "an error appears."

**Out of scope:** Cognito user-pool-level "prevent user existence errors" configuration itself (infrastructure, not UI) — this test only observes its effect at the UI layer.

**Notes:** If this test ever finds the two messages differ, that's a real finding worth raising against `mootmaker-api`'s Cognito pool settings (`prevent_user_existence_errors`), not a bug in this test.

---

<a id="tc-b11"></a>
### B.11 — Sign in via the demo user's pre-filled credentials shown on the home page

**Use case:** [use-cases.md#uc-11](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-11) — "Sign in via the demo user's pre-filled credentials shown on the home page."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed out.

**Given** a signed-out visitor on `/`, where the demo user's email/password are shown as plain text and the form is pre-filled with them
**When** they click **Sign in** without typing anything
**Then** they're signed in as the demo user with zero typing

**Steps:**
1. Navigate to `/`.
2. Assert the displayed plaintext email/password text matches `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD` (the values `deploy.sh` baked into the build).
3. Assert the **Email**/**Password** fields already contain those same values (pre-filled, not just displayed alongside).
4. Click **Sign in** without editing either field.

**Assertions:**
- `getByText('Sign out')` becomes visible.
- The signed-in sidebar/account name reflects "Demo Strater" (the demo Person's name).

**Out of scope:** the fallback "Sign in below, or create your own account" copy shown when the demo env vars aren't set (not reachable against a real deployed environment, which always sets them).

**Notes:** This is functionally a duplicate proof of B.8 using specifically the demo user; kept separate because the use case list treats "pre-filled, zero-typing" as its own distinct promise worth its own assertion (that the *displayed* credentials and the *pre-filled field values* actually match), not just that sign-in works.

---

<a id="tc-b12"></a>
### B.12 — Session persists across a page reload

**Use case:** [use-cases.md#uc-12](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-12) — "Session persists across a page reload (token cached/refreshed from `localStorage`)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** a signed-in user on any page
**When** the browser is hard-reloaded (`page.reload()`, a full document reload, not client-side navigation)
**Then** the session survives — the user is still shown as signed in, with no redirect to `/signin`

**Steps:**
1. Sign in as the demo user; navigate to `/settings` (an authenticated route, so the assertion below is meaningful).
2. `await page.reload()`.

**Assertions:**
- After reload, URL is still `/settings` (no redirect to `/signin`).
- `getByText('Sign out')` is visible.
- The Settings page's own content (e.g. the "Your name" field) loads correctly post-reload.

**Out of scope:** exact token-refresh timing/expiry mechanics (Cognito-internal); what happens across a reload with a genuinely expired refresh token (M.94's territory).

**Notes:** This is the only reliable way to prove `localStorage`-backed session persistence in a real browser — a client-side route change alone would trivially "persist" the in-memory auth state without proving anything about `localStorage` at all.

---

<a id="tc-b13"></a>
### B.13 — Sign out clears the session and locks the app down again

**Use case:** [use-cases.md#uc-13](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-13) — "Sign out clears the session and returns the user to a locked-down state (protected pages redirect to sign-in again)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** a signed-in user
**When** they click **Sign out** in the sidebar, then try to navigate to a protected route
**Then** they're signed out immediately, and the protected route now redirects to `/signin` instead of loading

**Steps:**
1. Sign in as the demo user.
2. Click **Sign out** (`getByRole('button', { name: 'Sign out' })` in `MenuContent`).
3. Assert `getByText('Sign out')` is no longer visible and `getByRole('button', { name: 'Sign in' })` is visible instead.
4. Navigate directly to `/settings` (`page.goto`, a fresh navigation, not relying on cached client state).

**Assertions:**
- After step 3: signed-out nav state is showing.
- After step 4: URL redirects to `/signin`.

**Out of scope:** whether a reload after sign-out also stays signed out (implied by B.12's mechanism working correctly in reverse, not separately asserted here).

**Notes:** `MenuContent.handleSignOut` also navigates to `/`, so step 3's assertion should happen either right after the click (before that navigation completes) is fine too — the sidebar's signed-out state is present on every route.

---

<a id="tc-b14"></a>
### B.14 — Protected route redirects to sign-in and returns you after signing in

**Use case:** [use-cases.md#uc-14](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-14) — "Visiting a protected route while signed out redirects to `/signin`, and signing in returns you to that original destination."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed out.

**Given** a signed-out visitor
**When** they navigate directly to a protected route (e.g. `/settings`)
**Then** they land on `/signin` instead; after signing in successfully, they're taken to `/settings`, not `/`

**Steps:**
1. Navigate directly to `/settings` while signed out.
2. Assert URL is `/signin`.
3. Fill and submit the demo user's credentials.

**Assertions:**
- After step 1: URL is `/signin` (redirected by `RequireAuth`).
- After step 3: URL is `/settings` (the original destination — `RequireAuth`'s `state={{ from: location.pathname }}`, read by `SignInPage`'s `from`), not `/`.

**Out of scope:** which specific protected route is used (any of `/settings`, `/meetings/add`, `/rooms/:date/availability`, `/persons/:personId/calendar` would exercise the same `RequireAuth` mechanism identically — `/settings` is picked because it needs no path parameters).

**Notes:** None.

---

<a id="tc-b15"></a>
### B.15 — Public pages work while signed out, with no redirect

**Use case:** [use-cases.md#uc-15](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-15) — "Visiting the public pages (`/`, `/signin`, `/signup`, `/forgot-password`, `/about`) while signed out works without redirect."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed out.

**Given** a signed-out visitor
**When** they navigate directly to each of the five public routes in turn
**Then** every one loads its own content in place, with no redirect to `/signin`

**Steps:** For each of `/`, `/signin`, `/signup`, `/forgot-password`, `/about`:
1. `page.goto(path)`.
2. Assert the URL is still exactly `path` (no redirect occurred).
3. Assert a route-identifying element is visible (e.g. the page's own `<h1>` — "Sign In", "Sign Up", "Reset Password", "About"; for `/` while signed out, the "Welcome to Mootmaker" heading).

**Assertions:**
- All five routes: final URL unchanged, expected heading visible.

**Out of scope:** the content of each page beyond confirming it rendered (covered by that page's own section — A/B/C for the forms, nothing dedicated to `/about` elsewhere since it's static and low-risk).

**Notes:** A single test iterating all five is reasonable here (unlike most other cases) since each iteration is a trivial `goto` + heading check with no shared mutable state between them — splitting into five separate test files would add ceremony without adding coverage.
