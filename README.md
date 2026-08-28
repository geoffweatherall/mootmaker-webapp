# mootmaker-webapp

A project that is part of my [Claude Code exploration](https://github.com/geoffweatherall/mootmaker).

## Details

A single-page web application for the [mootmaker-api](https://github.com/geoffweatherall/mootmaker-api) GraphQL API. It lets users add meetings and browse existing meetings through a daily room-availability view and a per-person calendar view. The app is a static build hosted on AWS (S3 + CloudFront) and talks directly to the AppSync GraphQL endpoint from the browser.

This checkout expects the `mootmaker-api` project to be a **sibling directory** — the deploy script reads the API's URL and Cognito settings from its Terraform outputs.

Users must **sign in** (or sign up) with an email address and password before they can see any page other than the home page; see [Authentication](#authentication). Signing up also collects the user's name, which the API uses to automatically create a linked Person record once the account is confirmed (see the [mootmaker-api README](https://github.com/geoffweatherall/mootmaker-api#sign-up-creates-a-linked-person)) — so a new user can schedule a meeting as themselves without needing to be added as a person first. Every account is one of two classes, `standard` or `admin` (see [Settings page](#settings-page)): only admins can add or edit rooms and people; a standard user can only rename themselves.

## Directory structure

| Path | Purpose |
|---|---|
| [webapp/](webapp/) | The React application (Vite + TypeScript). All frontend source, tests, and build config live here. |
| [webapp/src/pages/](webapp/src/pages/) | One component per route — the calendar-style views (`RoomAvailabilityPage`, `PersonCalendarPage`), meeting details (`MeetingDetailsPage`), the add-meeting form (`AddMeetingPage`), the auth forms (`SignInPage`, `SignUpPage`, `ForgotPasswordPage`), `SettingsPage` (name/room/person maintenance, see [Settings page](#settings-page)), and `HomePage`. This is where page-level logic lives. |
| [webapp/src/auth/](webapp/src/auth/) | Everything Cognito: the promise wrappers around `amazon-cognito-identity-js` ([cognito.ts](webapp/src/auth/cognito.ts)), the React auth context/hook ([authContext.ts](webapp/src/auth/authContext.ts)), and its provider ([AuthProvider.tsx](webapp/src/auth/AuthProvider.tsx)). |
| [webapp/src/components/](webapp/src/components/) | Shared presentational components used across pages: `Layout` (the responsive nav shell — a permanent left-hand sidebar on wide screens, collapsing to a hamburger-triggered flyout `Drawer` on narrow ones), `MenuContent` (the nav links themselves — Home/Calendar/Availability, then sign-in/out, then About/Feedback), `AccountBox` (the signed-in user's name and a settings shortcut at the foot of the sidebar), `RequireAuth` (route guard), `SignInForm` (the sign-in fields + submit logic shared by SignInPage and the signed-out home page), `ErrorBanner`, `SuccessToast`, `SubmitButton`, `EmptyState` (icon + message for the app's "nothing here" spots — see [Branding & theming](#branding--theming)). |
| [webapp/src/graphql/](webapp/src/graphql/) | Everything about talking to the API: query/mutation documents, TypeScript types mirroring the schema, error-code → message maps, and date formatting. |
| [webapp/src/hooks/](webapp/src/hooks/) | Shared hooks; currently `useLocationToast`, which shows a one-shot success toast after navigation. |
| [webapp/tests/](webapp/tests/) | Playwright end-to-end tests, run against a mocked API (see [Tests](#tests) below) — plus `webapp/src/**/*.test.ts`, Vitest unit tests co-located with the code they cover. |
| [deploy/terraform/](deploy/terraform/) | Terraform for the hosting infrastructure: S3 bucket ([s3.tf](deploy/terraform/s3.tf)) and CloudFront distribution ([cloudfront.tf](deploy/terraform/cloudfront.tf)). All resource names are prefixed with `<environment>-<project_name>` ([locals.tf](deploy/terraform/locals.tf)) so multiple environments can coexist in one AWS account. State is stored remotely in S3, one state file per environment ([backend.hcl](deploy/terraform/backend.hcl) — see the [mootmaker-bootstrap-terraform](https://github.com/geoffweatherall/mootmaker-bootstrap-terraform) README for how that bucket is set up, and the [mootmaker project README](https://github.com/geoffweatherall/mootmaker#multi-environment-deployments) for the multi-environment design). |
| [deploy.sh](deploy.sh) / [undeploy.sh](undeploy.sh) | Deploy and tear down (see below). |
| [e2e/](e2e/) | Playwright tests against a genuinely deployed webapp + API + Cognito — a small, curated set proving the real infrastructure is wired correctly. See [Tests](#tests) below. |
| [acceptance/](acceptance/) | Playwright tests proving the use cases in [mootmaker/use-cases.md](https://github.com/geoffweatherall/mootmaker/blob/main/use-cases.md) are satisfied, against the same kind of genuinely deployed environment as `e2e/`. See [acceptance/README.md](acceptance/README.md) and [Tests](#tests) below. |
| [support/](support/) | TypeScript helpers shared by `e2e/` and `acceptance/`: real-emailed-verification-code reading (SQS) and Cognito Admin-API test-account creation. Neither suite duplicates the other's copy — both import from here. |

The `src/` layout follows the conventional React "group by file type" pattern (pages / components / hooks / api-layer) described in the [React FAQ on file structure](https://legacy.reactjs.org/docs/faq-structure.html#grouping-by-file-type), on top of a standard [Vite React scaffold](https://vite.dev/guide/).

## Architecture

- **React 19** with **TypeScript**, built by **Vite**. Strict-mode SPA, no server-side rendering — everything runs in the browser.
- **MUI (Material UI) v9** provides the design language: `CssBaseline` and standard components — a `Drawer`-based sidebar for navigation (with `AppBar` only for the mobile hamburger bar), `Paper`-wrapped forms and tables, `Alert`/`Snackbar` for feedback. **MUI X Date Pickers** (with **dayjs**) provide the meeting time pickers.
- **Branding**: the theme's palette, typography, shadows, and component styling are all built from the [mootmaker project's brand tokens](https://github.com/geoffweatherall/mootmaker/tree/main/branding) ([theme/tokens.ts](webapp/src/theme/tokens.ts), [theme/theme.ts](webapp/src/theme/theme.ts)) — see [Branding & theming](#branding--theming) below for the detail. [theme/ThemeModeProvider.tsx](webapp/src/theme/ThemeModeProvider.tsx) picks light or dark purely by following the OS's `prefers-color-scheme` — there's no in-app toggle. The brand mark (`assets/logo.svg`) appears next to the app name in the sidebar (and in the mobile top bar), and its `icon.svg` variant is the favicon.
- **React Router v7** does client-side routing. Routes are declared in [App.tsx](webapp/src/App.tsx): `/`, `/signin`, `/signup`, `/forgot-password` and `/about` are public; `/persons/:personId/calendar`, `/rooms/:date/availability`, `/meetings/add`, `/meetings/:meetingId` and `/settings` are wrapped in the `RequireAuth` guard; unknown paths redirect to `/`. There are no top-level list pages for people or meetings — the sidebar's "Room Availability" and "Calendar" items go straight to `RoomAvailabilityPage` and `PersonCalendarPage` instead, the latter defaulting to the signed-in user's own linked Person. If there isn't one, "Calendar" is disabled rather than falling back to someone else's calendar (see [Home page](#home-page) below). `RoomAvailabilityPage` is the entry point for adding a meeting (`AddMeetingPage`); adding or editing rooms and people lives on `/settings` instead (admin only — see [Settings page](#settings-page)).
- **amazon-cognito-identity-js** talks to the Cognito user pool (SRP sign-in, sign-up, token storage/refresh in `localStorage`).
- **Apollo Client v4** handles all GraphQL communication and caching (`InMemoryCache`).
- **oxlint** for linting, **Playwright** for end-to-end tests.

### Main classes / where the logic is

There is deliberately little logic in the frontend; the backend owns the rules.

- [apolloClient.ts](webapp/src/apolloClient.ts) — the single Apollo client instance: an `HttpLink` to the endpoint behind a `SetContextLink` that attaches the signed-in user's JWT to every request.
- Page components in [src/pages/](webapp/src/pages/) hold the form state and submit handlers. [AddMeetingPage.tsx](webapp/src/pages/AddMeetingPage.tsx) is the most involved: a single form with every field (subject, organiser, attendees, date, times, room) on screen at once and no step navigation, it loads rooms and people for its dropdowns, defaults the organiser to the signed-in user, the start time to the next 15-minute boundary and the length to an hour, offers a "Suggest a room" button next to the room field, and maps validation error codes to messages.
- [graphql/types.ts](webapp/src/graphql/types.ts) — TypeScript mirrors of the schema types plus the `ROOM_ERROR_MESSAGES` / `MEETING_ERROR_MESSAGES` maps that translate backend error enums into user-facing text.
- [graphql/errorMessages.ts](webapp/src/graphql/errorMessages.ts) — flattens Apollo transport/GraphQL errors into displayable strings.
- [graphql/formatDateTime.ts](webapp/src/graphql/formatDateTime.ts) — renders the API's zone-less local date-times without letting the browser reinterpret them in its own time zone; `formatLocalDate`/`formatLocalTime` split a date-time into its date-only/time-only parts (see [Date/time display](#datetime-display) below) rather than always rendering the full thing.

### Branding & theming

Beyond the four-colour palette in [theme/tokens.ts](webapp/src/theme/tokens.ts) (mirrored from [mootmaker's branding tokens](https://github.com/geoffweatherall/mootmaker/tree/main/branding)), [theme/theme.ts](webapp/src/theme/theme.ts) customises MUI well past a palette swap:

- **Typography**: **Inter** for body/UI text, **Outfit** for headings (`h1`-`h6`, `subtitle1`/`2`, and button labels) - both self-hosted via `@fontsource` (imported once in [main.tsx](webapp/src/main.tsx), no external font request at runtime, unlike a Google Fonts CDN `<link>`). Outfit's geometric, rounded-terminal letterforms echo the logo mark's own flat rounded shape language (see the [branding README](https://github.com/geoffweatherall/mootmaker/tree/main/branding#the-mark-meeting-booked)), so headings read as distinctly "Mootmaker" rather than the generic system-font fallback MUI silently used before this (no font was loaded at all previously).
- **Shadows**: [theme/shadows.ts](webapp/src/theme/shadows.ts)'s `buildShadows()` replaces MUI's default 25-step flat-grey Material elevation scale with the same shape tinted with the current mode's own ink colour at low alpha, so `Paper` cards read as part of this theme rather than default Material Design.
- **Component styling**: `MuiButton` (flat - no default drop shadow, no uppercase text, a small lift-on-hover instead of MUI's darken-only feedback), `MuiOutlinedInput` (covers `Select` too, since an outlined `Select` renders an `OutlinedInput` internally - a tighter corner radius, primary-coloured border on hover), and `MuiChip`/`MuiCheckbox` all get their own `styleOverrides` in `theme.ts`, rather than relying on MUI's defaults everywhere but the palette.
- **The "Suggest a room" button** ([AddMeetingPage.tsx](webapp/src/pages/AddMeetingPage.tsx)) is a deliberate one-off exception to that shared button styling: a `primary`→`secondary` gradient fill (via a function `sx` reading `theme.palette` directly, not a theme-wide rule) and a custom [SparkleIcon](webapp/src/icons/index.tsx), so the app's one "smart" feature reads as visually distinct from ordinary actions rather than blending in as another outlined button.
- **Room-identity colour coding**: [theme/roomColor.ts](webapp/src/theme/roomColor.ts) assigns each room one of 8 validated categorical hues (`roomPaletteLight`/`roomPaletteDark` in `tokens.ts`, mirrored as `--color-room-1..8` in the branding project's `tokens.css`) by its position in the name-sorted room list, so the same room gets the same colour everywhere it appears. `RoomAvailabilityPage` uses it for each room's lane tint and meeting-block fill (with `readableTextOn()` picking white or the theme's ink colour per swatch, since several of the 8 hues are too light for a fixed white-text assumption); `PersonCalendarPage` uses it for a small coloured dot beside each meeting, keyed by a `LIST_ROOMS` query sorted the same way. This palette was chosen and validated (CVD-safe adjacent-hue separation, ≥3:1 contrast against this app's own light/dark backgrounds) with a palette validator script rather than eyeballed - see the [branding project's "Room-identity palette" section](https://github.com/geoffweatherall/mootmaker/tree/main/branding#room-identity-palette) for the full rationale - and is deliberately a separate palette from `primary`/`secondary`/`accent` so a room's colour is never mistaken for a primary-action or warning cue. Colour is always a secondary scan aid here, never a room's only identifier - its name is shown as text everywhere its colour appears, including the 8-room wraparound for the rare case of more than 8 rooms (a documented departure from "never cycle a categorical palette", acceptable specifically because the name text carries identity, not the colour).
- **Empty states**: [components/EmptyState.tsx](webapp/src/components/EmptyState.tsx) (an illustration, plus a message) replaces what used to be a single line of muted `Typography` for the handful of "nothing here" spots - no meetings today/tomorrow ([HomePage](webapp/src/pages/HomePage.tsx)), no rooms yet ([RoomAvailabilityPage](webapp/src/pages/RoomAvailabilityPage.tsx)), no people yet ([PersonCalendarPage](webapp/src/pages/PersonCalendarPage.tsx)). Its `illustration` prop takes one of the flat-illustration assets described below; when omitted it falls back to the generic circular `EmptyStateIcon` glyph, so a future empty state doesn't need bespoke art before it can use this component.
- **Illustrations**: [assets/](webapp/src/assets/) holds a small set of flat, rounded, Google-Alegria-style illustrations - simple circle-headed, rounded-rectangle-bodied figures in the brand's own violet/teal/amber, the same drawing technique as the original `home-hero.svg` (two people at a table, shown on the signed-out home page). Hand-authored SVG rather than a raster image-generation output, so they scale losslessly and stay exactly on-palette. Beyond `home-hero.svg` (also reused on [AboutPage](webapp/src/pages/AboutPage.tsx)), each of the following is a distinct scene sized for where it appears: `home-signed-in.svg` (a person waving beside a wall calendar with a checkmark - the signed-in [HomePage](webapp/src/pages/HomePage.tsx)'s welcome card), `empty-meetings.svg`/`empty-rooms.svg`/`empty-people.svg` (the three `EmptyState` occasions above), `signin-hero.svg`/`signup-hero.svg`/`forgot-password-hero.svg` (a small scene beside each auth page's title - unlocking a padlock, holding up a welcome badge, and a magnifying glass on a locked padlock, respectively), and `add-meeting-hero.svg` (a small calendar+clock vignette beside [AddMeetingPage](webapp/src/pages/AddMeetingPage.tsx)'s title only - deliberately tiny and figure-free so it doesn't compete with the dense form below it). `RoomAvailabilityPage` and `PersonCalendarPage` deliberately have no page-level illustration beyond their empty states - both are data-dense daily-use grids, where illustration would add noise rather than warmth.

## Calling the API

The browser calls the AppSync GraphQL endpoint directly via Apollo Client. Every request carries the signed-in user's Cognito **JWT id token** in the `Authorization` header (attached by the `SetContextLink` in [apolloClient.ts](webapp/src/apolloClient.ts)); AppSync rejects requests without a valid token with HTTP 401. The endpoint URL, Cognito ids, and demo user credentials are baked into the bundle at build time from the Vite environment variables `VITE_GRAPHQL_API_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_DEMO_USER_EMAIL` and `VITE_DEMO_USER_PASSWORD` (see [.env.example](webapp/.env.example)); `deploy.sh` generates `webapp/.env.production` from the deployed API's Terraform outputs. None of these are secrets — the Cognito ids are public identifiers (the security lives in Cognito's password authentication and JWT signatures), and the demo credentials are *meant* to be public: this is a demo system, so the home page shows them to every signed-out visitor (see [Home page](#home-page) below).

### Authentication

Authentication is an **Amazon Cognito user pool** owned by the API project (see the [API README](../mootmaker-api/README.md)); this app uses the pool's public `mootmaker-webapp` app client via `amazon-cognito-identity-js`.

- **Sign up** ([SignUpPage](webapp/src/pages/SignUpPage.tsx)) is two steps: register a name, email + password (at least 10 characters with a lowercase letter and a number — deliberately loose, since this is a demo system, see the [API README](../mootmaker-api/README.md#demo-user)), then enter the verification code Cognito emails. The name is sent to Cognito as the standard `name` user attribute. On confirmation the user is signed in automatically, and the API's PostConfirmation trigger creates a Person record for them in the background.
- **Sign in** ([SignInPage](webapp/src/pages/SignInPage.tsx), and the embedded [SignInForm](webapp/src/components/SignInForm.tsx) on the signed-out home page) authenticates with SRP (the password never leaves the browser in plain form). Tokens are cached in `localStorage` and refreshed transparently, so sessions survive page reloads.
- **Signed-in display name** ([AuthProvider](webapp/src/auth/AuthProvider.tsx)): the sidebar's [AccountBox](webapp/src/components/AccountBox.tsx) shows the caller's own `Person.name` (fetched via the API's `myPerson` query, which resolves it server-side from the JWT's `sub` claim), not the JWT's own `name` claim — the Person record is the single source of truth that the Settings page's "Your name" section updates, so reading it live avoids the two ever drifting apart. Falls back to the Cognito `name`/email attributes (read straight from the ID token, no round trip) until that query resolves, and permanently for accounts with no linked Person. `AuthProvider` exposes a `refreshPerson()` function that re-runs the `myPerson` query on demand; the Settings page calls it after a successful self-rename so the sidebar updates immediately without a page refresh.
- **User class** ([cognito.ts](webapp/src/auth/cognito.ts)'s `currentUserClass()`, read from the ID token's `custom:class` claim): every account is `standard` or `admin`. `AuthProvider` exposes this as `isAdmin`, which `SettingsPage` uses to decide whether to show the Rooms/People maintenance sections. **This is presentation only** — the actual authorization boundary is server-side (`Identity.requireAdmin` in the API, see the [API README](../mootmaker-api/README.md)); a standard user calling `updateRoom` directly would be rejected regardless of what the UI shows. The webapp's Cognito app client is deliberately not granted write access to `custom:class`, so a signed-in user can never promote themselves by calling Cognito's own attribute-update API from the browser.
- **Forgot password** ([ForgotPasswordPage](webapp/src/pages/ForgotPasswordPage.tsx), linked from the sign-in form) is two steps: request a verification code for an email address, then enter the emailed code with a new password. On success the user is signed in with the new password automatically. Cognito's *prevent user existence errors* setting is enabled, so requesting a code for an unknown address behaves exactly like a real one — the form never reveals whether an account exists.
- **Route guarding**: only the home page, the auth forms, and the About page are public. [RequireAuth](webapp/src/components/RequireAuth.tsx) redirects signed-out visitors of any other route to `/signin`, remembering where they were heading and returning them there after sign-in.
- **Sidebar**: [MenuContent](webapp/src/components/MenuContent.tsx) shows a Sign in/Sign up pair when signed out, or a Sign out item when signed in; [AccountBox](webapp/src/components/AccountBox.tsx) additionally shows the signed-in user's name and a settings shortcut at the foot of the sidebar. Signing out clears the Cognito session and the Apollo cache.
- The auth state (current user's email + sign-in/out functions) is provided by [AuthProvider](webapp/src/auth/AuthProvider.tsx) and read with the `useAuth()` hook; the promise-based Cognito wrappers live in [cognito.ts](webapp/src/auth/cognito.ts).

### Home page

[HomePage](webapp/src/pages/HomePage.tsx) shows entirely different content depending on sign-in state:

- **Signed out**: since every other page requires sign-in, there's nothing of the user's own to show yet. Instead the page leads with an embedded [SignInForm](webapp/src/components/SignInForm.tsx) pre-filled with the demo user's email and password (both shown as plain text alongside it, from `VITE_DEMO_USER_EMAIL`/`VITE_DEMO_USER_PASSWORD` — see [Calling the API](#calling-the-api) above) so a first-time visitor can sign in with one click, and a second section spelling out the three steps to sign up for a real account before the sign-up button. If those two env vars aren't set (e.g. a `.env` predating this feature), the credential display and pre-fill are skipped and the form is just left blank.
- **Signed in, with a linked Person**: "Calendar" (the signed-in user's own [PersonCalendarPage](webapp/src/pages/PersonCalendarPage.tsx)), "Room availability today", and "Add Meeting" buttons, plus two agenda lists — "Today" and "Tomorrow" — of the meetings the user is organising or attending, sorted by start time and linking to [MeetingDetailsPage](webapp/src/pages/MeetingDetailsPage.tsx).
- **Signed in, with no linked Person** (e.g. the e2e test user, created directly rather than through sign-up): an error `Alert` — "Your account hasn't been set up properly" — in place of "Calendar" and the agenda lists, rather than guessing by falling back to some other person's data. [AuthProvider](webapp/src/auth/AuthProvider.tsx) exposes a `personLoading` flag alongside `personId` so this only renders once the `myPerson` lookup has actually finished, not during the brief window right after sign-in before it resolves. "Room availability today" and "Add Meeting" are unaffected, since neither is tied to a Person - though "Add Meeting" won't have an organiser pre-filled for these accounts (see below).

"Add Meeting" and [RoomAvailabilityPage](webapp/src/pages/RoomAvailabilityPage.tsx)'s own "Add Meeting" button both lead to the same [AddMeetingPage](webapp/src/pages/AddMeetingPage.tsx) (`/meetings/add`), a single-step form with every field on the page at once - no "Next"/"Back" navigation:

- **Details**: subject, organiser, attendees, date, start/end time - the organiser defaults to the signed-in user's own Person (once resolved, and only if they haven't already changed it - never overriding a deliberate choice to organise on someone else's behalf), the start time defaults to the next 15-minute boundary from now, and the end time defaults to an hour after that (clamped to the same calendar day, like the 5-minute-boundary default it replaces - see [AddMeetingPage.tsx](webapp/src/pages/AddMeetingPage.tsx)). The organiser and attendees fields are kept mutually exclusive as the user picks people - see [Organiser/attendee mutual exclusivity](#organiserattendee-mutual-exclusivity) below.
- **Room**: a room dropdown, plus a **Suggest a room** button, sitting below the detail fields on the same form. The first press for a given time/attendee count calls the API's `suggestRoom` query, which returns every sufficiently-sized free room ranked smallest surplus capacity first (ties broken by name), and caches that whole ranked list in component state; each further press just fills in the next room from the cached list (wrapping back to the first once the list is exhausted) without calling the API again. Changing the date, either time, or the attendee count clears the cached list, so the next press fetches a fresh one. If the list is empty, an inline message says so rather than changing the selection. See [Suggested-room caching](#suggested-room-caching) below for how this is implemented in React.

### Settings page

[SettingsPage](webapp/src/pages/SettingsPage.tsx) (`/settings`, reached via the gear icon at the foot of the sidebar's [AccountBox](webapp/src/components/AccountBox.tsx)) has up to three `Paper`-card sections, all on one scrollable page rather than tabs — at this app's scale (a handful of rooms/people) that fits Material Design's own settings-screen pattern (grouped sections on a single page) without needing progressive disclosure:

- **Your name** (everyone): a `TextField` pre-filled with the caller's own `Person.name`, saved via `updatePerson`. Disabled, with an explanatory note, for accounts with no linked Person (see [Signed-in display name](#authentication) above).
- **Rooms** (admin only): every room in a `List`, each with an edit icon opening a `Dialog` to change its name/capacity (`updateRoom`), plus an "Add room" button opening the same dialog in create mode (`createRoom`).
- **People** (admin only): the same pattern for people (`updatePerson` / `createPerson`) — this is also how a guest person (someone without their own account) gets added now; the webapp has no separate page for it.

Apollo's `InMemoryCache` normalizes entities by `__typename:id`, so a room or person edited here patches every place it's already cached (meeting lists, the availability view) without a manual refetch.

### Error handling

Two kinds of errors reach the user, both rendered by the dismissible [ErrorBanner](webapp/src/components/ErrorBanner.tsx) (an MUI `Alert`) at the top of the page:

1. **Transport/GraphQL errors** (network failure, missing/expired token, server fault) surface through Apollo's `error` result and are flattened to messages by `errorMessages()`.
2. **Validation failures** are *not* GraphQL errors — the API returns a structured result (`CreateRoomResult` / `CreateMeetingResult`) whose `errors` field lists broken-rule enum codes. The form pages map each code through `ROOM_ERROR_MESSAGES` / `MEETING_ERROR_MESSAGES` to a human-readable message, so a rejected submission shows the complete list of problems in one banner.

On success, forms navigate to a relevant view (e.g. the day or person the new meeting/room affects) and pass a message via router state; `useLocationToast` shows it as an auto-hiding `Snackbar` and clears the state so it doesn't reappear on refresh.

### Progress indicators

- Views show a centred `CircularProgress` on first load, and a slim `LinearProgress` above the content when refetching with cached data already on screen. Meetings change constantly, so meeting queries use `cache-and-network` and refetch every visit; rooms and people change rarely, so those queries use `cache-first` and are fetched once per session (from the Apollo `InMemoryCache` on every visit after the first) — a full page refresh resets that in-memory cache and picks up any changes.
- `RoomAvailabilityPage`, `PersonCalendarPage`, and `HomePage` all pass the API's `meetings(filter: MeetingsFilter)` argument (see the [mootmaker-api README](https://github.com/geoffweatherall/mootmaker-api#querying-meetings-by-date-range-andor-person-without-scanning)) instead of fetching every meeting and filtering client-side: `RoomAvailabilityPage` sends `fromStartTime`/`toEndTime` for just the selected day; `PersonCalendarPage` sends that same window (the full visible 6-week range) plus `personId` for the selected person; `HomePage`'s Today/Tomorrow agenda sends a 2-day window plus the signed-in caller's own `personId`. Each is memoised on the values it's derived from (selected date; visible window + selected person; signed-in person id) so Apollo only issues a new request when the filter actually changes. This is deliberately three independent queries rather than one shared cache entry — Apollo's cache keys a list field by its exact arguments, so a narrower window (e.g. `HomePage`'s 2 days) isn't served from a broader cached one (e.g. `PersonCalendarPage`'s 6 weeks) even when it's a subset, and each query is cheap on its own now that the API filters server-side. `PersonCalendarPage` and `HomePage` both skip the query entirely (via `skip`) until a person id is available.
- [SubmitButton](webapp/src/components/SubmitButton.tsx) disables itself and shows an inline spinner while a mutation is in flight (Cancel is disabled too), preventing double submits.
- The meeting form shows a spinner while loading the room/people reference data its dropdowns need, and the "Suggest a room" button disables itself with its own inline spinner while its `suggestRoom` query is in flight, the same visual language as `SubmitButton`. That spinner only appears on the first press for a given time/attendee count - once the ranked list is cached, later presses update the selection synchronously.

### Suggested-room caching

`AddMeetingPage` caches the ranked list `suggestRoom` returns in a plain `useState` (`SuggestionCache`: `candidates: Room[] | null`, an `index` cursor into it, and a `key` - see below) rather than in Apollo's cache or some app-wide store. `candidates: null` means "not fetched for the current inputs"; `[]` means "fetched, and nothing qualified" - the two are kept distinct so a second press can tell "haven't asked yet" apart from "asked, got nothing" without re-querying either way.

`key` is a string built from the three inputs that determine the list - the combined start/end date-time strings and `attendeeIds.length` (`suggestionKey` in `AddMeetingPage.tsx`). `handleSuggestRoom` (the button's click handler) compares the cache's own `key` against the *current* `suggestionKey` on every press, computed fresh from that render's actual state: a mismatch (or `candidates: null`) means the cached list doesn't apply, so it awaits the `suggestRoom` query and caches the fresh result under the current key; otherwise it advances `index` by one, wrapping via `% candidates.length` back to the start once every room has been offered. Either way it then fills the room field from the resulting room, or shows the "no room available" message if the (possibly just-fetched) list is empty.

This replaced an earlier version that instead used a separate `useEffect` watching those same three inputs and clearing the cache asynchronously whenever they changed. That had a real race under genuine network latency (never reproduced against this suite's near-instant mock, only against a real deployed environment): the effect runs after the state update that changed the inputs commits, and a press arriving before that effect had actually run yet would still see a non-null, `candidates`-populated cache and skip re-fetching, silently reusing an already-stale ranked list for the new inputs instead. Comparing `key` inline removes the race by construction - there's no second, independently-scheduled piece of state that can lag behind the inputs it's supposed to track.

The cache is local to this one component instance: it's read nowhere else, and naturally resets if the user navigates away and back, so there's no reason to hoist it into Apollo's cache or a global store.

### Organiser/attendee mutual exclusivity

The organiser and attendees fields on `AddMeetingPage` are kept mutually exclusive: `organiserOptions` filters the Organiser dropdown to exclude anyone currently in `attendeeIds`, and `attendeeOptions` filters the Attendees dropdown to exclude whoever is currently `organiserId`. Both are plain derived values recomputed from that state on every render (see [AddMeetingPage.tsx](webapp/src/pages/AddMeetingPage.tsx)) - there's no separate synchronization step, so picking someone on one side immediately removes them as an option on the other, and un-picking them makes them selectable there again straight away.

This exists because the same person being both organiser and attendee is a real bug class, authoritatively rejected server-side by `MeetingError.OrganiserIsAttendee` (see the [API README](../mootmaker-api/README.md#rules) for the full rationale, including why it previously crashed `createMeeting` outright rather than failing validation cleanly). The filtering here is a UX nicety on top of that server-side rule, not a substitute for it - see [Validation: client vs server](#validation-client-vs-server) below.

The organiser-defaulting effect (see [Home page](#home-page) above) cooperates with this: it skips defaulting the organiser to the signed-in user for as long as that person has already been picked as an attendee, rather than fighting a deliberate attendee choice - and re-evaluates whenever `attendeeIds` changes, so removing that attendee pick lets the default apply retroactively, the same as any other person becoming selectable as organiser again after being removed as an attendee.

[tests/organiser-attendee-exclusivity.spec.ts](webapp/tests/organiser-attendee-exclusivity.spec.ts) covers every UI path around this rule that's straightforward to automate deterministically:

- Selecting one or more attendees removes each of them from the Organiser options; removing just one of them from the attendee list restores only that one as an organiser option (any other still-selected attendee stays excluded).
- Selecting an organiser removes them from the Attendees options, while an unpicked person remains available; switching the organiser to someone else immediately frees the old organiser to be picked as an attendee and excludes the new organiser instead.

One related path is deliberately **not** automated, and is recorded here so it isn't lost before this project's e2e testing grows past today's Playwright-only setup: the race between the organiser-defaulting effect and a user picking themselves as an attendee before their own `personId` resolves (see [Home page](#home-page) above and the guard described two paragraphs up). This is real, reachable behavior, but the current e2e test user has no linked Person at all (see [Home page](#home-page) above), so its `personId` is always null and the defaulting effect never fires for it in the first place, race or no race. Automating this needs a real signed-up test account with a linked Person instead of the bare e2e/demo accounts, plus a deterministic way to win or lose the race against the `myPerson` query - worth adding once this suite's tooling grows to support that. The plain-language version of this same rule (for a non-technical audience) lives in [mootmaker's business-functionality.md](https://github.com/geoffweatherall/mootmaker/blob/main/functionality/business-functionality.md), under "Meetings".

### Date/time display

A meeting's `startTime`/`endTime` are always full ISO-8601 local date-times (see [Calling the API](#calling-the-api)) - that's the API's representation, not the presentation one. The API also guarantees both fall on the same calendar date (`MeetingError.SpansMultipleDays` rejects a meeting that would span midnight - see the [API README](../mootmaker-api/README.md#rules)), so a meeting's date is never ambiguous even though only one of the two date-times is ever actually shown.

On screen, that date is shown once per meeting, not twice: [formatDateTime.ts](webapp/src/graphql/formatDateTime.ts)'s `formatLocalDate`/`formatLocalTime` split a date-time into its date-only/time-only parts, rather than every place a meeting's time appears rendering two full date-times side by side (which would repeat the same date pointlessly). Every place a meeting's start/end appears follows this:

- [MeetingDetailsPage](webapp/src/pages/MeetingDetailsPage.tsx) shows a "Date" row (`formatLocalDate`) and a "Time" row (`formatLocalTime` for both start and end, joined as a `–`-separated range) - this used to be separate "Start"/"End" rows each showing the full date-time, repeating the date.
- [RoomAvailabilityPage](webapp/src/pages/RoomAvailabilityPage.tsx)'s meeting-block tooltip, [PersonCalendarPage](webapp/src/pages/PersonCalendarPage.tsx)'s per-day meeting rows, and [HomePage](webapp/src/pages/HomePage.tsx)'s "Today"/"Tomorrow" agenda lists all already showed a time-only `–`-separated range (never the date) next to a date that's already established by the surrounding view - the date picker above the room grid, the calendar's day cell, or the "Today"/"Tomorrow" heading itself. These needed no change; `MeetingDetailsPage` was the one place not yet following the convention the rest of the app already used.

### Validation: client vs server

All rules are **enforced server-side** by the API's Lambda handlers (see the [API README](../mootmaker-api/README.md)); the frontend re-states none of them and simply displays whatever errors come back. Client-side, the UI only *prevents* invalid input where it can do so cheaply: the meeting time pickers offer only 15-minute-boundary minutes, room/organiser/attendees are chosen from dropdowns of existing records (organiser and attendees additionally kept mutually exclusive - see [Organiser/attendee mutual exclusivity](#organiserattendee-mutual-exclusivity) above), and the capacity field is numeric. Anything that slips through (e.g. an overlapping meeting, or a blank room name) is caught by the server and shown in the banner.

## Hosting

The production build is a set of static files served from a **private S3 bucket** behind a **CloudFront distribution**:

- The bucket blocks all public access; CloudFront reads it via an Origin Access Control, so the bucket is only reachable through the CDN.
- CloudFront redirects HTTP→HTTPS and uses `PriceClass_100` (cheapest edge locations).
- S3 403/404 responses are rewritten to `/index.html` with a 200 status so deep links to client-side routes (e.g. `/meetings/add`) load the SPA instead of erroring.

Like the API, hosting scales to zero: S3 storage pennies plus per-request CloudFront charges, no fixed-cost resources (Route53/ACM cost is covered under [mootmaker-domain](https://github.com/geoffweatherall/mootmaker-domain)).

### Custom domain

Each environment deploys behind its own hostname under `mootmaker.com`:
`production` gets `www.mootmaker.com`, every other environment gets
`www.<environment>.mootmaker.com` (see [domain.tf](deploy/terraform/domain.tf)
for why each environment provisions its own certificate rather than sharing
one wildcard). `deploy.sh`/`undeploy.sh` refuse any environment name that
starts with `prod` but isn't exactly `production`, to avoid a typo silently
landing on a production-looking-but-not-actually-production subdomain. The
bare apex `mootmaker.com` redirects to `www.mootmaker.com` -
see [mootmaker-domain](https://github.com/geoffweatherall/mootmaker-domain),
which must already be deployed (nameservers configured at the registrar,
delegation propagated) before this project's certificate can validate.

## Build, run, deploy

Prerequisites: Node.js + npm, Terraform ≥ 1.10, AWS credentials, and a deployed `mootmaker-api` in the sibling directory.

Like the API, `deploy.sh`/`undeploy.sh` take an **environment** name (e.g.
`test`, `production`, or your own name) and talk to the `mootmaker-api`
deployment of that same environment — see the [mootmaker project README](https://github.com/geoffweatherall/mootmaker#multi-environment-deployments)
for the full multi-environment how-to.

### Local development

```bash
cd webapp
cp .env.example .env        # then fill in real values: source the API project's
                            # authenticate.sh <environment> and copy GRAPHQL_API_URL,
                            # COGNITO_USER_POOL_ID, COGNITO_WEBAPP_CLIENT_ID,
                            # DEMO_USER_EMAIL and DEMO_USER_PASSWORD into the
                            # five VITE_ variables.
npm install
npm run dev                 # Vite dev server on http://localhost:5173
npm run lint                # oxlint
npm run build               # type-check (tsc -b) + production build into dist/
```

### Deploy / undeploy

`./deploy.sh <environment>` performs, in order:

1. Sources the API project's `authenticate.sh <environment>` to obtain `GRAPHQL_API_URL`, the `COGNITO_*` variables, and the `DEMO_*` demo-user credentials from that environment's Terraform outputs (fails fast if the API checkout or that environment's deployment is missing).
2. `terraform init` (state key `<environment>/mootmaker-webapp/terraform.tfstate`) + `terraform apply -auto-approve -var="environment=<environment>"` in [deploy/terraform](deploy/terraform) to create/update the S3 bucket and CloudFront distribution.
3. Writes `webapp/.env.production` with the API URL, Cognito user pool id, webapp client id, and demo user email/password.
4. `npm install` and `npm run build` to produce `webapp/dist/`.
5. `aws s3 sync webapp/dist s3://<bucket> --delete` to upload the build and remove stale files.
6. Creates a CloudFront invalidation for `/*` so the new version is served immediately, then prints the site URL.

`./undeploy.sh <environment>` runs `terraform destroy` (with interactive confirmation) — it deletes that environment's distribution and bucket including all uploaded assets.

## Tests

See [testing-strategy.md](testing-strategy.md) for the overall testing approach for this repo, and [mootmaker's testing-strategy.md](https://github.com/geoffweatherall/mootmaker/blob/main/testing-strategy.md) for how it fits the wider project. Four layers in total: the two below are fully local (neither needs a deployed API, a live AWS environment, or real Cognito credentials) and live under `webapp/`; [e2e/](e2e/) and [acceptance/](acceptance/), at the repo root alongside `webapp/`, both run against a genuinely deployed environment instead — see testing-strategy.md for those.

**Unit tests (Vitest):**

```bash
cd webapp
npm run test:unit
```

Pure-logic tests, no browser and no network — seconds to run. Covers [formatDateTime.ts](webapp/src/graphql/formatDateTime.ts)'s date/time splitting, the `ROOM_ERROR_MESSAGES`/`MEETING_ERROR_MESSAGES`/`PERSON_ERROR_MESSAGES` maps and [errorMessages.ts](webapp/src/graphql/errorMessages.ts)'s flattening of Apollo errors, [theme/roomColor.ts](webapp/src/theme/roomColor.ts)'s palette assignment/wraparound and contrast-based text colour, and [addMeetingLogic.ts](webapp/src/pages/addMeetingLogic.ts) — the organiser/attendee mutual-exclusivity filtering and the suggested-room caching state machine described in [Organiser/attendee mutual exclusivity](#organiserattendee-mutual-exclusivity) and [Suggested-room caching](#suggested-room-caching) above, extracted out of `AddMeetingPage.tsx` specifically so they're testable without rendering the component or mocking Apollo.

**Integration tests (Playwright), against a mocked API:**

```bash
cd webapp
npm run test:integration
```

Playwright starts a dev server on port 5173 running in a distinct Vite mode (`npm run dev:mock`, i.e. `vite --mode mock` — see [playwright.config.ts](webapp/playwright.config.ts)) and drives Chrome against it. This mode swaps in two test-only doubles, at the two seams testing-strategy.md's "Integration tests" section describes:

- **MSW** ([mockServiceWorker.js](webapp/public/mockServiceWorker.js), handlers in [src/testSupport/mocks/](webapp/src/testSupport/mocks/)) intercepts the app's GraphQL calls at the real network layer — a genuine Service Worker in the browser — rather than replacing Apollo Client's internals. The app still builds its requests through the real `HttpLink`/`SetContextLink` pipeline in [apolloClient.ts](webapp/src/apolloClient.ts); only what's on the other end of the wire is fake. [src/testSupport/mocks/fixtures.ts](webapp/src/testSupport/mocks/fixtures.ts) holds the small fixed data set (3 rooms, 5 people) the suite runs against; meetings created during a test are persisted to `sessionStorage` so they survive a real browser navigation (a full page load re-evaluates every JS module, including the in-memory parts of the mock), not just SPA client-side routing.
- **A mocked Cognito module** ([src/auth/cognito.mock.ts](webapp/src/auth/cognito.mock.ts), swapped in for `./cognito`/`../auth/cognito`/`./auth/cognito` by [vite.config.ts](webapp/vite.config.ts)'s mode-gated `resolve.alias`) stands in for [auth/cognito.ts](webapp/src/auth/cognito.ts) — the one module that actually talks to Cognito. Cognito's SRP sign-in exchange is genuinely cryptographic and isn't reasonably fakeable at the network layer the way a JSON GraphQL API is (see testing-strategy.md), so the swap happens one level up, at the same seam [AuthProvider.tsx](webapp/src/auth/AuthProvider.tsx) already funnels every Cognito interaction through — `AuthProvider` itself, and every page, are completely unchanged in this mode. A small fixed pair of fixture accounts (an e2e user with no linked Person, and a demo user with one — see the doc comment on `MOCK_USERS`) covers everything the suite needs; a mock session is persisted to `localStorage` so it survives Playwright's `storageState` snapshot/restore between the `setup` project and the tests that reuse its session, the same way a real Cognito session would via its own cached tokens.

Because most pages require sign-in, the suite has a **setup project** ([tests/auth.setup.ts](webapp/tests/auth.setup.ts)) that signs in through the real form as the fixture e2e user and saves the browser session; the main test project starts from that session.

- [tests/auth.spec.ts](webapp/tests/auth.spec.ts) runs signed-out (it discards the saved session) and covers the auth rules: the home page is public, every other route redirects to `/signin`, sign-in returns you to the page you were heading to, sign-out locks the app again, and a wrong password or unknown email shows an error.
- [tests/forgot-password.spec.ts](webapp/tests/forgot-password.spec.ts) also runs signed-out and covers the reset flow: the sign-in form links to it, requesting a code advances to the code + new-password step, a wrong code is rejected, and — now that the "emailed" code is a fixed, known mock value rather than something only a real inbox can read — the full success path (correct code resets the password and signs the user in automatically) too.
- [tests/calendar-menu.spec.ts](webapp/tests/calendar-menu.spec.ts) covers the sidebar's "Calendar" nav item while the signed-in user's `personId` is still resolving (stays enabled, shows a spinner instead of navigating early if clicked mid-flight) for both an account with no linked Person and one with — deterministically, by gating the mocked `MyPerson` operation open on demand rather than racing the (near-instant, mocked) network.
- [tests/meeting-form.spec.ts](webapp/tests/meeting-form.spec.ts) covers the Add Meeting form's time pickers — asserting that only 15-minute-boundary minutes are offered, matching the API's meeting rule — and that every field, including the room, is present on the single form with no step navigation.
- [tests/suggest-room.spec.ts](webapp/tests/suggest-room.spec.ts) covers the home page's "Add Meeting" entry point, and the "Suggest a room" button: that repeated clicks step through the cached ranked list without repeating a room until it wraps around, and that requiring more capacity than any fixture room has shows the inline "no room available" message instead of changing the selection.
- [tests/organiser-attendee-exclusivity.spec.ts](webapp/tests/organiser-attendee-exclusivity.spec.ts) covers the Organiser/Attendees dropdown filtering described in [Organiser/attendee mutual exclusivity](#organiserattendee-mutual-exclusivity) above — see that section for the one related case it deliberately doesn't cover, and why.
- [tests/meeting-details.spec.ts](webapp/tests/meeting-details.spec.ts) covers [MeetingDetailsPage](webapp/src/pages/MeetingDetailsPage.tsx)'s "Date" + "Time" rows described in [Date/time display](#datetime-display) above, by creating a meeting and then viewing it via its organiser's Person Calendar. Pins the browser's clock to a known weekday (`page.clock.setFixedTime` — real timers still run, only `Date.now()`/`new Date()` are fixed) since Person Calendar only ever shows Monday–Friday; without that, the test would flake whenever it happened to run on a weekend.

`.env.mock` (committed — no secrets, no real infrastructure) configures this mode: a same-origin `VITE_GRAPHQL_API_URL` MSW intercepts, and `VITE_DEMO_USER_EMAIL`/`PASSWORD` matching `cognito.mock.ts`'s demo fixture account so the home page's pre-filled sign-in form works the same way it does against a real deployment.
