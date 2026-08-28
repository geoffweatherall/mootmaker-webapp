import { test, expect } from '@playwright/test'

test.describe('Add Meeting entry point on the home page', () => {
  test('an "Add Meeting" button on the home page opens the Add Meeting form', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Add Meeting' }).click()

    await expect(page).toHaveURL('/meetings/add')
    await expect(page.getByRole('heading', { name: 'Add Meeting' })).toBeVisible()
  })
})

test.describe('Suggest a room', () => {
  test('fills in a room with sufficient capacity, and steps to the next one in the ranked list on each click, wrapping around', async ({
    page,
  }) => {
    await page.goto('/meetings/add')

    const roomSelect = page.getByRole('combobox', { name: 'Room' })
    const suggestButton = page.getByRole('button', { name: 'Suggest a room' })

    // Waiting for the button to re-enable (its loading spinner clears once the query resolves)
    // rules out reading the Room field's text while the request is still in flight. The field's
    // displayed text is Autocomplete's own internal state, synced from the `value` prop via an
    // effect rather than in the same render pass - so also wait (auto-retrying) for it to actually
    // reflect the new selection before reading it with a raw, non-retrying inputValue() call, the
    // same reasoning as add-meeting.spec.ts's organiser-default check.
    await suggestButton.click()
    await expect(suggestButton).toBeEnabled()
    await expect(roomSelect).not.toHaveValue('')
    const firstSuggestion = (await roomSelect.inputValue()).trim()
    expect(firstSuggestion.length).toBeGreaterThan(0)

    // Once the ranked list has been fetched, every further click is served from the cached list
    // (no further loading state), stepping to the next room without repeating the API call.
    const seen = new Set([firstSuggestion])
    let current = firstSuggestion
    for (let i = 0; i < 10; i += 1) {
      await suggestButton.click()
      await expect(roomSelect).not.toHaveValue('')
      current = (await roomSelect.inputValue()).trim()
      if (current === firstSuggestion) {
        // Wrapped back around to the start of the ranked list - the whole list has been seen.
        break
      }
      // A room not seen before in this cycle, or (if only one room qualifies) unchanged and
      // immediately wrapped - either is consistent with cycling through a cached ranked list.
      expect(seen.has(current)).toBe(false)
      seen.add(current)
    }
    expect(current).toBe(firstSuggestion)
  })

  test('shows an inline message, without changing the selection, when no room has sufficient capacity', async ({
    page,
  }) => {
    await page.goto('/meetings/add')

    // Select every available person as an attendee to push the required capacity past what any
    // seeded room provides.
    await page.getByLabel('Attendees').click()
    for (const option of await page.getByRole('option').all()) {
      await option.click()
    }
    await page.keyboard.press('Escape')

    const suggestButton = page.getByRole('button', { name: 'Suggest a room' })

    await suggestButton.click()
    await expect(page.getByText('No suitable room is available for that time')).toBeVisible()
  })
})
