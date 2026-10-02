import type { Page } from '@playwright/test'
import { STANDARD_USER_NAME, signInAsStandardUser, standardUser } from './support/accounts'
import { uniqueId } from './support/env'
import {
  now,
  recordLiveUpdates,
  subscribed,
  switchTabAwayAndBack,
  transientsBetween,
  watchFor,
  type Transient,
} from './support/liveRecorder'
import { formatDateParam, pinnedWeekday } from './support/pinnedDates'
import type { SetupApi } from './support/setupApi'
import { expect, test } from './support/test'

/**
 * What a user sees WHILE someone else changes a meeting, not just afterwards (mootmaker-webapp#137).
 *
 * The cross-client tests elsewhere check the end state - "the change appears within 30 s" - and
 * passed straight through every one of #132 (the open meeting flashing "This meeting was
 * cancelled."), #134 (saying so for good after a move), #135 (the pop-out page never updating) and
 * #136 (Home and Calendar blanking a day). Each view here records what it shows on every animation
 * frame (./support/liveRecorder.ts), and the assertion is that nothing appeared that was true
 * neither before nor after: no "cancelled", no empty states, and the meeting never vanishing.
 *
 * The other client is the API (fast, precise, and any kind of change), or a second browser where
 * the other person's own screen is part of the story. A tab switch, with no other client at all,
 * triggers the same refresh and is checked too.
 */

/** Long enough for the broadcast round trip and the refetch it causes to land and settle. */
const SETTLE_MS = 8_000

const NEGATIVE = new Set([
  'cancelled',
  'meetingNotFound',
  'noMeetingsBooked',
  'freeAllDay',
  'noMeetings',
  'noMeetingsTodayTomorrow',
  'nothingWaiting',
  'countZero',
  'noLongerExists',
])

function describe(transients: Transient[]): string {
  return transients.map((t) => `${t.key} ${t.before}->${t.extreme}->${t.after} for ${t.durationMs}ms`).join('; ')
}

/** Nothing negative came and went, and the watched meeting never disappeared from view. */
function expectNoFlash(view: string, transients: Transient[]): void {
  const flashes = transients.filter((t) => NEGATIVE.has(t.key) || (t.key === 'watch:any' && t.extreme < t.before))
  expect(flashes, `${view} showed, then stopped showing: ${describe(flashes)}`).toEqual([])
}

interface Booked {
  meetingId: string
  roomId: string
  roomName: string
  organiserId: string
  subject: string
  date: string
}

/** A meeting the standard user attends, organised by a guest - so the standard user is watching. */
async function bookForTheStandardUser(api: SetupApi, label: string, date: string, start = '10:00:00'): Promise<Booked> {
  const id = uniqueId()
  const roomName = `${label} Room ${id}`
  const roomId = await api.createRoom(roomName, 6)
  const organiserId = await api.createPerson(`${label} Organiser ${id}`)
  const attendeeId = await api.personIdByEmail(standardUser().email)
  const subject = `${label} meeting ${id}`
  const end = `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}${start.slice(2)}`
  const meetingId = await api.createMeeting({
    subject,
    roomId,
    organiserId,
    attendeeIds: [attendeeId],
    startTime: `${date}T${start}`,
    endTime: `${date}T${end}`,
  })
  return { meetingId, roomId, roomName, organiserId, subject, date }
}

async function update(api: SetupApi, booked: Booked, changes: { subject?: string; date?: string; start?: string }) {
  const attendeeId = await api.personIdByEmail(standardUser().email)
  const date = changes.date ?? booked.date
  const start = changes.start ?? '10:00:00'
  const end = `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}${start.slice(2)}`
  const result = await api.graphql<{ updateMeeting: { errors: string[] } }>(
    'mutation($id: ID!, $meeting: MeetingInput!) { updateMeeting(id: $id, meeting: $meeting) { errors } }',
    {
      id: booked.meetingId,
      meeting: {
        roomId: booked.roomId,
        organiserId: booked.organiserId,
        attendeeIds: [attendeeId],
        subject: changes.subject ?? booked.subject,
        startTime: `${date}T${start}`,
        endTime: `${date}T${end}`,
      },
    },
  )
  expect(result.updateMeeting.errors).toEqual([])
}

