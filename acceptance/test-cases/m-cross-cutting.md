# M. Cross-cutting / non-functional

Use cases [mootmaker/use-cases.md § M](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#m-cross-cutting--non-functional).
See [README.md](README.md) for the entry format and test-data conventions. Several cases here need
deliberate network manipulation (`page.route`) on top of the real deployed environment to make an
otherwise-fast, hard-to-catch transient state reliably observable — each says so explicitly.

---

<a id="tc-m92"></a>
### M.92 — Loading states: first-load spinner vs. background-refetch progress bar

**Use case:** [use-cases.md#uc-92](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-92) — "Loading states: spinner on first load, slim progress bar on background refetch with stale data still shown."
**Status:** ✅ Automated — [`tests/cross-cutting.spec.ts`](../tests/cross-cutting.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user. A room, so there's a real room to book into.

**Given (a)** a genuinely first, cold visit to a day's Room Availability — nothing has fetched or written anything about that day yet
**Then (a)** a centred `CircularProgress` shows before content appears

**Given (b)** a second visit to the same page later in the same session (rooms already `cache-first`-cached; meetings re-queried `cache-and-network`)
**Then (b)** the *old* meeting data renders immediately, with only a slim `LinearProgress` bar above it while the background refetch runs — no full-page spinner, no flash of empty content

**Steps:**
1. Sign in; create a room; pin the clock to a fixed weekday.
2. `page.route` the GraphQL endpoint to add an artificial delay (e.g. 800ms) to responses for this test only — real network round trips against a real deployed environment are usually too fast to reliably catch a transient loading state otherwise.
3. Navigate (in-app, via the sidebar link) to that day's Room Availability for the first time this session, *before* creating any meeting — immediately assert the `CircularProgress` is visible, then assert it's gone.
4. Create a meeting on that same day (via Add Meeting), and follow the redirect back to its Room Availability. Assert the meeting is visible and no `CircularProgress` appears.
5. Navigate away and back to the same page (or otherwise trigger a refetch of the same query).
6. Immediately assert: the meeting's block is *already* visible (from cache) AND a `LinearProgress` bar is visible above it; no `CircularProgress` this time.

**Assertions:**
- (a): `CircularProgress` visible before data, gone after.
- (b): meeting content visible throughout; `LinearProgress` visible during the refetch window; `CircularProgress` never appears.

**Out of scope:** the equivalent loading states on other pages (Home, Person Calendar) — structurally the same `loading`/`showSpinner` pattern per the main README's "Progress indicators" section; one representative page is enough for this use case's own wording, which doesn't call out a specific page.

**Notes:** The artificial network delay (step 2) is what makes this deterministic — without it, a fast real response could resolve before Playwright's assertion even runs, making the "spinner was visible" half flaky or outright unobservable. Scope the route interception narrowly (only this test's own page, only for the duration needed) so it doesn't leak into other tests if run in the same worker.

Step 3 deliberately checks the day *before* a meeting is created on it, not the redirect straight after creating one (that used to be the same thing; it no longer is). mootmaker-webapp#66 fixed `Query.workspace`'s cache read to reconstruct `days` from the requested dates via the already-normalized `Day` entities, rather than trusting whatever `days` list a previous, differently-dated response happened to leave behind. One side effect: `createMeeting`'s own response returns the affected `day`, entity-normalized like any other write, so it now warms that day's cache immediately — the redirect straight after creating a meeting is a revisit to a day the mutation itself just populated, not a genuinely cold visit. That's a real improvement (no unnecessary spinner for data already in hand, asserted in step 4), but it means (a)'s "nothing cached yet" precondition needs a visit that precedes any write to the day being checked.

---

<a id="tc-m93"></a>
### M.93 — Network/transport error surfaces a readable message

**Use case:** [use-cases.md#uc-93](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-93) — "Network/transport error (e.g. API unreachable) surfaces a readable message in the error banner, not a blank/broken page."
**Status:** ✅ Automated — [`tests/cross-cutting.spec.ts`](../tests/cross-cutting.spec.ts)
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

**Use case:** [use-cases.md#uc-94](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-94) — "Expired/invalid session mid-use → next API call fails gracefully, ideally prompting re-authentication."
**Status:** ✅ Automated — [`tests/cross-cutting.spec.ts`](../tests/cross-cutting.spec.ts)
**Android:** not yet automated

**Preconditions:** Signed in as the demo user.

**Given** a signed-in session whose cached tokens have been corrupted (simulating expiry, since waiting out Cognito's real token TTL isn't practical in a test)
**When** the next API call is made
**Then** it fails without crashing the page — ideally prompting re-authentication, per the use case's own "ideally" hedge (i.e. this may currently just show a generic error instead; the test should observe and report whichever actually happens, not assume the "ideal" outcome)

**Steps:**
1. Sign in as the demo user.
2. Corrupt the cached Cognito session: `localStorage` keys under `amazon-cognito-identity-js`'s own naming convention (its id/access/refresh tokens) — overwrite the id token's value with a garbage string, or clear the refresh token specifically so `getSession()`'s transparent refresh can't succeed.
3. Trigger a fresh API call: navigate to Home (`/`), which issues its own query on mount. Deliberately not an admin-only page (Rooms/Persons) or another `RequireAuth`-guarded page, so this test's outcome is decided solely by what the corrupted session itself resolves to, not by a route guard's own redirect target.

**Assertions:**
- No unhandled crash/blank page.
- One of three outcomes, any of which counts as graceful — record honestly which one actually happens rather than assuming the "ideal" one: (a) an `ErrorBanner` appears with a readable message, (b) the app detects the invalid session and redirects to `/signin`, or (c) Home isn't route-guarded, so if the session resolves as genuinely signed-out it renders its own ordinary signed-out landing view in place rather than redirecting anywhere — confirmed against a real run to be what actually happens.

**Out of scope:** waiting out a real Cognito token TTL (impractical); the exact `localStorage` key names/shape (an `amazon-cognito-identity-js` internal detail — inspect real `localStorage` content in a signed-in session to get the exact keys when implementing, rather than guessing them here).

**Notes:** This is the one case in the catalog that most depends on `amazon-cognito-identity-js` internals not asserted anywhere else in this document — treat the first implementation attempt as partly exploratory (confirm the library's actual `localStorage` key shape against a real signed-in session before finalising the corruption step).

**2026-08-27 root cause: test bug, fixed.** The app's actual behaviour here is exactly the "ideal" outcome (redirects to `/signin`), confirmed against a real run's network trace: `getSession()` finds the corrupted-but-present refresh token and calls `refreshSession()`, which blindly retries via `amazon-cognito-identity-js`'s own `jitteredExponentialRetry` (`Client.js`) even though the error is a definitive 400 `NotAuthorizedException`, not anything transient — 6 attempts backing off up to 5s each, ~7.5s of wall-clock time, before finally giving up and resolving the session as null, at which point `RequireAuth` redirects. The original test asserted the Settings/Your name headings were visible *before* checking for a redirect, which contradicts that outcome: if the app redirects, `SettingsPage` never mounts, so those headings correctly never appear, and the original assertion just timed out first. Fixed by waiting (with 15s headroom, to cover the ~7.5s retry storm) for the redirect before deciding which of the two acceptable branches applies. Re-verified live and passing twice in a row. Worth noting for a future product-side look, though not treated as a bug fixed here: the ~7.5s delay before the app decides anything is entirely `amazon-cognito-identity-js`'s own built-in retry policy retrying a non-transient auth failure — the use case's own "ideally" bar is still met, just slower than a user might expect.

---

<a id="tc-m95"></a>
### M.95 — Deep link to a client-side route loads the SPA correctly

**Use case:** [use-cases.md#uc-95](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-95) — "Deep link directly to a client-side route (e.g. `/meetings/add`) loads the SPA correctly rather than 404ing."
**Status:** ✅ Automated — [`tests/cross-cutting.spec.ts`](../tests/cross-cutting.spec.ts)
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

**Use case:** [use-cases.md#uc-96](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-96) — "Light/dark mode follows OS `prefers-color-scheme` correctly on every page."
**Status:** ✅ Automated — [`tests/cross-cutting.spec.ts`](../tests/cross-cutting.spec.ts)
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

**Use case:** [use-cases.md#uc-97](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-97) — "Mobile nav flyout opens/closes correctly, including auto-closing after navigating to any page (Settings included)."
**Status:** ✅ Automated — [`tests/cross-cutting.spec.ts`](../tests/cross-cutting.spec.ts)
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

**2026-08-27 root cause: two stacked test bugs, both fixed.** (1) The test set the mobile viewport *before* signing in; `signInAsDemo`'s own "Sign out" check targets the sidebar `Drawer`, which `Layout.tsx` hides via CSS (not unmounts) at narrow widths, so at that viewport "Sign out" resolved to a real but permanently-hidden element (confirmed against a real run: "unexpected value 'hidden'") - fixed by signing in at the default desktop viewport first, then resizing, matching the pattern `room-availability.spec.ts`'s E.36 already established for the identical issue. (2) Once past that, `getByLabel('Settings')` hit "strict mode violation ... resolved to 2 elements": `Layout.tsx` renders its `drawerContent` (`MenuContent` + `AccountBox`) once per `Drawer` - the permanent one (always in the DOM, just CSS-hidden here) and the temporary one (mounted only while open) - and CSS `display:none` does **not** stop Playwright's `getByRole`/`getByLabel` from resolving the hidden copy too (only `.toBeVisible()`'s own check treats it as invisible, evaluated *after* strict-mode uniqueness already failed). Fixed by scoping both the "Room Availability" and "Settings" locators to `page.getByRole('dialog')` (the temporary Drawer's own Modal, confirmed via a real page snapshot to render with that role), which also naturally resolves to 0 once the drawer closes/unmounts, preserving the original "0 matches means closed" reasoning without relying on the incorrect hidden-element-exclusion assumption. Re-verified live and passing twice in a row.

---

<a id="tc-m98"></a>
### M.98 — Same-session cache consistency without a manual refresh

**Use case:** [use-cases.md#uc-98](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-98) — "Data edited in one place (e.g. a room renamed in Settings) is consistent everywhere it's cached (meeting lists, availability grid) without needing a manual refresh."
**Status:** ✅ Satisfied by [`tests/p-rooms.spec.ts`](../tests/p-rooms.spec.ts)'s P.128 test — see Notes
**Android:** not yet automated

**Preconditions/Steps/Assertions:** Identical to [P.128](p-rooms.md#tc-p128) — same mechanism (Apollo `InMemoryCache` normalization), same room-rename fixture, same "no reload" assertion.

**Out of scope:** N/A.

**Notes:** This is the general cross-cutting framing of the specific J.81 mechanic. Recommend treating J.81's implementation as satisfying this use case number too, rather than writing a second, separately-fixtured copy — the two are the same test in substance.

---

<a id="tc-m99"></a>
### M.99 — Refreshing picks up changes made outside the current session

**Use case:** [use-cases.md#uc-99](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-99) — "Refreshing the page picks up any changes made outside the current session (cache reset)."
**Status:** ✅ Automated — [`tests/cross-cutting.spec.ts`](../tests/cross-cutting.spec.ts)
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

**2026-08-27 update:** re-verified live and passing in every run today (3 for 3), including before M.94/M.97's own test fixes landed - confirming this case's earlier failure in the full-suite run was unrelated flakiness, not a real regression from the SES/Cognito change or the room-availability fixes. No test or product change was needed.

---

<a id="tc-m109"></a>
### M.109 — Two attendees of the same meeting responding at once both land

**Use case:** [use-cases.md#uc-109](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-109) — "Two different attendees of the same meeting responding to it at the same moment both land - neither overwrites the other, even under a real DynamoDB optimistic-lock conflict."
**Status:** ✅ Automated — [`tests/attendee-response-status.spec.ts`](../tests/attendee-response-status.spec.ts), new 2026-09-21 — see `../../designs/attendee-response-status.md` in the hub repo.
**Android:** not yet automated

**Preconditions:** Three real identities in three separate browser contexts: the demo user and two freshly-created, admin-confirmed accounts (`support/cognitoAdmin.ts`'s `createConfirmedTestAccount`, bypassing the email-code UI). One organises; the demo user and the other fresh account are both attendees of one meeting, created via the API.

**Given** two different real attendees of the same meeting
**When** both call `respondToMeeting` for that meeting at the same moment (`Promise.all`, not sequential)
**Then** both responses land - the day item's optimistic-lock retry (`DayRepository.mutate`) means the second writer re-reads and re-applies against the first's already-committed change rather than losing it

**Steps:**
1. Sign in as the demo user and two fresh accounts, each in its own browser context (a shared context would share localStorage and silently replace an earlier sign-in).
2. Create a meeting via the API: fresh account 1 organises, the demo user and fresh account 2 attend.
3. Fire `respondToMeeting` from the demo user (`Going`) and fresh account 2 (`Maybe`) together via `Promise.all`.
4. Read the meeting back over the API.

**Assertions:**
- Both mutation calls return no errors.
- The re-read shows the demo user's status as `Going` AND fresh account 2's status as `Maybe` - neither missing, neither holding the other's value.

**Notes:** This is the real-infrastructure counterpart to `RespondToMeetingHandlerTest`'s `FakeDynamoDbClient`-based concurrency tests in `mootmaker-api` - those pin the handler's own retry *logic*; this is what actually proves a genuine DynamoDB `ConditionalCheckFailedException` gets hit and retried, not just reasoned about.

---

<a id="tc-m110"></a>
### M.110 — One person responding to two different meetings sharing a day both land

**Use case:** [use-cases.md#uc-110](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-110) — "One person responding to two different meetings that happen to fall on the same calendar day - and so share the same DynamoDB day item - at the same moment: both responses land."
**Status:** ✅ Automated — [`tests/attendee-response-status.spec.ts`](../tests/attendee-response-status.spec.ts), new 2026-09-21 — see `../../designs/attendee-response-status.md` in the hub repo.
**Android:** not yet automated

**Preconditions:** Signed in as the demo user, with two rooms and one other Person (organiser) already present. Two meetings on the same pinned day (different rooms/times), both via the API, with the demo user as the sole attendee of each.

**Given** one person attending two different meetings on the same calendar day
**When** they respond to both at the same moment (`Promise.all`)
**Then** both responses land - even though these look independent from the API surface, storage is one DynamoDB item per *day*, not per meeting, so both writes contend on the exact same optimistic lock and this is the concurrency shape most likely to produce a real conflict in practice

**Steps:**
1. Sign in as the demo user; create two rooms and one organiser Person.
2. Create two meetings via the API on the same day, different rooms/times, demo user attending both.
3. Fire `respondToMeeting` for both meetings together via `Promise.all` (`Going` / `NotGoing`).
4. Read both meetings back over the API.

**Assertions:**
- Both mutation calls return no errors.
- Meeting A shows `Going`, meeting B shows `NotGoing` - neither lost to the other's write.

**Notes:** Companion to M.109 - see `designs/attendee-response-status.md`'s Technical considerations for why this specific shape (same person, same day, different meetings) was called out as the sharper of the two cases.

---

<a id="tc-m111"></a>
### M.111 — A response made by another client is reflected live

**Use case:** [use-cases.md#uc-111](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-111) — "A response made by another client (e.g. a different attendee, or the same person in another tab) is reflected on an already-open meeting detail sheet without a refresh."
**Status:** ✅ Automated — [`tests/attendee-response-status.spec.ts`](../tests/attendee-response-status.spec.ts), new 2026-09-21 — see `../../designs/attendee-response-status.md` in the hub repo.
**Android:** not yet automated

**Preconditions:** Two browser contexts: the demo user (observer, organiser) and one fresh account (the meeting's sole attendee). A meeting created via the API, on the pinned "today".

**Given** the observer has the meeting's detail sheet open, showing the attendee's status badge as "No response"
**When** the attendee calls `respondToMeeting` from their own, separate session
**Then** the observer's already-open sheet updates to show "Going" with no reload or navigation - the same `daysInvalidated` broadcast/refetch `createMeeting` already relies on, now proven for `respondToMeeting` too

**Steps:**
1. Sign in as the demo user (observer) and a fresh account (attendee), each in its own context.
2. Observer creates a meeting via the API with the fresh account as the sole attendee.
3. Observer opens the meeting's detail sheet; asserts the attendee's badge reads "No response".
4. The attendee calls `respondToMeeting('Going')` directly over the API - not through the observer's browser.
5. Observer's page, untouched, is asserted again.

**Assertions:**
- Step 5: the badge updates to "Going" within 30s, with no `page.reload()` or navigation performed on the observer's page at any point after step 3.

**Notes:** `RespondToMeetingHandler` publishes `daysInvalidated` server-side on success, same as `createMeeting` - this proves the client side of that same wiring (`useDaysInvalidated.ts`) also covers a status change, not just a new booking.

---

<a id="tc-m112"></a>
### M.112 — An edit made by another client is reflected live

**Use case:** [use-cases.md#uc-122](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-122) — "An edit made by another client (e.g. the organiser, in another tab or by another admin) is reflected on an already-open meeting detail sheet without a refresh." (Cross-references [M.112](#tc-m112)/[M.113](#tc-m113) - see `../../designs/edit-and-cancel-meetings.md`.)
**Status:** ✅ Automated — [`tests/edit-and-cancel-meetings.spec.ts`](../tests/edit-and-cancel-meetings.spec.ts)
**Android:** not yet automated

**Preconditions:** Two browser contexts: the demo user (observer) and a second confirmed account (the editor - an admin, or the meeting's organiser in another tab). A meeting created via the API, on the pinned "today".

**Given** the observer has the meeting's detail sheet open, showing its original subject
**When** the editor calls `updateMeeting` for that meeting from their own, separate session, changing the subject
**Then** the observer's already-open sheet updates to show the new subject with no reload or navigation - the same `daysInvalidated` broadcast/refetch mechanism M.111 proves for `respondToMeeting`, now proven for `updateMeeting` too

**Steps:**
1. Sign in as the demo user (observer) and a second confirmed account (editor, admin), each in its own context.
2. Observer creates a meeting via the API, organised by themselves.
3. Observer opens the meeting's detail sheet; asserts the original subject is shown.
4. The editor calls `updateMeeting` directly over the API, changing the subject - not through the observer's browser.
5. Observer's page, untouched, is asserted again.

**Assertions:**
- Step 5: the sheet's heading updates to the new subject within 30s, with no `page.reload()` or navigation performed on the observer's page at any point after step 3.

**Notes:** This is the case that motivated `MeetingDetailContent.tsx`'s `useFragment` live-binding in the first place (see the design's Technical considerations) - the sheet is kept open showing a live view of the meeting, not a frozen snapshot from when it was opened.

---

<a id="tc-m113"></a>
### M.113 — A cancellation made by another client is reflected live

**Use case:** [use-cases.md#uc-123](https://github.com/geoffweatherall/mootmaker/blob/main/docs/reference/use-cases.md#uc-123) — "A cancellation made by another client is reflected on an already-open meeting detail sheet without a refresh - the sheet shows the meeting was cancelled elsewhere, rather than continuing to display stale content or erroring." (Cross-references [M.112](#tc-m112)/[M.113](#tc-m113) - see `../../designs/edit-and-cancel-meetings.md`.)
**Status:** ✅ Automated — [`tests/edit-and-cancel-meetings.spec.ts`](../tests/edit-and-cancel-meetings.spec.ts)
**Android:** not yet automated

**Preconditions:** Two browser contexts: the demo user (observer) and a second confirmed account (the canceller - an admin, or the meeting's organiser in another tab). A meeting created via the API, on the pinned "today".

**Given** the observer has the meeting's detail sheet open, showing its subject and details
**When** the canceller calls `cancelMeeting` for that meeting from their own, separate session
**Then** the observer's already-open sheet stops showing the meeting's content and instead shows that it was cancelled elsewhere, with no reload, navigation, or error dialog

**Steps:**
1. Sign in as the demo user (observer) and a second confirmed account (canceller, admin), each in its own context.
2. Observer creates a meeting via the API, organised by themselves.
3. Observer opens the meeting's detail sheet; asserts the subject is shown.
4. The canceller calls `cancelMeeting` directly over the API - not through the observer's browser.
5. Observer's page, untouched, is asserted again.

**Assertions:**
- Step 5: the sheet no longer shows the meeting's subject/details, and instead shows a "This meeting was cancelled" empty state, within 30s, with no `page.reload()` or navigation performed on the observer's page at any point after step 3.
- No unhandled error surfaces on the page (checked via a `page.on('pageerror', ...)` listener registered before step 3).

**Notes:** This is the case that motivated the explicit `evictMeetingsOf` fix in `daysInvalidated.ts` - Apollo's automatic `cache.gc()` does not reliably collect a `Meeting` entity that still has an active `useFragment` watcher (the open sheet itself), so the day's eviction has to explicitly evict the meetings it referenced too. See the design's Technical considerations for the full root-cause writeup.
