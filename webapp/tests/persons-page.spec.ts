import { test, expect, type Page } from '@playwright/test'
import { ADMIN_USER, DEMO_USER } from '../src/auth/cognito.mock'
import { forceCognitoSyncFailureOnce } from './support/mockControls'

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

test.describe('Persons page', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a standard user has no Persons link and cannot reach the page directly', async ({ page }) => {
    await signIn(page, DEMO_USER)
    await expect(page.getByRole('link', { name: 'Persons' })).toHaveCount(0)
    await page.goto('/persons')
    await expect(page).toHaveURL('/')
  })

  test('an admin can add, edit and remove a person', async ({ page }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()
    await expect(page.getByRole('heading', { name: 'Persons', level: 1 })).toBeVisible()
    await expect(page.getByText('Alice Anderson')).toBeVisible()

    await page.getByRole('button', { name: 'Add person' }).click()
    await page.getByRole('textbox', { name: 'Name' }).fill('Erana Ngata')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Erana Ngata')).toBeVisible()

    await page.getByRole('button', { name: 'Edit Erana Ngata' }).click()
    await page.getByRole('textbox', { name: 'Name' }).fill('Erana Ngata-Smith')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Erana Ngata-Smith')).toBeVisible()

    await page.getByRole('button', { name: 'Remove Erana Ngata-Smith' }).click()
    await expect(page.getByRole('heading', { name: 'Remove Erana Ngata-Smith?' })).toBeVisible()
    await page.getByRole('button', { name: 'Remove person' }).click()
    await expect(page.getByText('Erana Ngata-Smith')).toHaveCount(0)
  })

  test('shows the admin badge and linked emails, and "Not signed up yet" for a guest', async ({ page }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()

    const danaCard = page
      .getByText('Dana Diaz', { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
    await expect(danaCard.getByText('Admin')).toBeVisible()
    await expect(danaCard.getByText(ADMIN_USER.email)).toBeVisible()

    const aliceCard = page
      .getByText('Alice Anderson', { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
    await expect(aliceCard.getByText('Not signed up yet')).toBeVisible()
  })

  test('the admin switch is disabled with an explanation for a person with no linked account', async ({ page }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()
    await page.getByRole('button', { name: 'Edit Alice Anderson' }).click()

    await expect(page.getByRole('switch', { name: 'Admin' })).toBeDisabled()
    await expect(page.getByText("hasn't signed in yet")).toBeVisible()
  })

  test('the admin switch is disabled for the signed-in admin\'s own person', async ({ page }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()
    await page.getByRole('button', { name: 'Edit Dana Diaz' }).click()

    await expect(page.getByRole('switch', { name: 'Admin' })).toBeDisabled()
    await expect(page.getByText("can't change your own admin access")).toBeVisible()
  })

  test('grants admin access to a person with a linked account', async ({ page }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()
    await page.getByRole('button', { name: 'Edit Demo User' }).click()

    const adminSwitch = page.getByRole('switch', { name: 'Admin' })
    await expect(adminSwitch).toBeEnabled()
    await adminSwitch.check()
    await page.getByRole('button', { name: 'Save' }).click()

    const demoCard = page
      .getByText('Demo User', { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
    await expect(demoCard.getByText('Admin')).toBeVisible()
  })

  test('a partial success (cognitoSyncFailed) prompts to retry or cancel, and Retry re-sends the same change', async ({
    page,
  }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()
    await page.getByRole('button', { name: 'Edit Demo User' }).click()
    await page.getByRole('switch', { name: 'Admin' }).check()

    await forceCognitoSyncFailureOnce(page)
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('heading', { name: 'Sync to sign-in failed' })).toBeVisible()
    await expect(page.getByText("couldn't be synced to their sign-in account")).toBeVisible()

    // The DynamoDB write already succeeded before the prompt appeared, so the card reflects it
    // even though sync hasn't - matching the design doc's "stands as already saved" reasoning.
    const demoCard = page
      .getByText('Demo User', { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
    await expect(demoCard.getByText('Admin')).toBeVisible()

    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('heading', { name: 'Sync to sign-in failed' })).toHaveCount(0)
  })

  test('Cancel on the sync-failed prompt leaves the already-saved change in place with no further prompt', async ({
    page,
  }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()
    await page.getByRole('button', { name: 'Edit Demo User' }).click()
    await page.getByRole('switch', { name: 'Admin' }).check()

    await forceCognitoSyncFailureOnce(page)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: 'Sync to sign-in failed' })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Sync to sign-in failed' })).toHaveCount(0)
    const demoCard = page
      .getByText('Demo User', { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
    await expect(demoCard.getByText('Admin')).toBeVisible()
  })

  test('rejects an empty name', async ({ page }) => {
    await signIn(page, ADMIN_USER)
    await page.getByRole('link', { name: 'Persons' }).click()
    await page.getByRole('button', { name: 'Add person' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Name must not be blank.')).toBeVisible()
  })
})
