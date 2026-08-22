import { test, expect } from '@playwright/test'

test.describe('Add Meeting form - time picker minute options', () => {
  test('start time minute picker excludes 13 and only offers 15-minute boundaries', async ({
    page,
  }) => {
    await page.goto('/meetings/add')
    await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()

    const startTimeGroup = page.getByRole('group', { name: 'Start time' })
    await startTimeGroup.getByRole('button', { name: /Choose time/i }).click()

    const minuteOptions = page.getByRole('listbox', { name: 'Select minutes' })
    await expect(minuteOptions).toBeVisible()

    const minutes = await minuteOptions.getByRole('option').allTextContents()

    // Exactly {00, 15, 30, 45} - not just "some multiple of 15" - since a 15-minute step over 60
    // minutes has a small, fully-enumerable option set worth pinning down precisely.
    expect(minutes).toEqual(['00', '15', '30', '45'])
  })

  test('end time minute picker excludes 13 and only offers 15-minute boundaries', async ({
    page,
  }) => {
    await page.goto('/meetings/add')
    await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()

    const endTimeGroup = page.getByRole('group', { name: 'End time' })
    await endTimeGroup.getByRole('button', { name: /Choose time/i }).click()

    const minuteOptions = page.getByRole('listbox', { name: 'Select minutes' })
    await expect(minuteOptions).toBeVisible()

    const minutes = await minuteOptions.getByRole('option').allTextContents()

    expect(minutes).toEqual(['00', '15', '30', '45'])
  })
})

test.describe('Add Meeting form - single date field', () => {
  test('offers one date field shared by start and end time, with no date field on the time pickers', async ({
    page,
  }) => {
    await page.goto('/meetings/add')
    await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()

    await expect(page.getByRole('group', { name: 'Date' })).toBeVisible()

    const startTimeGroup = page.getByRole('group', { name: 'Start time' })
    await expect(startTimeGroup.getByRole('button', { name: /Choose date/i })).toHaveCount(0)
    await expect(startTimeGroup.getByRole('button', { name: /Choose time/i })).toBeVisible()

    const endTimeGroup = page.getByRole('group', { name: 'End time' })
    await expect(endTimeGroup.getByRole('button', { name: /Choose date/i })).toHaveCount(0)
    await expect(endTimeGroup.getByRole('button', { name: /Choose time/i })).toBeVisible()
  })
})

test.describe('Add Meeting form - single-step flow', () => {
  test('subject, attendees, time and room are all present on one form, with no step navigation', async ({
    page,
  }) => {
    await page.goto('/meetings/add')
    await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()

    // Every field is visible at once - no "Next"/"Back" step navigation.
    await expect(page.getByLabel('Subject')).toBeVisible()
    await expect(page.getByRole('group', { name: 'Start time' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Room' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Suggest a room' })).toBeVisible()

    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
  })
})
