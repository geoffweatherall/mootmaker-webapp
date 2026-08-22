# M. Cross-cutting / non-functional

Use cases [mootmaker/use-cases.md § M](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#m-cross-cutting--non-functional).
See [README.md](README.md) for the entry format and test-data conventions. Several cases here need
deliberate network manipulation (`page.route`) on top of the real deployed environment to make an
otherwise-fast, hard-to-catch transient state reliably observable — each says so explicitly.

---

<a id="tc-m92"></a>
### M.92 — Loading states: first-load spinner vs. background-refetch progress bar

**Use case:** [use-cases.md#uc-92](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-92) — "Loading states: spinner on first load, slim progress bar on background refetch with stale data still shown."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room and a meeting, so there's real content to render as "stale data."

**Given (a)** a genuinely first, cold visit to Room Availability (nothing cached yet)
**Then (a)** a centred `CircularProgress` shows before content appears

**Given (b)** a second visit to the same page later in the same session (rooms already `cache-first`-cached; meetings re-queried `cache-and-network`)
**Then (b)** the *old* meeting data renders immediately, with only a slim `LinearProgress` bar above it while the background refetch runs — no full-page spinner, no flash of empty content

**Steps:**
1. Sign in; create a room and a meeting on a fixed date; pin the clock.
2. `page.route` the GraphQL endpoint to add an artificial delay (e.g. 800ms) to responses for this test only — real network round trips against a real deployed environment are usually too fast to reliably catch a transient loading state otherwise.
3. Navigate to that date's Room Availability for the first time this session; immediately assert the `CircularProgress` is visible, then assert it's gone and content is present once the delayed response resolves.
4. Navigate away and back to the same page (or otherwise trigger a refetch of the same query).
5. Immediately assert: the meeting's block is *already* visible (from cache) AND a `LinearProgress` bar is visible above it; no `CircularProgress` this time.

**Assertions:**
- (a): `CircularProgress` visible before data, gone after.
- (b): meeting content visible throughout; `LinearProgress` visible during the refetch window; `CircularProgress` never appears.

**Out of scope:** the equivalent loading states on other pages (Home, Person Calendar) — structurally the same `loading`/`showSpinner` pattern per the main README's "Progress indicators" section; one representative page is enough for this use case's own wording, which doesn't call out a specific page.

**Notes:** The artificial network delay (step 2) is what makes this deterministic — without it, a fast real response could resolve before Playwright's assertion even runs, making the "spinner was visible" half flaky or outright unobservable. Scope the route interception narrowly (only this test's own page, only for the duration needed) so it doesn't leak into other tests if run in the same worker.

---

<a id="tc-m93"></a>
### M.93 — Network/transport error surfaces a readable message

**Use case:** [use-cases.md#uc-93](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-93) — "Network/transport error (e.g. API unreachable) surfaces a readable message in the error banner, not a blank/broken page."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** the GraphQL API is unreachable
**When** a page that depends on it is visited
**Then** an `ErrorBanner` shows a readable message, and the page doesn't crash to a blank screen

**Steps:**
1. Sign in as the demo user (before breaking the network, so the session itself is established).
2. `page.route(GRAPHQL_API_URL, route => route.abort())` — simulate the API being unreachable, for this test only.
3. Navigate to today's Room Availability.

**Assertions:**
- `ErrorBanner` is visible with a non-empty message (from `errorMessages()`'s transport-error branch).
- The page's own static chrome (heading, sidebar) still renders — not a blank page or an unhandled React error boundary.

**Out of scope:** a GraphQL-level error (a well-formed response with an `errors` array) vs. a true transport failure (connection refused/aborted) — this case is specifically the transport failure; `errorMessages()` handles both, but only the transport path is exercised here since it's the one this use case's wording names ("API unreachable").

**Notes:** `page.route(...).abort()` only affects this one browser context/test — safe to use even though this suite runs `workers: 1` against a real, possibly-shared environment, since it never actually touches the real API or other tests' traffic.

---

<a id="tc-m94"></a>
### M.94 — Expired/invalid session mid-use fails gracefully

**Use case:** [use-cases.md#uc-94](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-94) — "Expired/invalid session mid-use → next API call fails gracefully, ideally prompting re-authentication."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** a signed-in session whose cached tokens have been corrupted (simulating expiry, since waiting out Cognito's real token TTL isn't practical in a test)
**When** the next API call is made
**Then** it fails without crashing the page — ideally prompting re-authentication, per the use case's own "ideally" hedge (i.e. this may currently just show a generic error instead; the test should observe and report whichever actually happens, not assume the "ideal" outcome)

**Steps:**
1. Sign in as the demo user.
2. Corrupt the cached Cognito session: `localStorage` keys under `amazon-cognito-identity-js`'s own naming convention (its id/access/refresh tokens) — overwrite the id token's value with a garbage string, or clear the refresh token specifically so `getSession()`'s transparent refresh can't succeed.
3. Trigger a fresh API call: navigate to a different authenticated page (e.g. `/settings`), or click something that issues a new query.

**Assertions:**
- No unhandled crash/blank page.
- Either: (a) an `ErrorBanner` appears with a readable message, or (b) the app detects the invalid session and redirects to `/signin` — record honestly which of these the app actually does when this is implemented, since the use case itself only says "ideally" for the redirect behaviour, not "must."

**Out of scope:** waiting out a real Cognito token TTL (impractical); the exact `localStorage` key names/shape (an `amazon-cognito-identity-js` internal detail — inspect real `localStorage` content in a signed-in session to get the exact keys when implementing, rather than guessing them here).

**Notes:** This is the one case in the catalog that most depends on `amazon-cognito-identity-js` internals not asserted anywhere else in this document — treat the first implementation attempt as partly exploratory (confirm the library's actual `localStorage` key shape against a real signed-in session before finalising the corruption step).

---

<a id="tc-m95"></a>
### M.95 — Deep link to a client-side route loads the SPA correctly

**Use case:** [use-cases.md#uc-95](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-95) — "Deep link directly to a client-side route (e.g. `/meetings/add`) loads the SPA correctly rather than 404ing."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user (or signed out, for the redirect-to-signin variant — either proves the deep link itself resolved rather than 404ing).

**Given** a fresh browser (no prior client-side navigation within the app this session)
**When** the browser is pointed directly at a nested client-side route's URL
**Then** the real page loads (the S3/CloudFront 403/404→`/index.html` rewrite, per this repo's own Hosting section, working correctly) — not a raw 404

**Steps:**
1. Sign in as the demo user.
2. In a **fresh page/context** (not reusing one that's already loaded the SPA), `page.goto(<WEBAPP_URL>/meetings/add)` directly — a true hard navigation, not a client-side one.

**Assertions:**
- HTTP response status is 200 (not 404/403).
- The Add Meeting page's own heading is visible (proves the SPA's router, not just `index.html`, actually resolved the deep-linked path client-side).

**Out of scope:** the auth redirect this route would also trigger if signed out (already covered by B.14, which is really the same deep-link mechanism plus the `RequireAuth` layer on top).

**Notes:** This test's value is specifically in exercising a **fresh, uncached** navigation straight to the nested path (proving CloudFront's own rewrite rule, not just client-side routing already primed by an earlier `/` visit) — use a new browser context/page per this test rather than one that navigated through the SPA first.

---

<a id="tc-m96"></a>
### M.96 — Light/dark mode follows OS `prefers-color-scheme`

**Use case:** [use-cases.md#uc-96](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-96) — "Light/dark mode follows OS `prefers-color-scheme` correctly on every page."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** the OS-level colour-scheme preference
**When** set to `dark`, then to `light`
**Then** the app's own background/text colours switch accordingly, with no in-app toggle needed — checked across a representative sample of pages, not literally all of them

**Steps:**
1. `page.emulateMedia({ colorScheme: 'dark' })`.
2. Sign in; visit `/` (signed-in Home), `/settings`, and `/rooms/<today>/availability` in turn; read each page's computed `background-color` on the `<body>` (or the theme's outermost container) via `getComputedStyle`.
3. `page.emulateMedia({ colorScheme: 'light' })`; reload; repeat the same three reads.

**Assertions:**
- All three pages' dark-mode background colour matches `theme/tokens.ts`'s dark palette background value; light-mode matches the light one.
- The two sets of readings (dark vs. light) are different from each other (a trivial but worthwhile sanity check that emulation actually took effect).

**Out of scope:** literally every one of the app's ~13 routes — three structurally different pages (a data-light page, a form-heavy page, a data-dense grid) is a reasonable, deliberately-scoped proxy for "every page," since `ThemeModeProvider.tsx` applies the theme globally via one `CssBaseline`, not per-page; if this ever regresses on a *specific* page despite passing here, that would point at a page-level `sx` override fighting the theme, worth its own follow-up case rather than expanding this one to all 13 upfront.

**Notes:** Read the actual palette values from `webapp/src/theme/tokens.ts` when implementing this, rather than hardcoding an assumed hex/rgb value here — this catalog deliberately doesn't duplicate that source of truth.

---

<a id="tc-m97"></a>
### M.97 — Mobile nav flyout opens/closes, auto-closing after navigation

**Use case:** [use-cases.md#uc-97](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-97) — "Mobile nav flyout opens/closes correctly, including auto-closing after navigating to any page (Settings included)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. Narrow viewport.

**Given** a signed-in user on a narrow viewport
**When** they open the hamburger menu, then tap a nav item (once for an ordinary `MenuContent` item, once for the `AccountBox` Settings shortcut specifically, since it's called out by name in the use case's wording)
**Then** the temporary `Drawer` opens on the hamburger tap and closes automatically once navigation completes, both times

**Steps:**
1. `page.setViewportSize({ width: 375, height: 667 })`; sign in.
2. Click **Open menu** (`getByLabel('Open menu')`).
3. Assert the mobile `Drawer` is open (visible nav content).
4. Click **Room Availability** within it.
5. Assert the URL changed AND the drawer is now closed.
6. Reopen the menu; click the **Settings** icon button (`getByLabel('Settings')`, in `AccountBox`).
7. Assert URL is `/settings` AND the drawer is closed.

**Assertions:**
- Steps 3: drawer open.
- Steps 5 and 7: both navigation *and* auto-close happened together, for both an ordinary `MenuContent` item and the `AccountBox` Settings shortcut specifically.

**Out of scope:** the desktop permanent-drawer variant (not applicable — no open/close state exists there at all).

**Notes:** The use case's explicit "(Settings included)" parenthetical exists because `AccountBox`'s Settings shortcut is a structurally separate component from `MenuContent`'s own items, each independently wired to call `onNavigate` — worth checking both rather than assuming one implies the other.

---

<a id="tc-m98"></a>
### M.98 — Same-session cache consistency without a manual refresh

**Use case:** [use-cases.md#uc-98](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-98) — "Data edited in one place (e.g. a room renamed in Settings) is consistent everywhere it's cached (meeting lists, availability grid) without needing a manual refresh."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions/Steps/Assertions:** Identical to [J.81](j-settings-rooms.md#tc-j81) — same mechanism (Apollo `InMemoryCache` normalization), same room-rename fixture, same "no reload" assertion.

**Out of scope:** N/A.

**Notes:** This is the general cross-cutting framing of the specific J.81 mechanic. Recommend treating J.81's implementation as satisfying this use case number too, rather than writing a second, separately-fixtured copy — the two are the same test in substance.

---

<a id="tc-m99"></a>
### M.99 — Refreshing picks up changes made outside the current session

**Use case:** [use-cases.md#uc-99](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md#uc-99) — "Refreshing the page picks up any changes made outside the current session (cache reset)."
**Status:** ⬜ Planned
**Android:** not yet automated

**Preconditions:** Two separate browser contexts (simulating two independent sessions/devices), both signed in as the demo user.

**Given** two independent sessions with the *same* page already loaded and cached (e.g. Room Availability, so rooms are `cache-first`-cached in each)
**When** session A creates a new room, and session B — which never touched session A's tab/cache — hard-reloads
**Then** session B's reload picks up the new room, proving a full reload resets Apollo's in-memory cache rather than serving stale `cache-first` data indefinitely

**Steps:**
1. Open two Playwright browser contexts, A and B; sign in as the demo user in both.
2. In both, navigate to `/settings` (or any page that warms the `LIST_ROOMS` `cache-first` cache) — establishing each context's own independent in-memory cache.
3. In context A only, create a new uniquely-named room.
4. In context B, **without** navigating through the SPA (which wouldn't refetch a `cache-first` query anyway), perform a hard `page.reload()`.
5. In context B, navigate to `/settings` or the Room dropdown on Add Meeting.

**Assertions:**
- Before step 4: context B does NOT see the new room (proving this isn't just an already-shared live cache — a real, distinct-context precondition).
- After steps 4–5: context B DOES see the new room.

**Out of scope:** the same-session, no-reload-needed case (M.98/J.81 — this case is specifically the *contrast*: a genuinely separate session/context that only picks up the change via a hard reload, not automatically).

**Notes:** This is the one case in the catalog that specifically needs **two independent browser contexts**, not just one page navigating around — the whole point is proving cache behaviour *across* sessions, which a single context's own always-fresh state can't demonstrate on its own.
