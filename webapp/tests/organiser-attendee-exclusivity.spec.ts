import { test, expect } from '@playwright/test'

// Covers the UI-side half of keeping organiser and attendees mutually exclusive (the
// OrganiserIsAttendee rule is enforced authoritatively server-side - see the API's
// CreateMeetingValidationAcceptanceIT for that). These tests only cover paths reachable through
// the dropdowns themselves; see README.md's "Organiser/Attendee mutual exclusivity" section for
// the full list of cases around this rule, including ones deliberately not automated here (e.g.
// the signed-in-user-as-default-organiser race, which needs an e2e account with a linked Person -
// the current e2e test user has none, so that default never fires for it at all).

test.describe('Add Meeting form - organiser/attendee mutual exclusivity', () => {
  test('every selected attendee is excluded from the Organiser options; removing just one restores only that one', async ({
    page,
  }) => {
    await page.goto('/meetings/add')
    await expect(page.getByLabel('Subject')).toBeVisible()

    const organiserSelect = page.getByRole('combobox', { name: 'Organiser' })
    const attendeesSelect = page.getByRole('combobox', { name: 'Attendees' })

    await attendeesSelect.click()
    const attendeeOptions = page.getByRole('option')
    const firstAttendeeName = (await attendeeOptions.nth(0).textContent())?.trim()
    const secondAttendeeName = (await attendeeOptions.nth(1).textContent())?.trim()
    expect(firstAttendeeName?.length).toBeGreaterThan(0)
    expect(secondAttendeeName?.length).toBeGreaterThan(0)
    expect(firstAttendeeName).not.toEqual(secondAttendeeName)

    await attendeeOptions.nth(0).click()
    await page.getByRole('option', { name: secondAttendeeName!, exact: true }).click()
    await page.keyboard.press('Escape')

    // Neither selected attendee is offered as an organiser while they're an attendee.
    await organiserSelect.click()
    await expect(page.getByRole('option', { name: firstAttendeeName!, exact: true })).toHaveCount(0)
    await expect(page.getByRole('option', { name: secondAttendeeName!, exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')

    // Removing only the first attendee restores just that one as an organiser option - the second
    // (still an attendee) stays excluded.
    await attendeesSelect.click()
    await page.getByRole('option', { name: firstAttendeeName!, exact: true }).click()
    await page.keyboard.press('Escape')

    await organiserSelect.click()
    await expect(page.getByRole('option', { name: firstAttendeeName!, exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: secondAttendeeName!, exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  test('picking someone as the organiser excludes them from the Attendees options; switching the organiser restores them and excludes the new one', async ({
    page,
  }) => {
    await page.goto('/meetings/add')
    await expect(page.getByLabel('Subject')).toBeVisible()

    const organiserSelect = page.getByRole('combobox', { name: 'Organiser' })
    const attendeesSelect = page.getByRole('combobox', { name: 'Attendees' })

    await organiserSelect.click()
    const organiserOptions = page.getByRole('option')
    const firstOrganiserName = (await organiserOptions.nth(0).textContent())?.trim()
    const secondOrganiserName = (await organiserOptions.nth(1).textContent())?.trim()
    expect(firstOrganiserName?.length).toBeGreaterThan(0)
    expect(secondOrganiserName?.length).toBeGreaterThan(0)
    expect(firstOrganiserName).not.toEqual(secondOrganiserName)

    await organiserOptions.nth(0).click()

    // The organiser is not offered as an attendee; a different, unpicked person still is.
    await attendeesSelect.click()
    await expect(page.getByRole('option', { name: firstOrganiserName!, exact: true })).toHaveCount(0)
    await expect(page.getByRole('option', { name: secondOrganiserName!, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    // Switching the organiser to someone else immediately frees the old organiser to be picked as
    // an attendee, and excludes the new organiser instead.
    await organiserSelect.click()
    await page.getByRole('option', { name: secondOrganiserName!, exact: true }).click()

    await attendeesSelect.click()
    await expect(page.getByRole('option', { name: firstOrganiserName!, exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: secondOrganiserName!, exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
  })
})
