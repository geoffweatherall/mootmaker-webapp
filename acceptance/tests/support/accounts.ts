import { expect, type Page } from '@playwright/test'
import { requireEnv } from './env'

/**
 * The fixture accounts, and signing in as them (mootmaker-api#95, mootmaker-webapp#138).
 *
 * - **Standard user**: the default for every test. An ordinary, non-admin user with a Person.
 * - **Admin user**: only for tests that check admin functionality - managing rooms or people,
 *   granting admin, editing or cancelling someone else's meeting, admin-only UI.
 * - **No-person user**: a signed-in account with no linked Person, for the degraded paths.
 *
 * Database reset (run before every test - see ./test.ts) creates them if missing and repairs them
 * back to exactly this state, so a test may rely on that at its start and must never change them.
 * A test that changes the account itself (name, preferences, password, deletion) signs up a fresh
 * account instead - see freshTestAccount in the mootmaker-email-testing package.
 *
 * The demo user is not here on purpose. Only tests whose subject is the demo login itself (B.11,
 * D.21) use it, and they read DEMO_USER_EMAIL/DEMO_USER_PASSWORD directly.
 */
export interface Credentials {
  email: string
  password: string
}

export function standardUser(): Credentials {
  return { email: requireEnv('E2E_STANDARD_USER_EMAIL'), password: requireEnv('E2E_STANDARD_USER_PASSWORD') }
}

export function adminUser(): Credentials {
  return { email: requireEnv('E2E_ADMIN_USER_EMAIL'), password: requireEnv('E2E_ADMIN_USER_PASSWORD') }
}

export function noPersonUser(): Credentials {
  return { email: requireEnv('E2E_NO_PERSON_USER_EMAIL'), password: requireEnv('E2E_NO_PERSON_USER_PASSWORD') }
}

/** The names reset gives the fixture users' Persons (see mootmaker-api's cognito.tf). */
export const STANDARD_USER_NAME = 'E2E Standard'
export const ADMIN_USER_NAME = 'E2E Admin'

export async function signIn(page: Page, credentials: Credentials): Promise<void> {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(credentials.email)
  await page.getByLabel('Password').fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
}

export async function signInAsStandardUser(page: Page): Promise<void> {
  await signIn(page, standardUser())
}

export async function signInAsAdminUser(page: Page): Promise<void> {
  await signIn(page, adminUser())
}

export async function signInAsNoPersonUser(page: Page): Promise<void> {
  await signIn(page, noPersonUser())
}

export async function signOut(page: Page): Promise<void> {
  await page.getByText('Sign out').click()
  await expect(page.getByText('Sign out')).toHaveCount(0)
}
