# room-booking-webapp

A single-page web application for the [room-booking-api](../room-booking-api) GraphQL API. It lets users view and add persons, rooms, and bookings. The app is a static build hosted on AWS (S3 + CloudFront) and talks directly to the AppSync GraphQL endpoint from the browser.

This checkout expects the `room-booking-api` project to be a **sibling directory** — the deploy script reads the API's URL and key from its Terraform outputs.

## Directory structure

| Path | Purpose |
|---|---|
| [webapp/](webapp/) | The React application (Vite + TypeScript). All frontend source, tests, and build config live here. |
| [webapp/src/pages/](webapp/src/pages/) | One component per route — the list pages (`PersonsPage`, `RoomsPage`, `BookingsPage`), the add-forms (`AddPersonPage`, `AddRoomPage`, `AddBookingPage`), and `HomePage`. This is where page-level logic lives. |
| [webapp/src/components/](webapp/src/components/) | Shared presentational components used across pages: `Layout` (app bar + nav), `ErrorBanner`, `SuccessToast`, `SubmitButton`. |
| [webapp/src/graphql/](webapp/src/graphql/) | Everything about talking to the API: query/mutation documents, TypeScript types mirroring the schema, error-code → message maps, and date formatting. |
| [webapp/src/hooks/](webapp/src/hooks/) | Shared hooks; currently `useLocationToast`, which shows a one-shot success toast after navigation. |
| [webapp/tests/](webapp/tests/) | Playwright end-to-end tests. |
| [deploy/terraform/](deploy/terraform/) | Terraform for the hosting infrastructure: S3 bucket ([s3.tf](deploy/terraform/s3.tf)) and CloudFront distribution ([cloudfront.tf](deploy/terraform/cloudfront.tf)). |
| [deploy.sh](deploy.sh) / [undeploy.sh](undeploy.sh) | Deploy and tear down (see below). |

