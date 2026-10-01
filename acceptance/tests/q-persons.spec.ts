import type { Page } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount } from '../../support/testAccount'
import { ADMIN_USER_NAME, adminUser, signIn, signInAsAdminUser, signInAsStandardUser } from './support/accounts'
import { uniqueId } from './support/env'
import { formatDateParam, pinnedWeekday } from './support/pinnedDates'
import { expect, test } from './support/test'

const PINNED_NOW = pinnedWeekday('Wednesday')

// mootmaker/docs/reference/use-cases.md, section Q (Persons, admin only), cases 132-143. See
// acceptance/test-cases/q-persons.md for the full per-case Given/When/Then/Steps/Assertions this
// file implements one at a time. Supersedes section K (k-settings-people.md /
// settings-people.spec.ts) now that People has moved out of Settings to its own top-level Persons
// page - see the admin-rooms-and-people design doc. Every case except Q.132 (standard user) signs
// in as the admin fixture user, since managing people is the subject (./support/accounts.ts). A standard user forcing renamePerson/setPersonAdmin/deletePerson directly
// is covered once, comprehensively, by L.90 rather than repeated here.

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
}

/** The Persons page's card for a given person name. */
/** Scoped to `main`, not just the nearest MuiPaper-root ancestor - the signed-in admin's own name
 * also appears in the nav sidebar's account area, itself inside a MuiPaper-root (the Drawer), so an
 * unscoped search is ambiguous whenever a test looks up the admin's own card (Q.137, Q.140,
 * Q.142). */
