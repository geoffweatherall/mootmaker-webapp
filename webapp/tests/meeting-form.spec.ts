import { test, expect } from '@playwright/test'

test.describe('Schedule Meeting form - time picker minute options', () => {
  test('start time minute picker excludes 13 and only offers 5-minute boundaries', async ({
    page,
  }) => {
    await page.goto('/meetings/add')
    await expect(page.getByRole('heading', { name: 'Schedule Meeting' })).toBeVisible()

    const startTimeGroup = page.getByRole('group', { name: 'Start time' })
    await startTimeGroup.getByRole('button', { name: /Choose time/i }).click()

    const minuteOptions = page.getByRole('listbox', { name: 'Select minutes' })
    await expect(minuteOptions).toBeVisible()

    const minutes = await minuteOptions.getByRole('option').allTextContents()

    expect(minutes.length).toBeGreaterThan(0)
    expect(minutes).not.toContain('13')
    for (const minute of minutes) {
      expect(Number(minute) % 5).toBe(0)
    }
  })

  test('end time minute picker excludes 13 and only offers 5-minute boundaries', async ({
    page,
  }) => {
    await page.goto('/meetings/add')
    await expect(page.getByRole('heading', { name: 'Schedule Meeting' })).toBeVisible()

    const endTimeGroup = page.getByRole('group', { name: 'End time' })
    await endTimeGroup.getByRole('button', { name: /Choose time/i }).click()

    const minuteOptions = page.getByRole('listbox', { name: 'Select minutes' })
    await expect(minuteOptions).toBeVisible()

    const minutes = await minuteOptions.getByRole('option').allTextContents()

    expect(minutes.length).toBeGreaterThan(0)
    expect(minutes).not.toContain('13')
    for (const minute of minutes) {
      expect(Number(minute) % 5).toBe(0)
    }
  })
})

test.describe('Schedule Meeting form - single date field', () => {
  test('offers one date field shared by start and end time, with no date field on the time pickers', async ({
    page,
  }) => {
    await page.goto('/meetings/add')
    await expect(page.getByRole('heading', { name: 'Schedule Meeting' })).toBeVisible()

    await expect(page.getByRole('group', { name: 'Date' })).toBeVisible()

    const startTimeGroup = page.getByRole('group', { name: 'Start time' })
    await expect(startTimeGroup.getByRole('button', { name: /Choose date/i })).toHaveCount(0)
    await expect(startTimeGroup.getByRole('button', { name: /Choose time/i })).toBeVisible()

    const endTimeGroup = page.getByRole('group', { name: 'End time' })
    await expect(endTimeGroup.getByRole('button', { name: /Choose date/i })).toHaveCount(0)
    await expect(endTimeGroup.getByRole('button', { name: /Choose time/i })).toBeVisible()
  })
})

test.describe('Schedule Meeting form - two-step flow', () => {
  test('details (subject, attendees, time) come first; the room is only offered on the second step', async ({
    page,
  }) => {
    await page.goto('/meetings/add')
    await expect(page.getByRole('heading', { name: 'Schedule Meeting' })).toBeVisible()

    // Step 1: subject/time fields are present, but there's no room field yet.
    await expect(page.getByLabel('Subject')).toBeVisible()
    await expect(page.getByRole('group', { name: 'Start time' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Room' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Next' }).click()

    // Step 2: the room field (and "Suggest a room") appear; the step 1 fields are gone.
    await expect(page.getByRole('combobox', { name: 'Room' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Suggest a room' })).toBeVisible()
    await expect(page.getByLabel('Subject')).toHaveCount(0)

    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByLabel('Subject')).toBeVisible()
  })
})
