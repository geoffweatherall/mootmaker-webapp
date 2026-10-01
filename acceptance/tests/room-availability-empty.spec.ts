import { signInAsStandardUser } from './support/accounts'
import { expect, test } from './support/test'

// mootmaker/docs/reference/use-cases.md, section E (Room Availability), case 30 - "No rooms exist
// yet -> empty state." Valid in any position in the run: the environment is reset before every
// test (./support/test.ts), and reset deletes every room.
test('no rooms exist yet shows an empty state instead of the availability grid', async ({ page }) => {
  await signInAsStandardUser(page)

  await page.goto('/rooms/2026-08-26/availability')

  // role=img, not getByText: EmptyState's icon carries the same message as its own (decorative)
  // SVG <title> - see components/EmptyState.tsx's titleAccess - which getByText also matches
  // regardless of visibility, so a bare getByText hits a strict-mode violation against both.
  await expect(page.getByRole('img', { name: 'No rooms exist yet.' })).toBeVisible()
})