function personCard(page: Page, name: string) {
  return page
    .getByRole('main')
    .getByText(name, { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
}

/** Creates a guest person (no Cognito account) via the real Persons page. */
async function createPerson(page: Page, name: string) {
  await page.goto('/persons')
  await page.getByRole('button', { name: 'Add person' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

interface CreateMeetingOptions {
  subject: string
  roomName: string
  organiserName?: string
  attendeeNames?: string[]
}

async function createMeeting(page: Page, { subject, roomName, organiserName, attendeeNames = [] }: CreateMeetingOptions): Promise<void> {
  await page.goto('/meetings/add')
  await page.getByLabel('Subject').fill(subject)
  if (organiserName) {
    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await page.getByRole('option', { name: organiserName, exact: true }).click()
  }
  for (const attendeeName of attendeeNames) {
    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await page.getByRole('option', { name: attendeeName, exact: true }).click()
    await page.keyboard.press('Escape')
  }
  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option', { name: roomName, exact: false }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/rooms\/.+\/availability/)
}

test.describe('Q. Persons (admin only)', () => {
  test('Q.132 - standard user has no Persons nav link and cannot reach the page directly', async ({ page }) => {
    await signInAsStandardUser(page)
    await expect(page.getByRole('link', { name: 'Persons' })).toHaveCount(0)

    await page.goto('/persons')
    await expect(page).toHaveURL('/')
  })

  test('Q.133 - admin adds a guest person; usable as organiser/attendee/calendar subject', async ({ page }) => {
    const runId = uniqueId()
    const personName = `Q133 Guest ${runId}`

    await signInAsAdminUser(page)
    await createPerson(page, personName)

    await page.goto('/meetings/add')
    await page.getByRole('combobox', { name: 'Organiser' }).click()
    await expect(page.getByRole('option', { name: personName, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('combobox', { name: 'Attendees' }).click()
    await expect(page.getByRole('option', { name: personName, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('link', { name: 'Calendar', exact: true }).click()
    await expect(page).toHaveURL(/\/persons\/.+\/calendar/)
    await page.getByRole('combobox', { name: 'Person' }).click()
    await expect(page.getByRole('option', { name: personName, exact: true })).toBeVisible()
  })

  test('Q.134 - blank person name is rejected', async ({ page }) => {
    await signInAsAdminUser(page)
    await page.goto('/persons')
    await page.getByRole('button', { name: 'Add person' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByText('Name must not be blank.')).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  test('Q.135 - admin renames a Cognito-linked person: propagates to their sidebar and meetings', async ({ page, api }) => {
    const runId = uniqueId()
    const account = { ...freshTestAccount(), name: `Q135 Person ${runId}` }
    await createConfirmedTestAccount(account)

    const roomName = `Q135 Room ${runId}`
    const subject = `Q135 Meeting ${runId}`
    const newName = `Q135 Renamed ${runId}`
    await page.clock.setFixedTime(PINNED_NOW)

    await signInAsAdminUser(page)
    await api.createRoom(roomName, 4)
    await createMeeting(page, { subject, roomName, attendeeNames: [account.name] })

    await page.goto('/persons')
    await page.getByLabel(`Edit ${account.name}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(personCard(page, newName)).toBeVisible()

    await signOut(page)
    await signIn(page, account)
    await expect(page.getByText(newName)).toBeVisible()
  })

  test('Q.136 - admin renames a person with no Cognito account', async ({ page }) => {
    const runId = uniqueId()
    const guestName = `Q136 Guest ${runId}`
    const newName = `Q136 Guest Renamed ${runId}`

    await signInAsAdminUser(page)
    await createPerson(page, guestName)

    await page.getByLabel(`Edit ${guestName}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(personCard(page, newName)).toBeVisible()
  })

  test('Q.137 - cards show the admin badge and linked email; a guest shows "Not signed up yet"', async ({ page }) => {
    const runId = uniqueId()
    const account = { ...freshTestAccount(), name: `Q137 Linked ${runId}` }
    await createConfirmedTestAccount(account)
    const guestName = `Q137 Guest ${runId}`

    await signInAsAdminUser(page)
    await createPerson(page, guestName)
    await page.goto('/persons')

    await expect(personCard(page, account.name).getByText(account.email)).toBeVisible()
    await expect(personCard(page, guestName).getByText('Not signed up yet')).toBeVisible()

    const adminEmail = adminUser().email
    await expect(personCard(page, ADMIN_USER_NAME).getByText('Admin')).toBeVisible()
    await expect(personCard(page, ADMIN_USER_NAME).getByText(adminEmail)).toBeVisible()
  })

  test('Q.138 - admin grants admin access to a person with a linked account', async ({ page }) => {
    const runId = uniqueId()
    const account = { ...freshTestAccount(), name: `Q138 Person ${runId}` }
    await createConfirmedTestAccount(account)

    await signInAsAdminUser(page)
    await page.goto('/persons')
    await page.getByLabel(`Edit ${account.name}`).click()
    const dialog = page.getByRole('dialog')
    const adminSwitch = dialog.getByRole('switch', { name: 'Admin' })
    await expect(adminSwitch).toBeEnabled()
    await adminSwitch.check()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    await expect(personCard(page, account.name).getByText('Admin')).toBeVisible()

    // The grant actually took effect on their token, not just the Persons list - the real proof
    // this isn't just a DynamoDB-side badge (see the design doc's cognitoSyncFailed reasoning).
    await signOut(page)
    await signIn(page, account)
    await expect(page.getByRole('link', { name: 'Rooms' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Persons' })).toBeVisible()
  })

  test('Q.139 - the admin switch is disabled with an explanation for a person with no linked account', async ({ page }) => {
    const runId = uniqueId()
    const guestName = `Q139 Guest ${runId}`

    await signInAsAdminUser(page)
    await createPerson(page, guestName)
    await page.getByLabel(`Edit ${guestName}`).click()
    const dialog = page.getByRole('dialog')

    await expect(dialog.getByRole('switch', { name: 'Admin' })).toBeDisabled()
    await expect(dialog.getByText("hasn't signed in yet")).toBeVisible()
  })

  test('Q.140 - the admin switch is disabled for the signed-in admin\'s own person', async ({ page }) => {
    await signInAsAdminUser(page)
    await page.goto('/persons')
    await page.getByLabel(`Edit ${ADMIN_USER_NAME}`).click()
    const dialog = page.getByRole('dialog')

    await expect(dialog.getByRole('switch', { name: 'Admin' })).toBeDisabled()
    await expect(dialog.getByText("can't change your own admin access")).toBeVisible()
  })

  test('Q.141 - admin deletes a person: their organised meeting is cancelled, they are removed from one they only attend', async ({ page, context, api }) => {
    const runId = uniqueId()
    const targetName = `Q141 Person ${runId}`
    const otherAttendeeName = `Q141 Other ${runId}`
    const roomName = `Q141 Room ${runId}`
    // A second room for the second meeting - both booked at Add Meeting's same default time under
    // this test's one fixed clock, so sharing a room would collide with TimeRangeUnavailable.
    const roomName2 = `Q141 Room 2 ${runId}`
    const organisedSubject = `Q141 Organised ${runId}`
    const attendedSubject = `Q141 Attended ${runId}`
    await page.clock.setFixedTime(PINNED_NOW)
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
    })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    await signInAsAdminUser(page)
    await api.createRoom(roomName, 4)
    await api.createRoom(roomName2, 4)
    await createPerson(page, targetName)
    await createPerson(page, otherAttendeeName)
    // Target organises one meeting (the signed-in admin as an attendee, so it's still
    // visible/queryable afterward), and only attends a second one the admin organises.
    await createMeeting(page, { subject: organisedSubject, roomName, organiserName: targetName })
    await createMeeting(page, { subject: attendedSubject, roomName: roomName2, attendeeNames: [targetName, otherAttendeeName] })

    await page.goto('/persons')
    await page.getByLabel(`Remove ${targetName}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Remove person' }).click()
    await expect(page.getByText(targetName)).toHaveCount(0)

    // The meeting they organised is cancelled - gone from Room Availability entirely.
    await page.goto(`/rooms/${formatDateParam(PINNED_NOW)}/availability`)
    await expect(page.getByText(organisedSubject)).toHaveCount(0)

    // The meeting they only attended is untouched apart from their own removal - still bookable,
    // still shows the other attendee.
    const card = page
      .getByText(roomName2, { exact: true })
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
    await card.getByRole('button', { name: /'s meetings/ }).click()
    await card.getByRole('button', { name: attendedSubject, exact: false }).click()
    await expect(page.getByText(otherAttendeeName, { exact: false })).toBeVisible()
  })

  test('Q.142 - an admin cannot delete their own person this way', async ({ page }) => {
    await signInAsAdminUser(page)
    await page.goto('/persons')
    await page.getByLabel(`Remove ${ADMIN_USER_NAME}`).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Remove person' }).click()

    await expect(dialog.getByText('use Delete account in Settings instead')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(personCard(page, ADMIN_USER_NAME)).toBeVisible()
  })

  // mootmaker-webapp#125. Not a numbered use case - a small addition to the page P/Q already
  // cover, not a distinct scenario of its own.
  test('a filter narrows the list by name or linked email', async ({ page }) => {
    const runId = uniqueId()
    const guestName = `Filter Guest ${runId}`

    await signInAsAdminUser(page)
    await createPerson(page, guestName)

    await page.getByRole('textbox', { name: 'Filter' }).fill(guestName)
    await expect(personCard(page, guestName)).toBeVisible()
    await expect(page.getByRole('main').getByText(ADMIN_USER_NAME)).toHaveCount(0)

    const adminEmail = adminUser().email
    await page.getByRole('textbox', { name: 'Filter' }).fill(adminEmail)
    await expect(page.getByRole('main').getByText(ADMIN_USER_NAME)).toBeVisible()
    await expect(personCard(page, guestName)).toHaveCount(0)
  })

  // mootmaker-api#70. Sign-up's own half of this rule is covered separately, in
  // acceptance/tests/sign-up.spec.ts, since it needs a real Cognito sign-up rather than this
  // admin-only page.
  test('rejects adding a person whose name collides with an existing one', async ({ page }) => {
    const runId = uniqueId()
    const guestName = `Collision Guest ${runId}`

    await signInAsAdminUser(page)
    await createPerson(page, guestName)

    await page.goto('/persons')
    await page.getByRole('button', { name: 'Add person' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(`  ${guestName.toUpperCase()}  `)
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(dialog.getByText('A person with this name already exists.')).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  // The case that would have caught avatars shipping broken (mootmaker-webapp#131). Everything else
  // in this suite stayed green throughout that bug, because nothing looked at an avatar at all -
  // and "an avatar is rendered" would not have caught it either. MUI's Avatar swaps in the
  // person's initials when its image fails to load, so a broken avatar looks exactly like a
  // deliberate initials one. Only naturalWidth proves real image bytes arrived and decoded.
  test('Q.143 - a person with an avatar is shown with it, and a person without gets initials', async ({ page, api }) => {
    const withAvatar = `Avatar Holder ${uniqueId()}`
    // Initials are the first letters of the first and last words, so the unique part goes in the
    // middle - at the end it would become one of the initials.
    const without = `Zed ${uniqueId()} Quill`
    const personId = await api.createPerson(withAvatar)
    await api.createPerson(without)

    await signInAsAdminUser(page)
    // Any real PNG will do: the API decodes and re-encodes whatever it is given. A screenshot of
    // the page is the cheapest way to get one without committing a binary fixture.
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 128, height: 128 } })
    const avatarUrl = await api.setAvatar(personId, png)
    // Absolute, and not this webapp's own origin: avatars come from a host mootmaker-api owns.
    expect(new URL(avatarUrl).origin).not.toBe(new URL(page.url()).origin)

    await page.goto('/persons')
    const image = personCard(page, withAvatar).locator('img')
    await expect(image).toHaveAttribute('src', avatarUrl)
    await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 10_000 })
      .toBeGreaterThan(0)

    await expect(personCard(page, without).locator('img')).toHaveCount(0)
    await expect(personCard(page, without).getByText('ZQ', { exact: true })).toBeVisible()

    // And somewhere other than the Persons page, from a route several segments deep - the routes
    // where the original bug showed, when an avatar was a path resolved against the document.
    await page.goto(`/persons/${personId}/calendar`)
    await page.getByRole('combobox', { name: 'Person' }).click()
    const optionImage = page.getByRole('option', { name: withAvatar, exact: true }).locator('img')
    await expect
      .poll(() => optionImage.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 10_000 })
      .toBeGreaterThan(0)
  })
})
