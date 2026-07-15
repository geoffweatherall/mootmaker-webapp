# room-booking-webapp

A project that is part of my [Claude Code exploration](https://github.com/geoffweatherall/room-booking).

## Details

A single-page web application for the [room-booking-api](https://github.com/geoffweatherall/room-booking-api) GraphQL API. It lets users add persons, rooms, and bookings, and browse existing bookings through a daily room-availability view and a per-person calendar view. The app is a static build hosted on AWS (S3 + CloudFront) and talks directly to the AppSync GraphQL endpoint from the browser.

This checkout expects the `room-booking-api` project to be a **sibling directory** — the deploy script reads the API's URL and Cognito settings from its Terraform outputs.

Users must **sign in** (or sign up) with an email address and password before they can see any page other than the home page; see [Authentication](#authentication). Signing up also collects the user's name, which the API uses to automatically create a linked Person record once the account is confirmed (see the [room-booking-api README](https://github.com/geoffweatherall/room-booking-api#sign-up-creates-a-linked-person)) — so a new user can book something as themselves without needing to be added as a person first. The webapp no longer has a page for adding a guest person (someone without their own account) directly; the API's `createPerson` mutation still supports it for tooling such as [sample-data-generator](https://github.com/geoffweatherall/room-booking-tools/tree/main/sample-data-generator).

## Directory structure

| Path | Purpose |
|---|---|
| [webapp/](webapp/) | The React application (Vite + TypeScript). All frontend source, tests, and build config live here. |
| [webapp/src/pages/](webapp/src/pages/) | One component per route — the calendar-style views (`RoomAvailabilityPage`, `PersonCalendarPage`), booking details (`BookingDetailsPage`), the add-forms (`AddRoomPage`, `AddBookingPage`), the auth forms (`SignInPage`, `SignUpPage`, `ForgotPasswordPage`), and `HomePage`. This is where page-level logic lives. |
| [webapp/src/auth/](webapp/src/auth/) | Everything Cognito: the promise wrappers around `amazon-cognito-identity-js` ([cognito.ts](webapp/src/auth/cognito.ts)), the React auth context/hook ([authContext.ts](webapp/src/auth/authContext.ts)), and its provider ([AuthProvider.tsx](webapp/src/auth/AuthProvider.tsx)). |
| [webapp/src/components/](webapp/src/components/) | Shared presentational components used across pages: `Layout` (app bar + nav + sign-in/out), `RequireAuth` (route guard), `SignInForm` (the sign-in fields + submit logic shared by SignInPage and the signed-out home page), `ErrorBanner`, `SuccessToast`, `SubmitButton`. |
| [webapp/src/graphql/](webapp/src/graphql/) | Everything about talking to the API: query/mutation documents, TypeScript types mirroring the schema, error-code → message maps, and date formatting. |
| [webapp/src/hooks/](webapp/src/hooks/) | Shared hooks; currently `useLocationToast`, which shows a one-shot success toast after navigation. |
| [webapp/tests/](webapp/tests/) | Playwright end-to-end tests. |
| [deploy/terraform/](deploy/terraform/) | Terraform for the hosting infrastructure: S3 bucket ([s3.tf](deploy/terraform/s3.tf)) and CloudFront distribution ([cloudfront.tf](deploy/terraform/cloudfront.tf)). All resource names are prefixed with `<environment>-<project_name>` ([locals.tf](deploy/terraform/locals.tf)) so multiple environments can coexist in one AWS account. State is stored remotely in S3, one state file per environment ([backend.hcl](deploy/terraform/backend.hcl) — see the [room-booking-bootstrap-terraform](https://github.com/geoffweatherall/room-booking-bootstrap-terraform) README for how that bucket is set up, and the [room-booking project README](https://github.com/geoffweatherall/room-booking#multi-environment-deployments) for the multi-environment design). |
| [deploy.sh](deploy.sh) / [undeploy.sh](undeploy.sh) | Deploy and tear down (see below). |

The `src/` layout follows the conventional React "group by file type" pattern (pages / components / hooks / api-layer) described in the [React FAQ on file structure](https://legacy.reactjs.org/docs/faq-structure.html#grouping-by-file-type), on top of a standard [Vite React scaffold](https://vite.dev/guide/).

## Architecture

- **React 19** with **TypeScript**, built by **Vite**. Strict-mode SPA, no server-side rendering — everything runs in the browser.
- **MUI (Material UI) v9** provides the design language: `CssBaseline` and standard components — `AppBar` navigation, `Paper`-wrapped forms and tables, `Alert`/`Snackbar` for feedback. **MUI X Date Pickers** (with **dayjs**) provide the booking time pickers.
- **Branding**: the theme's palette is built from the [room-booking project's brand tokens](https://github.com/geoffweatherall/room-booking/tree/main/branding) ([theme/tokens.ts](webapp/src/theme/tokens.ts), [theme/theme.ts](webapp/src/theme/theme.ts)), with a light/dark toggle in the app bar ([theme/ThemeModeProvider.tsx](webapp/src/theme/ThemeModeProvider.tsx)) that defaults to the OS's `prefers-color-scheme` and otherwise remembers an explicit choice in `localStorage`. The brand mark (`assets/logo.svg`) appears in the app bar next to the app name, and its `icon.svg` variant is the favicon.
- **React Router v7** does client-side routing. Routes are declared in [App.tsx](webapp/src/App.tsx): `/`, `/signin`, `/signup` and `/forgot-password` are public; `/persons/:personId/calendar`, `/rooms/add`, `/rooms/:date/availability`, `/bookings/add` and `/bookings/:bookingId` are wrapped in the `RequireAuth` guard; unknown paths redirect to `/`. There are no top-level list pages for people, rooms, or bookings, and no page for adding a person — the nav bar's "Availability" and "Calendar" items go straight to `RoomAvailabilityPage` and `PersonCalendarPage` instead, the latter defaulting to the signed-in user's own linked Person. If there isn't one, "Calendar" is disabled rather than falling back to someone else's calendar (see [Home page](#home-page) below). `RoomAvailabilityPage` doubles as the entry point for adding a room or a booking (`AddRoomPage`/`AddBookingPage`), since there's no longer a dedicated rooms list to host those buttons.
- **amazon-cognito-identity-js** talks to the Cognito user pool (SRP sign-in, sign-up, token storage/refresh in `localStorage`).
- **Apollo Client v4** handles all GraphQL communication and caching (`InMemoryCache`).
- **oxlint** for linting, **Playwright** for end-to-end tests.

### Main classes / where the logic is

There is deliberately little logic in the frontend; the backend owns the rules.

- [apolloClient.ts](webapp/src/apolloClient.ts) — the single Apollo client instance: an `HttpLink` to the endpoint behind a `SetContextLink` that attaches the signed-in user's JWT to every request.
- Page components in [src/pages/](webapp/src/pages/) hold the form state and submit handlers. [AddBookingPage.tsx](webapp/src/pages/AddBookingPage.tsx) is the most involved: it loads rooms and people for its dropdowns, defaults the start time to the next 5-minute boundary, and maps validation error codes to messages.
- [graphql/types.ts](webapp/src/graphql/types.ts) — TypeScript mirrors of the schema types plus the `ROOM_ERROR_MESSAGES` / `BOOKING_ERROR_MESSAGES` maps that translate backend error enums into user-facing text.
- [graphql/errorMessages.ts](webapp/src/graphql/errorMessages.ts) — flattens Apollo transport/GraphQL errors into displayable strings.
- [graphql/formatDateTime.ts](webapp/src/graphql/formatDateTime.ts) — renders the API's zone-less local date-times without letting the browser reinterpret them in its own time zone.

## Calling the API

The browser calls the AppSync GraphQL endpoint directly via Apollo Client. Every request carries the signed-in user's Cognito **JWT id token** in the `Authorization` header (attached by the `SetContextLink` in [apolloClient.ts](webapp/src/apolloClient.ts)); AppSync rejects requests without a valid token with HTTP 401. The endpoint URL, Cognito ids, and demo user credentials are baked into the bundle at build time from the Vite environment variables `VITE_GRAPHQL_API_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_DEMO_USER_EMAIL` and `VITE_DEMO_USER_PASSWORD` (see [.env.example](webapp/.env.example)); `deploy.sh` generates `webapp/.env.production` from the deployed API's Terraform outputs. None of these are secrets — the Cognito ids are public identifiers (the security lives in Cognito's password authentication and JWT signatures), and the demo credentials are *meant* to be public: this is a demo system, so the home page shows them to every signed-out visitor (see [Home page](#home-page) below).

### Authentication

Authentication is an **Amazon Cognito user pool** owned by the API project (see the [API README](../room-booking-api/README.md)); this app uses the pool's public `room-booking-webapp` app client via `amazon-cognito-identity-js`.

- **Sign up** ([SignUpPage](webapp/src/pages/SignUpPage.tsx)) is two steps: register a name, email + password (at least 10 characters with a lowercase letter and a number — deliberately loose, since this is a demo system, see the [API README](../room-booking-api/README.md#demo-user)), then enter the verification code Cognito emails. The name is sent to Cognito as the standard `name` user attribute. On confirmation the user is signed in automatically, and the API's PostConfirmation trigger creates a Person record for them in the background.
- **Sign in** ([SignInPage](webapp/src/pages/SignInPage.tsx), and the embedded [SignInForm](webapp/src/components/SignInForm.tsx) on the signed-out home page) authenticates with SRP (the password never leaves the browser in plain form). Tokens are cached in `localStorage` and refreshed transparently, so sessions survive page reloads.
- **Signed-in display name** ([AuthProvider](webapp/src/auth/AuthProvider.tsx)): the toolbar shows the caller's own `Person.name` (fetched via the API's `myPerson` query, which resolves it server-side from the JWT's `sub` claim), not the JWT's own `name` claim — the Person record is the single source of truth a future "change my name" feature would update, so reading it live avoids the two ever drifting apart. Falls back to the Cognito `name`/email attributes (read straight from the ID token, no round trip) until that query resolves, and permanently for accounts with no linked Person (e.g. the e2e test user and the demo user).
- **Forgot password** ([ForgotPasswordPage](webapp/src/pages/ForgotPasswordPage.tsx), linked from the sign-in form) is two steps: request a verification code for an email address, then enter the emailed code with a new password. On success the user is signed in with the new password automatically. Cognito's *prevent user existence errors* setting is enabled, so requesting a code for an unknown address behaves exactly like a real one — the form never reveals whether an account exists.
- **Route guarding**: only the home page and the two auth forms are public. [RequireAuth](webapp/src/components/RequireAuth.tsx) redirects signed-out visitors of any other route to `/signin`, remembering where they were heading and returning them there after sign-in.
- **App bar**: shows the signed-in user's email and a Sign out button (or a Sign in link). Signing out clears the Cognito session and the Apollo cache.
- The auth state (current user's email + sign-in/out functions) is provided by [AuthProvider](webapp/src/auth/AuthProvider.tsx) and read with the `useAuth()` hook; the promise-based Cognito wrappers live in [cognito.ts](webapp/src/auth/cognito.ts).

### Home page

[HomePage](webapp/src/pages/HomePage.tsx) shows entirely different content depending on sign-in state:

- **Signed out**: since every other page requires sign-in, there's nothing of the user's own to show yet. Instead the page leads with an embedded [SignInForm](webapp/src/components/SignInForm.tsx) pre-filled with the demo user's email and password (both shown as plain text alongside it, from `VITE_DEMO_USER_EMAIL`/`VITE_DEMO_USER_PASSWORD` — see [Calling the API](#calling-the-api) above) so a first-time visitor can sign in with one click, and a second section spelling out the three steps to sign up for a real account before the sign-up button. If those two env vars aren't set (e.g. a `.env` predating this feature), the credential display and pre-fill are skipped and the form is just left blank.
- **Signed in, with a linked Person**: "My Calendar" (the signed-in user's own [PersonCalendarPage](webapp/src/pages/PersonCalendarPage.tsx)) and "Rooms available today" buttons, plus two agenda lists — "Today" and "Tomorrow" — of the meetings the user is organising or attending, sorted by start time and linking to [BookingDetailsPage](webapp/src/pages/BookingDetailsPage.tsx).
- **Signed in, with no linked Person** (e.g. the demo user or the e2e test user, both created directly rather than through sign-up): an error `Alert` — "Your account hasn't been set up properly" — in place of "My Calendar" and the agenda lists, rather than guessing by falling back to some other person's data. [AuthProvider](webapp/src/auth/AuthProvider.tsx) exposes a `personLoading` flag alongside `personId` so this only renders once the `myPerson` lookup has actually finished, not during the brief window right after sign-in before it resolves. "Rooms available today" is unaffected, since it isn't tied to a Person.

### Error handling

Two kinds of errors reach the user, both rendered by the dismissible [ErrorBanner](webapp/src/components/ErrorBanner.tsx) (an MUI `Alert`) at the top of the page:

1. **Transport/GraphQL errors** (network failure, missing/expired token, server fault) surface through Apollo's `error` result and are flattened to messages by `errorMessages()`.
2. **Validation failures** are *not* GraphQL errors — the API returns a structured result (`CreateRoomResult` / `CreateBookingResult`) whose `errors` field lists broken-rule enum codes. The form pages map each code through `ROOM_ERROR_MESSAGES` / `BOOKING_ERROR_MESSAGES` to a human-readable message, so a rejected submission shows the complete list of problems in one banner.

On success, forms navigate to a relevant view (e.g. the day or person the new booking/room affects) and pass a message via router state; `useLocationToast` shows it as an auto-hiding `Snackbar` and clears the state so it doesn't reappear on refresh.

### Progress indicators

- Views show a centred `CircularProgress` on first load, and a slim `LinearProgress` above the content when refetching with cached data already on screen. Bookings change constantly, so booking queries use `cache-and-network` and refetch every visit; rooms and people change rarely, so those queries use `cache-first` and are fetched once per session (from the Apollo `InMemoryCache` on every visit after the first) — a full page refresh resets that in-memory cache and picks up any changes.
- [SubmitButton](webapp/src/components/SubmitButton.tsx) disables itself and shows an inline spinner while a mutation is in flight (Cancel is disabled too), preventing double submits.
- The booking form shows a spinner while loading the room/people reference data its dropdowns need.

### Validation: client vs server

All rules are **enforced server-side** by the API's Lambda handlers (see the [API README](../room-booking-api/README.md)); the frontend re-states none of them and simply displays whatever errors come back. Client-side, the UI only *prevents* invalid input where it can do so cheaply: the booking time pickers offer only 5-minute-boundary minutes, room/organiser/attendees are chosen from dropdowns of existing records, and the capacity field is numeric. Anything that slips through (e.g. an overlapping booking, or a blank room name) is caught by the server and shown in the banner.

## Hosting

The production build is a set of static files served from a **private S3 bucket** behind a **CloudFront distribution**:

- The bucket blocks all public access; CloudFront reads it via an Origin Access Control, so the bucket is only reachable through the CDN.
- CloudFront redirects HTTP→HTTPS, uses the default CloudFront certificate/domain, and `PriceClass_100` (cheapest edge locations).
- S3 403/404 responses are rewritten to `/index.html` with a 200 status so deep links to client-side routes (e.g. `/bookings/add`) load the SPA instead of erroring.

Like the API, hosting scales to zero: S3 storage pennies plus per-request CloudFront charges, no fixed-cost resources.

## Build, run, deploy

Prerequisites: Node.js + npm, Terraform ≥ 1.10, AWS credentials, and a deployed `room-booking-api` in the sibling directory.

Like the API, `deploy.sh`/`undeploy.sh` take an **environment** name (e.g.
`test`, `production`, or your own name) and talk to the `room-booking-api`
deployment of that same environment — see the [room-booking project README](https://github.com/geoffweatherall/room-booking#multi-environment-deployments)
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
2. `terraform init` (state key `<environment>/room-booking-webapp/terraform.tfstate`) + `terraform apply -auto-approve -var="environment=<environment>"` in [deploy/terraform](deploy/terraform) to create/update the S3 bucket and CloudFront distribution.
3. Writes `webapp/.env.production` with the API URL, Cognito user pool id, webapp client id, and demo user email/password.
4. `npm install` and `npm run build` to produce `webapp/dist/`.
5. `aws s3 sync webapp/dist s3://<bucket> --delete` to upload the build and remove stale files.
6. Creates a CloudFront invalidation for `/*` so the new version is served immediately, then prints the site URL.

`./undeploy.sh <environment>` runs `terraform destroy` (with interactive confirmation) — it deletes that environment's distribution and bucket including all uploaded assets.

## Tests

**End-to-end (Playwright):**

```bash
source ../room-booking-api/authenticate.sh test   # exports E2E_USER_EMAIL / E2E_USER_PASSWORD
cd webapp
npm run test:e2e
```

Playwright starts the Vite dev server on port 5173 automatically (or reuses one already running) and drives Chrome. Because most pages now require sign-in, the suite has a **setup project** ([tests/auth.setup.ts](webapp/tests/auth.setup.ts)) that signs in through the real form as the pre-confirmed test user the API project's Terraform creates (`E2E_USER_EMAIL` / `E2E_USER_PASSWORD`, exported by its `authenticate.sh`) and saves the browser session; the main test project starts from that session.

These browser tests use a real user, while the API project's acceptance tests use machine-to-machine (client_credentials) tokens — the API README's *Authentication in end-to-end tests* section explains both approaches and why each was chosen.

- [tests/auth.spec.ts](webapp/tests/auth.spec.ts) runs signed-out (it discards the saved session) and covers the auth rules: the home page is public, every other route redirects to `/signin`, sign-in returns you to the page you were heading to, sign-out locks the app again, and a wrong password shows an error.
- [tests/forgot-password.spec.ts](webapp/tests/forgot-password.spec.ts) also runs signed-out and covers the reset flow: the sign-in form links to it, requesting a code advances to the code + new-password step, and a wrong code is rejected. It deliberately uses an email with no account — thanks to *prevent user existence errors* the flow behaves identically to a real user's, so the test sends no email and can't hit per-user reset rate limits (the code-entry step with a *correct* code can't be automated without an inbox).
- [tests/booking-form.spec.ts](webapp/tests/booking-form.spec.ts) covers the Add Booking form's time pickers — asserting that only 5-minute-boundary minutes are offered, matching the API's booking rule.

Note the dev server needs a valid `webapp/.env` since the pages under test talk to the live API and user pool.

**Unit tests: there are none.** The frontend contains little logic beyond wiring (the rules live in the API, which has its own unit and acceptance tests), so coverage here is Playwright-only. If frontend logic grows (e.g. date maths beyond `nextFiveMinuteBoundary`), adding Vitest would be the natural next step.
