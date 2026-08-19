import { expect, test } from '@playwright/test'

// mootmaker/use-cases.md, section F (Add Meeting), case 38 - the happy path. Signs in as the
// demo user rather than creating a fresh account: it's a real, pre-verified Cognito account that
// already exists in every environment (see mootmaker-api/deploy/terraform/cognito.tf, "the demo
// user is the one always-present admin") with a linked Person already resolved, so this test can
// go straight to the thing it's actually about - adding a meeting - without needing sign-up or
// email verification at all (see acceptance/README.md's "Which account to sign in as").
//
// A fresh ephemeral environment has no rooms yet, so creating one via the real Settings UI is this
// test's own precondition - there's no Admin-API-style bypass for app data the way there is for
// Cognito accounts, and doing it through the real UI is no less realistic than a real admin would
// be. Uses a unique name so repeated runs against the same environment don't collide.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

test('add a meeting with all required fields succeeds and it appears on the room availability schedule', async ({
  page,
}) => {
  const demoEmail = requireEnv('DEMO_USER_EMAIL')
  const demoPassword = requireEnv('DEMO_USER_PASSWORD')
  // Real Date.now(), before pinning the clock below - run.sh supports iterating against an
  // already-deployed environment across repeated runs, so this still needs to be genuinely
  // unique each time, not just once per pinned-clock value.
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const roomName = `Acceptance Test Room ${runId}`
  const subject = `Acceptance test meeting ${runId}`

  // AddMeetingPage defaults the start time to the next 5-minute boundary from now - fine most of
  // the time, but RoomAvailabilityPage only ever renders business hours (08:00-17:00, see that
  // page's own "Showing business hours" note), so this test would flake whenever it happened to
  // run outside that window (caught for real: failed at 17:30 local time, the meeting was created
  // successfully but fell just outside the grid's visible range). Pinning just
  // Date.now()/new Date() (not the timers - setFixedTime keeps those running normally) to a known
  // time safely inside business hours makes that deterministic instead, matching the same fix
  // already used in webapp/tests/meeting-details.spec.ts for the same class of problem.
  await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))

  await page.goto('/signin')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()

  // Precondition: a room to book (see the file-level comment above). Scoped to the dialog - the
  // Settings page's own "Your name" section also has a field labelled "Name", so an unscoped
  // getByLabel('Name') matches both once the "Add room" dialog is open.
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Add room' }).click()
  const addRoomDialog = page.getByRole('dialog')
  await addRoomDialog.getByLabel('Name').fill(roomName)
  await addRoomDialog.getByLabel('Capacity').fill('4')
  await addRoomDialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(roomName)).toBeVisible()

  // The use case itself: add a meeting with all required fields. Organiser defaults to the
  // signed-in user's own Person (case 39) and the time fields default sensibly (case 40), so the
  // only fields this test needs to touch are the ones that don't have a usable default.
  await page.goto('/meetings/add')
  await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()

  await page.getByLabel('Subject').fill(subject)
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: roomName, exact: false }).click()
  await page.getByRole('button', { name: 'Save' }).click()

  // Success navigates to that day's room availability (case 38), with a confirmation toast -
  // both the navigation target and the meeting actually showing up there are asserted, not just
  // the toast text, since a toast passing while the meeting silently failed to persist would be a
  // false positive.
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
  await expect(page.getByText('Meeting was successfully scheduled.')).toBeVisible()
  await expect(page.getByText(subject)).toBeVisible()
})
