import { test, expect, type Locator, type Page } from '@playwright/test'

// The pickers show the clock dial on every device (mootmaker-webapp#147): hours first, then minutes.
// The dial draws all twelve 5-minute labels; the ones a meeting can't use are disabled.
async function minuteDial(page: Page, groupName: 'Start time' | 'End time'): Promise<Locator> {
  await page.getByRole('group', { name: groupName }).getByRole('button', { name: /Choose time/i }).click()
  // The dial's listbox wrapper has no height of its own (its numbers are absolutely positioned), so
  // wait on an option rather than on the listbox.
  await expect(page.getByRole('listbox', { name: /^Select hours/ }).getByRole('option').first()).toBeVisible()
  await page.getByRole('button', { name: 'Open next view' }).click()
  const dial = page.getByRole('listbox', { name: /^Select minutes/ })
  await expect(dial.getByRole('option').first()).toBeVisible()
  return dial
}

test.describe('Add Meeting form - time picker minute options', () => {
  for (const groupName of ['Start time', 'End time'] as const) {
    test(`${groupName.toLowerCase()} dial only lets you choose 15-minute boundaries`, async ({ page }) => {
      await page.goto('/meetings/add')
      await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()

      const dial = await minuteDial(page, groupName)

      await expect(dial.getByRole('option')).toHaveCount(12)
      const choosable = await dial.getByRole('option', { disabled: false }).allTextContents()
      // Exactly {00, 15, 30, 45} - not just "some multiple of 15" - since a 15-minute step over 60
      // minutes has a small, fully-enumerable option set worth pinning down precisely.
      expect(choosable.sort()).toEqual(['00', '15', '30', '45'])
    })
  }
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
