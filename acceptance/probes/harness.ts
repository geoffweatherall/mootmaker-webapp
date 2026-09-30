import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { recorder } from './recorder'

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set - source env.sh`)
  return value
}

// ---------------------------------------------------------------------------------------------
// Actors

export interface Actor {
  label: string
  context: BrowserContext
  page: Page
  token: string
  personId: string
  name: string
}

export async function signIn(browser: Browser, label: string, email: string, password: string): Promise<Actor> {
  const context = await browser.newContext()
  await context.addInitScript(recorder)
  const page = await context.newPage()
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible({ timeout: 30_000 })
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.endsWith('.idToken')) return localStorage.getItem(key)
    }
    return null
  })
  if (!token) throw new Error(`${label}: no idToken after sign-in`)
  const me = await graphql<{ workspace: { me: { id: string; name: string } | null } }>(
    context.request,
    token,
    'query { workspace { me { id name } } }',
    {},
  )
  if (!me.workspace.me) throw new Error(`${label}: signed in but has no linked Person`)
  return { label, context, page, token, personId: me.workspace.me.id, name: me.workspace.me.name }
}

// ---------------------------------------------------------------------------------------------
// GraphQL

export async function graphql<T>(
  request: APIRequestContext,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await request.post(requireEnv('GRAPHQL_API_URL'), {
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        data: { query, variables },
      })
      const body = (await response.json()) as { data?: T; errors?: { message: string }[] }
      if (body.errors?.length) throw new Error(`GraphQL: ${JSON.stringify(body.errors)}`)
      return body.data as T
    } catch (e) {
      lastError = e
      if (String(e).startsWith('Error: GraphQL:')) throw e
    }
  }
  throw lastError
}

export interface Room {
  id: string
  name: string
  capacity: number
}

export async function rooms(actor: Actor): Promise<Room[]> {
  const data = await graphql<{ workspace: { rooms: Room[] } }>(
    actor.context.request,
    actor.token,
    'query { workspace { rooms { id name capacity } } }',
    {},
  )
  return [...data.workspace.rooms].sort((a, b) => a.name.localeCompare(b.name))
}

export interface MeetingSpec {
  roomId: string
  organiserId: string
  attendeeIds: string[]
  subject: string
  startTime: string
  endTime: string
}

export interface Booked extends MeetingSpec {
  id: string
  roomName: string
  date: string
}

const MEETING_INPUT_FIELDS = 'id subject startTime endTime room { id name } organiser { id } attendees { person { id } status }'

export async function createMeeting(actor: Actor, spec: MeetingSpec): Promise<{ id?: string; errors: string[] }> {
  const data = await graphql<{ createMeeting: { meeting: { id: string } | null; errors: string[] } }>(
    actor.context.request,
    actor.token,
    'mutation($meeting: MeetingInput!) { createMeeting(meeting: $meeting) { meeting { id } errors } }',
    { meeting: spec },
  )
  return { id: data.createMeeting.meeting?.id, errors: data.createMeeting.errors }
}

export async function updateMeeting(actor: Actor, id: string, spec: MeetingSpec): Promise<string[]> {
  const data = await graphql<{ updateMeeting: { errors: string[] } }>(
    actor.context.request,
    actor.token,
    'mutation($id: ID!, $meeting: MeetingInput!) { updateMeeting(id: $id, meeting: $meeting) { meeting { id } errors } }',
    { id, meeting: spec },
  )
  return data.updateMeeting.errors
}

export async function cancelMeeting(actor: Actor, id: string): Promise<string[]> {
  const data = await graphql<{ cancelMeeting: { errors: string[] } }>(
    actor.context.request,
    actor.token,
    'mutation($id: ID!) { cancelMeeting(id: $id) { errors } }',
    { id },
  )
  return data.cancelMeeting.errors
}

export async function respond(actor: Actor, meetingId: string, status: string): Promise<string[]> {
  const data = await graphql<{ respondToMeeting: { errors: string[] } }>(
    actor.context.request,
    actor.token,
    'mutation($meetingId: ID!, $status: AttendeeStatus!) { respondToMeeting(meetingId: $meetingId, status: $status) { errors } }',
    { meetingId, status },
  )
  return data.respondToMeeting.errors
}

export interface FetchedMeeting {
  id: string
  subject: string
  startTime: string
  endTime: string
  room: { id: string; name: string }
  organiser: { id: string }
  attendees: { person: { id: string }; status: string }[]
}

export async function meetingById(actor: Actor, id: string): Promise<FetchedMeeting | null> {
  const data = await graphql<{ meeting: FetchedMeeting | null }>(
    actor.context.request,
    actor.token,
    `query($id: ID!) { meeting(id: $id) { ${MEETING_INPUT_FIELDS} } }`,
    { id },
  )
  return data.meeting
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Books somewhere free on `date`, trying slots and rooms in turn. */
export async function book(
  actor: Actor,
  allRooms: Room[],
  date: string,
  subject: string,
  attendeeIds: string[],
  slotSeed: number,
): Promise<Booked> {
  const errorsSeen = new Set<string>()
  // 07:00 .. 19:30 in half hours, starting from a seed so consecutive bookings spread out.
  const slots = Array.from({ length: 26 }, (_, i) => (i + slotSeed) % 26)
  for (const slot of slots) {
    const startMinutes = 7 * 60 + slot * 30
    const start = `${date}T${pad(Math.floor(startMinutes / 60))}:${pad(startMinutes % 60)}:00`
    const endMinutes = startMinutes + 30
    const end = `${date}T${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}:00`
    for (const room of allRooms) {
      if (room.capacity < attendeeIds.length + 1) continue
      const spec: MeetingSpec = {
        roomId: room.id,
        organiserId: actor.personId,
        attendeeIds,
        subject,
        startTime: start,
        endTime: end,
      }
      const result = await createMeeting(actor, spec)
      if (result.id) return { ...spec, id: result.id, roomName: room.name, date }
      result.errors.forEach((e) => errorsSeen.add(e))
      if (!result.errors.every((e) => /^(TimeRangeUnavailable|InsufficientCapacity)$/.test(e))) {
        throw new Error(`Booking rejected for a reason other than a busy room: ${result.errors.join(', ')}`)
      }
    }
  }
  throw new Error(`No free slot on ${date}: ${[...errorsSeen].join(', ')}`)
}

// ---------------------------------------------------------------------------------------------
// Views

export type ViewName = 'overlay' | 'popout' | 'availability' | 'calendar' | 'home'

export interface View {
  name: ViewName | string
  page: Page
}

export function roomCard(page: Page, roomName: string) {
  return page
    .getByText(roomName, { exact: true })
    .first()
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiPaper-root ")][1]')
}

export async function openAvailability(page: Page, date: string, roomName: string): Promise<void> {
  await page.goto(`/rooms/${date}/availability`)
  const card = roomCard(page, roomName)
  await expect(card).toBeVisible({ timeout: 30_000 })
  const toggle = card.getByRole('button', { name: /'s meetings/ })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
}

export async function openOverlay(page: Page, meeting: Booked): Promise<void> {
  await openAvailability(page, meeting.date, meeting.roomName)
  await roomCard(page, meeting.roomName).getByRole('button', { name: meeting.subject, exact: false }).click()
  await expect(page.getByRole('heading', { name: meeting.subject })).toBeVisible()
}

export async function openPopout(page: Page, meetingId: string, subject: string): Promise<void> {
  await page.goto(`/meetings/${meetingId}`)
  await expect(page.getByRole('heading', { name: subject })).toBeVisible({ timeout: 30_000 })
}

export async function setWatch(page: Page, watch: string[]): Promise<void> {
  await page.evaluate((w) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = (window as any).__rec
    rec.watch = w
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__recResample()
  }, watch)
}

/** Waits until every view's subscription has been acknowledged at least once. */
export async function waitForSubscriptions(pages: Page[], timeoutMs = 20_000): Promise<void> {
  for (const page of pages) {
    await expect
      .poll(
        () =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          page.evaluate(() => (window as any).__rec.ws.some((m: { type: string }) => m.type === 'start_ack')),
        { timeout: timeoutMs },
      )
      .toBe(true)
  }
}

// ---------------------------------------------------------------------------------------------
// Recording and analysis

interface Sample {
  t: number
  sig: Record<string, number>
}

export interface Recording {
  frame: Sample[]
  mo: Sample[]
  ws: { t: number; type: string; body: string }[]
  frames: number
}

export async function recording(page: Page): Promise<Recording> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any).__rec)
}

export interface Transient {
  key: string
  series: 'frame' | 'mo'
  before: number
  after: number
  extreme: number
  startMs: number
  durationMs: number
  progressShown: boolean
}

/**
 * A key is transient when, between `from` and `to`, it took a value outside the range spanned by
 * its value just before `from` and its value at `to`. E.g. "cancelled" going 0 -> 1 -> 0, or a
 * watched subject going 1 -> 0 -> 1.
 *
 * `watch:*` keys are also summed into `watch:any`, so renaming a meeting (old subject 1 -> 0, new
 * 0 -> 1) is not itself a transient, but a gap where neither is shown is.
 */
export function transients(samples: Sample[], from: number, to: number, series: 'frame' | 'mo'): Transient[] {
  const withDerived = samples.map((s) => {
    const sig = { ...s.sig }
    const watchKeys = Object.keys(sig).filter((k) => k.startsWith('watch:'))
    if (watchKeys.length) sig['watch:any'] = watchKeys.reduce((sum, k) => sum + sig[k], 0)
    return { t: s.t, sig }
  })
  const keys = new Set<string>()
  withDerived.forEach((s) => Object.keys(s.sig).forEach((k) => keys.add(k)))
  keys.delete('progress')

  const valueAt = (i: number, key: string) => (i < 0 ? 0 : (withDerived[i].sig[key] ?? 0))
  let startIndex = -1
  withDerived.forEach((s, i) => {
    if (s.t < from) startIndex = i
  })
  const window = withDerived.map((s, i) => ({ ...s, i })).filter((s) => s.t >= from && s.t <= to)
  const endIndex = window.length ? window[window.length - 1].i : startIndex

  const found: Transient[] = []
  for (const key of keys) {
    const before = valueAt(startIndex, key)
    const after = valueAt(endIndex, key)
    const lo = Math.min(before, after)
    const hi = Math.max(before, after)
    let open = null as { start: number; extreme: number; progress: boolean } | null
    for (const s of window) {
      const v = s.sig[key] ?? 0
      const out = v < lo || v > hi
      if (out) {
        const moreExtreme: number = open ? (v > hi ? Math.max(open.extreme, v) : Math.min(open.extreme, v)) : v
        open = open
          ? { ...open, extreme: moreExtreme, progress: open.progress || (s.sig.progress ?? 0) > 0 }
          : { start: s.t, extreme: v, progress: (s.sig.progress ?? 0) > 0 }
      } else if (open) {
        found.push({
          key,
          series,
          before,
          after,
          extreme: open.extreme,
          startMs: Math.round(open.start - from),
          durationMs: Math.round(s.t - open.start),
          progressShown: open.progress,
        })
        open = null
      }
    }
    if (open) {
      found.push({
        key,
        series,
        before,
        after,
        extreme: open.extreme,
        startMs: Math.round(open.start - from),
        durationMs: -1,
        progressShown: open.progress,
      })
    }
  }
  return found
}

export function finalSig(samples: Sample[]): Record<string, number> {
  return samples.length ? samples[samples.length - 1].sig : {}
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
