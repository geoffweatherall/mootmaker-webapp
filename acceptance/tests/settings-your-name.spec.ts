import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount } from '../../support/testAccount'
import { signInAsNoPersonUser } from './support/accounts'
import { expect, test } from './support/test'

// mootmaker/docs/reference/use-cases.md, section I (Settings - Your name), cases 74-76.
//
// I.74 and I.75 deliberately use a fresh signed-up account rather than a fixture user: tests never
// change the fixture users (./support/accounts.ts), and renaming is exactly such a change.
// createConfirmedTestAccount gives a real, working, Person-linked standard account cheaply, without
// needing the real sign-up UI or an emailed code (this isn't itself testing sign-up - see
// acceptance/README.md's "Which account to sign in as").
// The Settings page has several Save buttons - one per section - so every one of them has to be
// scoped. Scoped by the section element containing the section's own heading: giving the sections
// aria-labels instead was tried and actively broke things, because getByLabel matches substrings,
// so a region named "Your name" also answered to getByLabel('Name').
function yourNameSection(page: Page) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: 'Your name' }) })
}


test('I.74: updating your own display name saves, toasts, and updates the sidebar immediately without a reload', async ({
  page,
}) => {
  const account = freshTestAccount()
  await createConfirmedTestAccount(account)
  const newName = `Renamed ${randomUUID()}`

  await page.goto('/signin')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()

  await page.goto('/settings')
  await expect(page.getByLabel('Name')).toHaveValue(account.name)

  await page.getByLabel('Name').fill(newName)
  await yourNameSection(page).getByRole('button', { name: 'Save' }).click()

  // Success toast.
  await expect(page.getByText('Your name was updated.')).toBeVisible()

  // The sidebar's own account-name display (AccountBox) updates immediately, driven by the same
  // AuthContext the Settings form just refreshed via refreshPerson() - no page.reload() anywhere
  // in this test, so this is only possible if the update actually propagates live.
  await expect(page.getByText(newName)).toBeVisible()

  // Persisted, not just local component state: navigating away and back still shows it.
  await page.goto('/')
  await page.goto('/settings')
  await expect(page.getByLabel('Name')).toHaveValue(newName)
})

test('I.75: submitting a blank name is rejected and leaves the stored name unchanged', async ({ page }) => {
  const account = freshTestAccount()
  await createConfirmedTestAccount(account)

  await page.goto('/signin')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()

  await page.goto('/settings')
  await expect(page.getByLabel('Name')).toHaveValue(account.name)

  await page.getByLabel('Name').fill('')
  await yourNameSection(page).getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Name must not be blank.')).toBeVisible()

  // Nothing was actually saved - reloading (a fresh fetch of the Person record) shows the
  // original name still in the field, not the blanked-out one.
  await page.reload()
  await expect(page.getByLabel('Name')).toHaveValue(account.name)
})

test('I.76: the Your name section is disabled with an explanatory note for an account with no linked Person', async ({
  page,
}) => {
  await signInAsNoPersonUser(page)

  await page.goto('/settings')

  await expect(page.getByLabel('Name')).toBeDisabled()
  await expect(yourNameSection(page).getByRole('button', { name: 'Save' })).toBeDisabled()
  await expect(
    page.getByText("Your account has no linked person yet, so your name can't be changed here."),
  ).toBeVisible()
})