The `src/` layout follows the conventional React "group by file type" pattern (pages / components / hooks / api-layer) described in the [React FAQ on file structure](https://legacy.reactjs.org/docs/faq-structure.html#grouping-by-file-type), on top of a standard [Vite React scaffold](https://vite.dev/guide/).

## Architecture

- **React 19** with **TypeScript**, built by **Vite**. Strict-mode SPA, no server-side rendering — everything runs in the browser.
- **MUI (Material UI) v9** provides the design language: default Material theme (`createTheme()` with no customisation), `CssBaseline`, and standard components — `AppBar` navigation, `Paper`-wrapped forms and tables, `Alert`/`Snackbar` for feedback. **MUI X Date Pickers** (with **dayjs**) provide the booking time pickers.
- **React Router v7** does client-side routing. Routes are declared in [App.tsx](webapp/src/App.tsx): `/`, `/persons`, `/persons/add`, `/rooms`, `/rooms/add`, `/bookings`, `/bookings/add`; unknown paths redirect to `/`.
- **Apollo Client v4** handles all GraphQL communication and caching (`InMemoryCache`).
- **oxlint** for linting, **Playwright** for end-to-end tests.

### Main classes / where the logic is

There is deliberately little logic in the frontend; the backend owns the rules.

- [apolloClient.ts](webapp/src/apolloClient.ts) — the single Apollo client instance (endpoint + API key).
- Page components in [src/pages/](webapp/src/pages/) hold the form state and submit handlers. [AddBookingPage.tsx](webapp/src/pages/AddBookingPage.tsx) is the most involved: it loads rooms and people for its dropdowns, defaults the start time to the next 5-minute boundary, and maps validation error codes to messages.
- [graphql/types.ts](webapp/src/graphql/types.ts) — TypeScript mirrors of the schema types plus the `ROOM_ERROR_MESSAGES` / `BOOKING_ERROR_MESSAGES` maps that translate backend error enums into user-facing text.
- [graphql/errorMessages.ts](webapp/src/graphql/errorMessages.ts) — flattens Apollo transport/GraphQL errors into displayable strings.
- [graphql/formatDateTime.ts](webapp/src/graphql/formatDateTime.ts) — renders the API's zone-less local date-times without letting the browser reinterpret them in its own time zone.

## Calling the API

The browser calls the AppSync GraphQL endpoint directly via Apollo Client. **Authentication** is the AppSync API key, sent as an `x-api-key` header on every request. The endpoint URL and key are baked into the bundle at build time from the Vite environment variables `VITE_GRAPHQL_API_URL` and `VITE_GRAPHQL_API_KEY` (see [.env.example](webapp/.env.example)); `deploy.sh` generates `webapp/.env.production` from the deployed API's Terraform outputs. Note this means the API key is public to anyone using the site — acceptable here because the API is a demo with no per-user data.

### Error handling

Two kinds of errors reach the user, both rendered by the dismissible [ErrorBanner](webapp/src/components/ErrorBanner.tsx) (an MUI `Alert`) at the top of the page:

1. **Transport/GraphQL errors** (network failure, bad API key, server fault) surface through Apollo's `error` result and are flattened to messages by `errorMessages()`.
2. **Validation failures** are *not* GraphQL errors — the API returns a structured result (`CreateRoomResult` / `CreateBookingResult`) whose `errors` field lists broken-rule enum codes. The form pages map each code through `ROOM_ERROR_MESSAGES` / `BOOKING_ERROR_MESSAGES` to a human-readable message, so a rejected submission shows the complete list of problems in one banner.

On success, forms navigate to the relevant list page and pass a message via router state; `useLocationToast` shows it as an auto-hiding `Snackbar` and clears the state so it doesn't reappear on refresh.

### Progress indicators

- List pages show a centred `CircularProgress` on first load, and a slim `LinearProgress` above the table when refetching with cached data already on screen (`cache-and-network` fetch policy).
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

Prerequisites: Node.js + npm, Terraform ≥ 1.5, AWS credentials, and a deployed `room-booking-api` in the sibling directory.

### Local development

```bash
cd webapp
cp .env.example .env        # then fill in real values, e.g. from:
                            #   (cd ../../room-booking-api && source authenticate.sh)
npm install
npm run dev                 # Vite dev server on http://localhost:5173
npm run lint                # oxlint
npm run build               # type-check (tsc -b) + production build into dist/
```

### Deploy / undeploy

`./deploy.sh` performs, in order:

1. Sources the API project's `authenticate.sh` to obtain `GRAPHQL_API_URL` / `GRAPHQL_API_KEY` from its Terraform outputs (fails fast if the API checkout or deployment is missing).
2. `terraform init` + `terraform apply -auto-approve` in [deploy/terraform](deploy/terraform) to create/update the S3 bucket and CloudFront distribution.
3. Writes `webapp/.env.production` with the API URL and key.
4. `npm install` and `npm run build` to produce `webapp/dist/`.
5. `aws s3 sync webapp/dist s3://<bucket> --delete` to upload the build and remove stale files.
6. Creates a CloudFront invalidation for `/*` so the new version is served immediately, then prints the site URL.

`./undeploy.sh` runs `terraform destroy` (with interactive confirmation) — it deletes the distribution and the bucket including all uploaded assets.

## Tests

**End-to-end (Playwright):**

```bash
cd webapp
npm run test:e2e
```

Playwright starts the Vite dev server on port 5173 automatically (or reuses one already running) and drives Chrome. The current suite ([tests/booking-form.spec.ts](webapp/tests/booking-form.spec.ts)) covers the Add Booking form's time pickers — asserting that only 5-minute-boundary minutes are offered, matching the API's booking rule. Note the dev server needs a valid `webapp/.env` since the pages it tests query the live API for reference data.

**Unit tests: there are none.** The frontend contains little logic beyond wiring (the rules live in the API, which has its own unit and acceptance tests), so coverage here is Playwright-only. If frontend logic grows (e.g. date maths beyond `nextFiveMinuteBoundary`), adding Vitest would be the natural next step.
