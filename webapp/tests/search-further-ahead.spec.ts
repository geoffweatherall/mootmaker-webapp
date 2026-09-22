import { test, expect } from '@playwright/test'
import dayjs from 'dayjs'
import { DEMO_USER } from '../src/auth/cognito.mock'
import { people, rooms } from '../src/testSupport/mocks/fixtures'
import { formatRangeLabel } from '../src/pages/searchFurtherAheadLogic'
import { seedMeeting } from './support/mockControls'

// Covers designs/home-and-misc-pages-redesign.md's "Search further ahead" behaviour: none found,
// finding and appending an item, and the empty-then-populated-again cycle. Seeds meetings directly
// into the mock fixture (seedMeeting), not by driving the Add Meeting form repeatedly - see that
// helper's own doc comment. Expected range-label text is computed from the same
// searchFurtherAheadLogic.ts the app itself uses, rather than re-deriving the day math here (the
// logic itself already has its own unit coverage in searchFurtherAheadLogic.test.ts - this suite's
// job is proving the UI is actually wired to it).
test.describe('Search further ahead', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Email').fill(DEMO_USER.email)
    await page.getByLabel('Password').fill(DEMO_USER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  function today() {
    return dayjs().startOf('day')
  }

  test('finds nothing new: no card appears, but the range label still advances', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Needs your response' })).toBeVisible()
    const initialRange = formatRangeLabel(today(), 0)
    await expect(page.getByText(`· ${initialRange}`)).toBeVisible()

    // Proven absent before the click, not just hidden - the same non-vacuous-test rigor
    // mootmaker-webapp#111's tests established.
    await expect(page.getByRole('region')).toHaveCount(0)

    await page.getByRole('button', { name: 'Search further ahead' }).click()

    const widerRange = formatRangeLabel(today(), 1)
    await expect(page.getByText(`· ${widerRange}`)).toBeVisible()
    await expect(page.getByRole('region')).toHaveCount(0)
  })

  test('finds and appends an item, with an indigo (not amber) border', async ({ page }) => {
    const subject = `Search further ahead test ${Date.now()}`
    // Offset 4 - inside the first "Search further ahead" click's new window (offsets 3-5), so one
    // click is enough to reach it.
    const meetingDate = today().add(4, 'day')
    await seedMeeting(page, {
      subject,
      room: rooms[0],
      organiser: people[0],
      attendees: [{ person: people[4], status: 'NoResponse' }],
      startTime: meetingDate.hour(10).minute(0).format('YYYY-MM-DDTHH:mm:ss'),
      endTime: meetingDate.hour(10).minute(30).format('YYYY-MM-DDTHH:mm:ss'),
    })

    await expect(page.getByRole('region')).toHaveCount(0)

    await page.getByRole('button', { name: 'Search further ahead' }).click()

    const card = page.getByRole('region', { name: subject, exact: true })
    await expect(card).toBeVisible()
    await expect(card.getByText(people[0].name, { exact: false })).toBeVisible()
    // Indigo (primary.main, #4338ca) for a "Search further ahead" find, vs. amber for one from the
    // initial window - see HomePage.tsx's NeedsResponseCard. Light-mode default: Playwright's clean
    // browser context carries no dark prefers-color-scheme signal.
    await expect(card).toHaveCSS('border-left-color', 'rgb(67, 56, 202)')

    const widerRange = formatRangeLabel(today(), 1)
    await expect(page.getByText(`· ${widerRange}`)).toBeVisible()
  })

  test('goes empty, then a further search finds something', async ({ page }) => {
    // A plain <p> locator, not getByText: EmptyState's icon carries the same message as its own
    // (invisible, decorative) SVG <title> - see components/EmptyState.tsx's titleAccess - which
    // getByText also matches regardless of visibility.
    const emptyMessage = page.locator('p', { hasText: 'Nothing waiting on a response between' })
    await expect(emptyMessage).toBeVisible()

    const subject = `Empty then found test ${Date.now()}`
    const meetingDate = today().add(4, 'day')
    await seedMeeting(page, {
      subject,
      room: rooms[0],
      organiser: people[0],
      attendees: [{ person: people[4], status: 'NoResponse' }],
      startTime: meetingDate.hour(9).minute(0).format('YYYY-MM-DDTHH:mm:ss'),
      endTime: meetingDate.hour(9).minute(30).format('YYYY-MM-DDTHH:mm:ss'),
    })

    await page.getByRole('button', { name: 'Search further ahead' }).click()

    await expect(page.getByRole('region', { name: subject, exact: true })).toBeVisible()
    await expect(emptyMessage).toHaveCount(0)
  })
})
