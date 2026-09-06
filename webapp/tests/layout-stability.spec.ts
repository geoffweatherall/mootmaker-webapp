import { test, expect } from '@playwright/test'
import { ADMIN_USER, DEMO_USER } from '../src/auth/cognito.mock'
import { gateListRoomsQuery, gateMyPersonQuery } from './support/mockControls'

/**
 * Settings' "Your name" and "Date and time format" sections each explain themselves when the
 * account has no linked Person. Both of those notices sit above everything else on the page, so
 * rendering one speculatively while myPerson is still in flight and removing it a moment later
 * moves every control below it - and a layout shift under the cursor does not just look bad, it
 * silently eats the click that is already in progress: mousedown lands on a button, the notice
 * goes away, mouseup lands somewhere else, and the browser fires `click` on the common ancestor of
 * the two rather than on the button, so React's onClick never runs. The button is left focused, so
 * it even looks like the click worked.
 *
 * That cost a 120-second acceptance timeout on "Add room" in release 0.0.17 (mootmaker-webapp#43),
 * where the trace showed the click action itself completing and the notice disappearing between
 * the snapshot before it and the snapshot after it.
 *
 * So this holds myPerson open and asserts the page below does not move when it resolves.
 */
test.describe('Settings layout while personId is still resolving', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('does not claim the account has no linked person, or move anything, while myPerson is in flight', async ({
    page,
  }) => {
    // The demo user has a linked Person (see src/auth/cognito.mock.ts), which is the case that
    // matters here: the notices must never appear at all, so nothing below them can move.
    const releaseMyPerson = await gateMyPersonQuery(page)

    await page.goto('/')
    await page.getByLabel('Email').fill(DEMO_USER.email)
    await page.getByLabel('Password').fill(DEMO_USER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()

    // Still gated: the name field is disabled precisely because personId hasn't arrived yet, which
    // is what makes this the pre-resolution state rather than a race with an already-resolved one.
    const nameField = page.getByRole('textbox', { name: 'Name' })
    await expect(nameField).toBeDisabled()
    await expect(page.getByText('Your account has no linked person yet')).toHaveCount(0)

    // "Delete my account" is the last thing on the page, below both notices and below the admin
    // sections, so it moves if anything above it changes height.
    const deleteButton = page.getByRole('button', { name: 'Delete my account' })
    const before = await deleteButton.boundingBox()
    expect(before).not.toBeNull()

    await releaseMyPerson()

    await expect(nameField).toBeEnabled()
    await expect(page.getByText('Your account has no linked person yet')).toHaveCount(0)
    expect(await deleteButton.boundingBox()).toEqual(before)
  })
})

/**
 * The home page's Calendar button showed a spinner as its startIcon while personId resolved and
 * no startIcon at all once it had. That changes the button's width, which moves the two buttons to
 * its right - and those are the ones the acceptance suite clicks straight after loading the page.
 * Same fault as the Settings one above, just horizontal.
 */
test.describe('Home page layout while personId is still resolving', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('does not move the buttons beside Calendar when myPerson resolves', async ({ page }) => {
    const releaseMyPerson = await gateMyPersonQuery(page)

    await page.goto('/')
    await page.getByLabel('Email').fill(DEMO_USER.email)
    await page.getByLabel('Password').fill(DEMO_USER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

    // Scoped to main, since the sidebar has its own Calendar item - and it is the sidebar's
    // spinner, not this one, that calendar-menu.spec.ts asserts on.
    const calendarButton = page.getByRole('main').getByRole('button', { name: 'Calendar', exact: true })
    await expect(calendarButton).toBeDisabled()

    const availability = page.getByRole('button', { name: 'Room availability today' })
    const addMeeting = page.getByRole('main').getByRole('link', { name: 'Add Meeting' })
    const availabilityBefore = await availability.boundingBox()
    const addMeetingBefore = await addMeeting.boundingBox()
    expect(availabilityBefore).not.toBeNull()

    await releaseMyPerson()

    await expect(calendarButton).toBeEnabled()
    expect(await availability.boundingBox()).toEqual(availabilityBefore)
    expect(await addMeeting.boundingBox()).toEqual(addMeetingBefore)
  })
})

/**
 * Settings renders Rooms above People, both admin-only. Each used to run its own query and appear
 * whenever that query resolved, so People could be on the page - with a clickable "Add person" -
 * while Rooms was still a spinner. When the rooms list then arrived it grew from a spinner to a
 * full list, hundreds of pixels in a real environment, and pushed "Add person" down.
 *
 * A list of unknown length cannot reserve its own space, so the fix takes the other half of the
 * rule: the control simply is not there yet. Neither Add button exists until both lists are ready.
 * See mootmaker-webapp#45, and #43 for the same mechanism costing a 120-second acceptance timeout.
 */
test.describe('Settings admin sections while the rooms list is still loading', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows no Add button until both admin lists have arrived', async ({ page }) => {
    // The only admin among the mock users - the Rooms/People sections render for nobody else.
    const releaseListRooms = await gateListRoomsQuery(page)

    await page.goto('/')
    await page.getByLabel('Email').fill(ADMIN_USER.email)
    await page.getByLabel('Password').fill(ADMIN_USER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()

    // ListPeople has resolved by now; ListRooms is still held. Before the fix, PeopleSection
    // rendered off its own query and "Add person" was already clickable here - and would then be
    // shoved down the page when the rooms list replaced its spinner.
    await expect(page.getByRole('progressbar')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add person' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add room' })).toHaveCount(0)

    await releaseListRooms()

    // Both arrive together, so nothing that is already clickable ever moves.
    await expect(page.getByRole('button', { name: 'Add room' })).toBeVisible()
    const addPerson = page.getByRole('button', { name: 'Add person' })
    await expect(addPerson).toBeVisible()

    const box = await addPerson.boundingBox()
    await expect(page.getByRole('heading', { name: 'Rooms', level: 2 })).toBeVisible()
    expect(await addPerson.boundingBox()).toEqual(box)
  })
})
