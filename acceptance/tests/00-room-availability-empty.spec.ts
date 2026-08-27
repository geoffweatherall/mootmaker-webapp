import { expect, test } from '@playwright/test'

// mootmaker/use-cases.md, section E (Room Availability), case 30 - "No rooms exist yet -> empty
// state." Named 00- (and the only test in this file) so it sorts and runs before any other spec
// in this suite that creates a room - see e-room-availability.md's tc-e30 Notes: rooms are never
// deleted through this app, so this precondition (zero rooms) can only ever be true once, right
// after a fresh environment is deployed, before any other test's own room-creation precondition
// runs. Do not add any other test to this file, and do not have it create a room.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

test('no rooms exist yet shows an empty state instead of the availability grid', async ({ page }) => {
  const demoEmail = requireEnv('DEMO_USER_EMAIL')
  const demoPassword = requireEnv('DEMO_USER_PASSWORD')

  await page.goto('/signin')
  await page.getByLabel('Email').fill(demoEmail)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()

  await page.goto('/rooms/2026-08-26/availability')

  await expect(page.getByText('No rooms exist yet.')).toBeVisible()
})
