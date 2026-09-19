import { test, expect, type Page } from '@playwright/test'
import { E2E_USER } from '../src/auth/cognito.mock'
import { people } from '../src/testSupport/mocks/fixtures'

// Covers two things new to designs/meeting-detail-consolidation.md:
//
// 1. The Share button (MeetingDetailContent.tsx) - navigator.share() when available, a clipboard
//    copy + confirmation toast when it isn't. Both branches are mocked here deliberately: an OS
//    share sheet is outside anything Playwright can drive, and while the clipboard branch IS real
//    (Chromium's actual Clipboard API, granted via context.grantPermissions), it also gets genuine
//    end-to-end coverage for free in acceptance/tests/meeting-details.spec.ts's H.74 - this file's
//    job is the two branches' own logic (called once, with the right url/title; falls back
//    correctly when unavailable), not re-proving the real journey a second time.
//
// 2. "Back"'s safety on MeetingDetailsPage.tsx - gated on router state set only by a genuine
//    in-app navigation, not on browser history depth. Nothing in this app currently navigates to
//    /meetings/:id in-app (every meeting row opens the shared sheet/panel instead), so Back should
//    never render - this test proves that holds even when the tab already has real prior history
//    (the meeting-creation flow itself) before the meeting URL is ever visited via a cold
//    RequireAuth-redirect-then-sign-in round trip, which is exactly the shape a pasted link from
//    someone else follows.

/** Creates a meeting (organiser picked explicitly - E2E_USER has no linked Person, so there is no
 * default-to-self to rely on), opens its row in Room Availability, and returns the page positioned
 * with that meeting's sheet/panel open. Mirrors the identical pattern in
 * acceptance/tests/meeting-details.spec.ts's createMeetingViaForm. */
async function createAndOpenMeeting(page: Page, subject: string): Promise<void> {
  await page.goto('/meetings/add')
  await page.getByLabel('Subject').fill(subject)

  await page.getByRole('combobox', { name: 'Organiser' }).click()
  await page.getByRole('option', { name: people[0].name, exact: true }).click()

  await page.getByRole('combobox', { name: 'Room' }).click()
  await page.getByRole('option').first().click()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/rooms\/.+\/availability/)

  const card = page
    .getByText(subject, { exact: true })
    .first()
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
  await card.getByRole('button', { name: /'s meetings/ }).click()
  await card.getByRole('button', { name: new RegExp(subject) }).click()
}

test.describe('Share meeting', () => {
  test('calls navigator.share with the meeting URL and subject, when available', async ({ page }) => {
    // Spies on calls rather than letting a real share sheet open (which doesn't exist in a headless
    // test browser regardless) - records what MeetingDetailContent actually passed.
    await page.addInitScript(() => {
      ;(window as unknown as { __shareCalls: ShareData[] }).__shareCalls = []
      Object.defineProperty(window.navigator, 'share', {
        value: (data: ShareData) => {
          ;(window as unknown as { __shareCalls: ShareData[] }).__shareCalls.push(data)
          return Promise.resolve()
        },
        configurable: true,
      })
    })

    const subject = `Share via native ${Date.now()}`
    await createAndOpenMeeting(page, subject)

    await page.getByRole('button', { name: 'Share meeting' }).click()

    const calls = await page.evaluate(() => (window as unknown as { __shareCalls: ShareData[] }).__shareCalls)
    expect(calls).toHaveLength(1)
    expect(calls[0].title).toBe(subject)
    expect(calls[0].url).toMatch(/\/meetings\/.+$/)

    // No clipboard fallback fired alongside it - the two branches are mutually exclusive.
    await expect(page.getByText('Link copied to clipboard.')).toHaveCount(0)
  })

  test('copies the link and shows a confirmation, when navigator.share is unavailable', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
    })

    const subject = `Share via clipboard ${Date.now()}`
    await createAndOpenMeeting(page, subject)

    await page.getByRole('button', { name: 'Share meeting' }).click()

    await expect(page.getByText('Link copied to clipboard.')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toMatch(/\/meetings\/.+$/)
  })
})

test.describe('Meeting details - Back safety on a cold link', () => {
  test('Back does not appear after signing back in via a redirect, even with real prior tab history', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true })
    })

    // Real prior history in this tab before the meeting URL is ever visited - /meetings/add, then
    // the room-availability page the save redirects to - exactly the precondition an unconditional
    // navigate(-1)/history-based Back would be unsafe under.
    const subject = `Back safety ${Date.now()}`
    await createAndOpenMeeting(page, subject)
    await page.getByRole('button', { name: 'Share meeting' }).click()
    const meetingUrl = await page.evaluate(() => navigator.clipboard.readText())
    expect(meetingUrl).toMatch(/\/meetings\/.+/)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()

    // The cold-link journey: RequireAuth redirects a signed-out visit to /signin, and a real
    // sign-in returns to the originally-requested page via SignInPage's `from` router state.
    await page.goto(meetingUrl)
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()

    await page.getByLabel('Email').fill(E2E_USER.email)
    await page.getByLabel('Password').fill(E2E_USER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(meetingUrl)
    await expect(page.getByRole('heading', { name: subject })).toBeVisible()

    // The actual assertion this test exists for: no unconditional Back, because this navigation
    // never carried the fromInApp router state a genuine in-app link would set - see
    // MeetingDetailsPage.tsx's own comment on the mechanism.
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
  })
})