function roomCard(page: Page, roomName: string) {
  return page
    .getByText(roomName, { exact: true })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
}

async function openSheet(page: Page, booked: Booked): Promise<void> {
  await page.goto(`/rooms/${booked.date}/availability`)
  const card = roomCard(page, booked.roomName)
  await card.getByRole('button', { name: /'s meetings/ }).click()
  await card.getByRole('button', { name: booked.subject, exact: false }).click()
  await expect(page.getByRole('heading', { name: booked.subject })).toBeVisible()
}

/** The four views of one meeting a user can have open, each in its own tab. */
async function openEveryView(page: Page, booked: Booked): Promise<Record<string, Page>> {
  const context = page.context()
  const sheet = page
  await openSheet(sheet, booked)
  const popout = await context.newPage()
  await popout.goto(`/meetings/${booked.meetingId}`)
  await expect(popout.getByRole('heading', { name: booked.subject })).toBeVisible()
  const calendar = await context.newPage()
  await calendar.goto('/')
  await calendar.getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(calendar.getByText(booked.subject).first()).toBeVisible()
  const home = await context.newPage()
  await home.goto('/')
  await expect(home.getByText(booked.subject).first()).toBeVisible()
  return { sheet, popout, calendar, home }
}

async function ready(views: Record<string, Page>, watched: string[]): Promise<void> {
  for (const view of Object.values(views)) {
    await watchFor(view, watched)
    await subscribed(view)
  }
}

test.describe('live updates show no false states on the way', () => {
  test.beforeEach(async ({ context }) => {
    await recordLiveUpdates(context)
  })

  test("someone else renaming the meeting: every view shows the new name, and nothing false on the way", async ({
    page,
    api,
  }) => {
    // The pinned "today", so Home's agenda shows it as well as the calendar. A pinned weekday, not
    // the real today: the calendar shows only Monday-Friday, so on a weekend the meeting had no day
    // to appear in (see support/pinnedDates.ts).
    const today = pinnedWeekday('Wednesday', { hour: 9 })
    await page.clock.setFixedTime(today)
    const booked = await bookForTheStandardUser(api, 'LiveRename', formatDateParam(today), '11:00:00')
    await signInAsStandardUser(page)
    const views = await openEveryView(page, booked)
    const renamed = `${booked.subject} (renamed)`
    await ready(views, [booked.subject, renamed])

    const from = now()
    await update(api, booked, { subject: renamed, start: '11:00:00' })
    await page.waitForTimeout(SETTLE_MS)
    const to = now()

    for (const [name, view] of Object.entries(views)) {
      expectNoFlash(name, await transientsBetween(view, from, to))
      await expect(view.getByText(renamed).first(), `${name} shows the new name`).toBeVisible()
    }
  })

  test('someone else changing a DIFFERENT meeting that day does not disturb an open meeting', async ({ page, api }) => {
    const date = formatDateParam(pinnedWeekday('Wednesday'))
    const watched = await bookForTheStandardUser(api, 'LiveWatched', date, '10:00:00')
    const other = await bookForTheStandardUser(api, 'LiveOther', date, '13:00:00')
    await signInAsStandardUser(page)
    await openSheet(page, watched)
    await ready({ sheet: page }, [watched.subject])

    const from = now()
    await update(api, other, { subject: `${other.subject} (edited)`, start: '13:00:00' })
    await page.waitForTimeout(SETTLE_MS)

    expectNoFlash('sheet', await transientsBetween(page, from, now()))
    await expect(page.getByRole('heading', { name: watched.subject })).toBeVisible()
  })

  test('switching tabs away and back shows nothing false (no other user involved)', async ({ page, api }) => {
    const date = formatDateParam(pinnedWeekday('Thursday'))
    const booked = await bookForTheStandardUser(api, 'LiveTab', date)
    await signInAsStandardUser(page)
    await openSheet(page, booked)
    await ready({ sheet: page }, [booked.subject])

    const from = now()
    await switchTabAwayAndBack(page)
    await page.waitForTimeout(SETTLE_MS)

    expectNoFlash('sheet', await transientsBetween(page, from, now()))
  })

  test('a meeting moved to another day stays open with its new date - it is not "cancelled"', async ({ page, api }) => {
    const date = formatDateParam(pinnedWeekday('Monday'))
    const newDate = formatDateParam(pinnedWeekday('Monday', { weeks: 1 }))
    const booked = await bookForTheStandardUser(api, 'LiveMove', date)
    await signInAsStandardUser(page)
    const popout = await page.context().newPage()
    await popout.goto(`/meetings/${booked.meetingId}`)
    await openSheet(page, booked)
    await ready({ sheet: page, popout }, [booked.subject])

    const from = now()
    await update(api, booked, { date: newDate })
    await page.waitForTimeout(SETTLE_MS)
    const to = now()

    for (const [name, view] of Object.entries({ sheet: page, popout })) {
      expectNoFlash(name, await transientsBetween(view, from, to))
      await expect(view.getByText(newDate, { exact: true }), `${name} shows the new date`).toBeVisible()
    }
  })

  test('a cancelled meeting says so - on the sheet and on the pop-out page', async ({ page, api }) => {
    const date = formatDateParam(pinnedWeekday('Tuesday'))
    const booked = await bookForTheStandardUser(api, 'LiveCancel', date)
    await signInAsStandardUser(page)
    const popout = await page.context().newPage()
    await popout.goto(`/meetings/${booked.meetingId}`)
    await openSheet(page, booked)
    await ready({ sheet: page, popout }, [booked.subject])

    const cancelled = await api.graphql<{ cancelMeeting: { errors: string[] } }>(
      'mutation($id: ID!) { cancelMeeting(id: $id) { errors } }',
      { id: booked.meetingId },
    )
    expect(cancelled.cancelMeeting.errors).toEqual([])

    await expect(page.getByRole('paragraph').filter({ hasText: 'This meeting was cancelled.' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(popout.getByText(/This meeting was cancelled\.|Meeting not found\./).first()).toBeVisible({
      timeout: 30_000,
    })
  })

  test('another person editing in their own browser: the watcher sees it live, with nothing false on the way', async ({
    page,
    api,
    browser,
  }) => {
    // A second real person, in their own browser, organising a meeting the standard user attends.
    const { createConfirmedTestAccount } = await import('../../support/cognitoAdmin')
    const { freshTestAccount } = await import('../../support/testAccount')
    const other = freshTestAccount()
    await createConfirmedTestAccount(other)
    const date = formatDateParam(pinnedWeekday('Friday'))
    const id = uniqueId()
    const roomName = `LiveTwo Room ${id}`
    const roomId = await api.createRoom(roomName, 6)
    const subject = `LiveTwo meeting ${id}`
    const meetingId = await api.createMeeting({
      subject,
      roomId,
      organiserId: await api.personIdByEmail(other.email),
      attendeeIds: [await api.personIdByEmail(standardUser().email)],
      startTime: `${date}T10:00:00`,
      endTime: `${date}T11:00:00`,
    })

    await signInAsStandardUser(page)
    await openSheet(page, { meetingId, roomId, roomName, organiserId: '', subject, date })
    const renamed = `${subject} (renamed by its organiser)`
    await ready({ sheet: page }, [subject, renamed])

    const otherContext = await browser.newContext()
    try {
      const otherPage = await otherContext.newPage()
      const { signIn } = await import('./support/accounts')
      await signIn(otherPage, other)
      await otherPage.goto(`/meetings/${meetingId}/edit`)
      await expect(otherPage.getByLabel('Subject')).toHaveValue(subject)
      await otherPage.getByLabel('Subject').fill(renamed)

      const from = now()
      await otherPage.getByRole('button', { name: 'Save' }).click()
      await otherPage.waitForURL(/\/availability/)
      await page.waitForTimeout(SETTLE_MS)

      expectNoFlash('sheet', await transientsBetween(page, from, now()))
      await expect(page.getByRole('heading', { name: renamed })).toBeVisible()
      // The organiser is shown as themselves on the watcher's sheet - a real second person.
      await expect(page.getByText(other.name, { exact: true }).first()).toBeVisible()
      expect(STANDARD_USER_NAME).not.toBe(other.name)
    } finally {
      await otherContext.close()
    }
  })
})
