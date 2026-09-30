import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount } from '../../support/testAccount'
import {
  book,
  cancelMeeting,
  finalSig,
  meetingById,
  openAvailability,
  openOverlay,
  openPopout,
  recording,
  requireEnv,
  respond,
  rooms,
  setWatch,
  signIn,
  sleep,
  transients,
  updateMeeting,
  waitForSubscriptions,
  type Actor,
  type Booked,
  type MeetingSpec,
  type Room,
  type Transient,
} from './harness'

/**
 * Investigation, not a test: A (the E2E user, standard) watches five views while B (a freshly
 * signed-up standard user) changes something, either over the API or through B's own browser. Every
 * view records what it shows, frame by frame. The output is a list of transient states - things a
 * view showed briefly that were true neither before nor after the change.
 */

const SETTLE_MS = 8_000
const REPS_API = Number(process.env.PROBE_REPS_API ?? 3)
const REPS_UI = Number(process.env.PROBE_REPS_UI ?? 2)
const ONLY = process.env.PROBE_ONLY?.split(',')

function localDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function spec(m: Booked): MeetingSpec {
  return {
    roomId: m.roomId,
    organiserId: m.organiserId,
    attendeeIds: m.attendeeIds,
    subject: m.subject,
    startTime: m.startTime,
    endTime: m.endTime,
  }
}

function must(errors: string[], what: string): void {
  if (errors.length) throw new Error(`${what} rejected: ${errors.join(', ')}`)
}

interface World {
  A: Actor
  B: Actor
  allRooms: Room[]
  date: string
  seq: number
}

interface Prepared {
  /** The meeting A's overlay and pop-out views are opened on. */
  focus: Booked
  watch: string[]
  act: () => Promise<void>
}

type Method = 'api' | 'ui' | 'none'

interface Scenario {
  name: string
  methods: Method[]
  prepare: (world: World, method: Method, tag: string) => Promise<Prepared>
}

async function uiEditSubject(page: Page, meetingId: string, from: string, to: string): Promise<void> {
  await page.goto(`/meetings/${meetingId}/edit`)
  const subject = page.getByLabel('Subject')
  await expect(subject).toHaveValue(from, { timeout: 30_000 })
  await subject.fill(to)
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/\/availability/, { timeout: 30_000 })
}

const scenarios: Scenario[] = [
  {
    name: 'editTitle',
    methods: ['api', 'ui'],
    async prepare(w, method, tag) {
      const before = `Probe ${tag} alpha`
      const after = `Probe ${tag} bravo`
      const m1 = await book(w.B, w.allRooms, w.date, before, [w.A.personId], w.seq++)
      if (method === 'ui') await w.B.page.goto(`/meetings/${m1.id}/edit`)
      return {
        focus: m1,
        watch: [before, after],
        act: async () => {
          if (method === 'api') must(await updateMeeting(w.B, m1.id, { ...spec(m1), subject: after }), 'update')
          else await uiEditSubject(w.B.page, m1.id, before, after)
        },
      }
    },
  },
  {
    name: 'editEndTime',
    methods: ['api'],
    async prepare(w, _method, tag) {
      const subject = `Probe ${tag} alpha`
      const m1 = await book(w.B, w.allRooms, w.date, subject, [w.A.personId], w.seq++)
      const end = m1.startTime.replace(/T(\d\d):(\d\d)/, (_s, h, m) => {
        const minutes = Number(h) * 60 + Number(m) + 15
        return `T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
      })
      return {
        focus: m1,
        watch: [subject],
        act: async () => must(await updateMeeting(w.B, m1.id, { ...spec(m1), endTime: end }), 'update'),
      }
    },
  },
  {
    name: 'moveToAnotherDay',
    methods: ['api'],
    async prepare(w, _method, tag) {
      const subject = `Probe ${tag} alpha`
      const m1 = await book(w.B, w.allRooms, w.date, subject, [w.A.personId], w.seq++)
      const newDate = localDate(8)
      return {
        focus: m1,
        watch: [subject],
        act: async () => {
          for (const room of w.allRooms) {
            const errors = await updateMeeting(w.B, m1.id, {
              ...spec(m1),
              roomId: room.id,
              startTime: m1.startTime.replace(w.date, newDate),
              endTime: m1.endTime.replace(w.date, newDate),
            })
            if (!errors.length) return
          }
          throw new Error('Could not move the meeting to any room on the new day')
        },
      }
    },
  },
  {
    name: 'attendeeResponds',
    methods: ['api', 'ui'],
    async prepare(w, method, tag) {
      // A organises, B attends and responds.
      const subject = `Probe ${tag} alpha`
      const m2 = await book(w.A, w.allRooms, w.date, subject, [w.B.personId], w.seq++)
      if (method === 'ui') {
        await w.B.page.goto(`/meetings/${m2.id}`)
        await expect(w.B.page.getByRole('button', { name: 'Maybe' })).toBeVisible({ timeout: 30_000 })
      }
      return {
        focus: m2,
        watch: [subject],
        act: async () => {
          if (method === 'api') must(await respond(w.B, m2.id, 'Maybe'), 'respond')
          else {
            await w.B.page.getByRole('button', { name: 'Maybe' }).click()
            await expect(w.B.page.getByRole('button', { name: 'Maybe' })).toHaveAttribute('aria-pressed', 'true')
          }
        },
      }
    },
  },
  {
    name: 'otherMeetingSameDay',
    methods: ['api', 'ui'],
    async prepare(w, method, tag) {
      const subject = `Probe ${tag} alpha`
      const m1 = await book(w.B, w.allRooms, w.date, subject, [w.A.personId], w.seq++)
      const otherBefore = `Probe ${tag} other one`
      const otherAfter = `Probe ${tag} other two`
      const m3 = await book(w.B, w.allRooms, w.date, otherBefore, [], w.seq++)
      if (method === 'ui') await w.B.page.goto(`/meetings/${m3.id}/edit`)
      return {
        focus: m1,
        watch: [subject],
        act: async () => {
          if (method === 'api') must(await updateMeeting(w.B, m3.id, { ...spec(m3), subject: otherAfter }), 'update')
          else await uiEditSubject(w.B.page, m3.id, otherBefore, otherAfter)
        },
      }
    },
  },
  {
    name: 'removedFromAttendees',
    methods: ['api'],
    async prepare(w, _method, tag) {
      const subject = `Probe ${tag} alpha`
      const m1 = await book(w.B, w.allRooms, w.date, subject, [w.A.personId], w.seq++)
      return {
        focus: m1,
        watch: [subject],
        act: async () => must(await updateMeeting(w.B, m1.id, { ...spec(m1), attendeeIds: [] }), 'update'),
      }
    },
  },
  {
    name: 'cancelled',
    methods: ['api', 'ui'],
    async prepare(w, method, tag) {
      const subject = `Probe ${tag} alpha`
      const m1 = await book(w.B, w.allRooms, w.date, subject, [w.A.personId], w.seq++)
      if (method === 'ui') {
        await w.B.page.goto(`/meetings/${m1.id}`)
        await expect(w.B.page.getByRole('button', { name: 'Cancel meeting' })).toBeVisible({ timeout: 30_000 })
      }
      return {
        focus: m1,
        watch: [subject],
        act: async () => {
          if (method === 'api') must(await cancelMeeting(w.B, m1.id), 'cancel')
          else {
            await w.B.page.getByRole('button', { name: 'Cancel meeting' }).click()
            await w.B.page.getByRole('dialog').getByRole('button', { name: 'Cancel meeting' }).click()
            await expect(w.B.page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })
          }
        },
      }
    },
  },
  {
    // No second user at all: A switches away from the tab and back.
    name: 'returnToTab',
    methods: ['none'],
    async prepare(w, _method, tag) {
      const subject = `Probe ${tag} alpha`
      const m1 = await book(w.B, w.allRooms, w.date, subject, [w.A.personId], w.seq++)
      return { focus: m1, watch: [subject], act: async () => {} }
    },
  },
]

async function setVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}

async function simulateTabSwitch(page: Page): Promise<void> {
  await setVisibility(page, 'hidden')
  await sleep(500)
  await setVisibility(page, 'visible')
}

interface ViewResult {
  view: string
  frames: number
  transientsPainted: Transient[]
  transientsDomOnly: Transient[]
  finalSig: Record<string, number>
  broadcastAfterMs: number[]
}

interface RunResult {
  scenario: string
  method: Method
  rep: number
  actMs: number
  views: ViewResult[]
  error?: string
}

test('multi-user live-update probe', async ({ browser }) => {
  const A = await signIn(browser, 'A', requireEnv('E2E_USER_EMAIL'), requireEnv('E2E_USER_PASSWORD'))
  // Created once, up front (it needs AWS credentials; nothing else in the probe does).
  const bAccount = process.env.PROBE_B_EMAIL
    ? { email: process.env.PROBE_B_EMAIL, password: requireEnv('PROBE_B_PASSWORD') }
    : freshTestAccount()
  if (!process.env.PROBE_B_EMAIL) await createConfirmedTestAccount(bAccount as ReturnType<typeof freshTestAccount>)
  const B = await signIn(browser, 'B', bAccount.email, bAccount.password)
  console.log(`A = ${A.name} (${A.personId}), B = ${B.name} (${B.personId})`)

  const world: World = { A, B, allRooms: await rooms(A), date: localDate(1), seq: 0 }
  const results: RunResult[] = []
  const outDir = `${process.cwd()}/test-output`
  mkdirSync(outDir, { recursive: true })

  for (const scenario of scenarios) {
    if (ONLY && !ONLY.includes(scenario.name)) continue
    for (const method of scenario.methods) {
      const reps = method === 'ui' ? REPS_UI : REPS_API
      for (let rep = 1; rep <= reps; rep++) {
        const tag = `${scenario.name}-${method}-${rep}-${Date.now() % 100000}`
        const result: RunResult = { scenario: scenario.name, method, rep, actMs: 0, views: [] }
        const pages: { name: string; page: Page }[] = []
        try {
          const prepared = await scenario.prepare(world, method, tag)
          const { focus } = prepared

          const overlay = await A.context.newPage()
          await openOverlay(overlay, focus)
          const popout = await A.context.newPage()
          await openPopout(popout, focus.id, focus.subject)
          const availability = await A.context.newPage()
          await openAvailability(availability, focus.date, focus.roomName)
          const calendar = await A.context.newPage()
          await calendar.goto(`/persons/${A.personId}/calendar`)
          const home = await A.context.newPage()
          await home.goto('/')
          pages.push(
            { name: 'A:overlay', page: overlay },
            { name: 'A:popout', page: popout },
            { name: 'A:availability', page: availability },
            { name: 'A:calendar', page: calendar },
            { name: 'A:home', page: home },
          )
          if (method === 'ui') pages.push({ name: 'B:own', page: B.page })
          for (const { page } of pages) await setWatch(page, prepared.watch)
          await waitForSubscriptions(pages.filter((p) => p.name.startsWith('A:')).map((p) => p.page))
          await sleep(2_000)

          const t0 = Date.now()
          if (scenario.name === 'returnToTab') {
            await Promise.all(pages.map(({ page }) => simulateTabSwitch(page)))
          } else {
            await prepared.act()
          }
          const tAct = Date.now()
          result.actMs = tAct - t0
          // What each view actually shows mid-refresh, and once settled.
          const shotDir = `${outDir}/shots/${tag}`
          mkdirSync(shotDir, { recursive: true })
          for (const at of [300, 1500]) {
            await sleep(Math.max(0, tAct + at - Date.now()))
            for (const { name, page } of pages) {
              await page.screenshot({ path: `${shotDir}/${name.replace(':', '-')}-${at}ms.png` }).catch(() => {})
            }
          }
          await sleep(Math.max(0, tAct + SETTLE_MS - Date.now()))
          for (const { name, page } of pages) {
            await page.screenshot({ path: `${shotDir}/${name.replace(':', '-')}-settled.png` }).catch(() => {})
          }
          const tEnd = Date.now()

          for (const { name, page } of pages) {
            const rec = await recording(page)
            result.views.push({
              view: name,
              frames: rec.frames,
              transientsPainted: transients(rec.frame, t0, tEnd, 'frame'),
              transientsDomOnly: transients(rec.mo, t0, tEnd, 'mo').filter(
                (m) => !transients(rec.frame, t0, tEnd, 'frame').some((f) => f.key === m.key),
              ),
              finalSig: finalSig(rec.frame),
              broadcastAfterMs: rec.ws
                .filter((m) => m.type === 'data' && m.t >= t0)
                .map((m) => Math.round(m.t - tAct)),
            })
          }

          if (scenario.name === 'cancelled' || scenario.name === 'moveToAnotherDay') {
            // Where the focus meeting really is now, for reading the final states.
            const now = await meetingById(A, focus.id)
            console.log(`  ${tag}: focus meeting now ${now ? now.startTime : 'gone'}`)
          }
        } catch (e) {
          result.error = String(e).slice(0, 500)
        } finally {
          for (const { name, page } of pages) if (name.startsWith('A:')) await page.close()
        }
        results.push(result)
        console.log(summariseRun(result))
        writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 2))
      }
    }
  }
})

function summariseRun(r: RunResult): string {
  const lines = [`${r.scenario} [${r.method}] #${r.rep}  act ${r.actMs}ms${r.error ? '  ERROR ' + r.error : ''}`]
  for (const v of r.views) {
    const painted = v.transientsPainted
      .map((t) => `${t.key} ${t.before}->${t.extreme}->${t.after} @${t.startMs}ms for ${t.durationMs}ms${t.progressShown ? ' (progress shown)' : ''}`)
      .join('; ')
    const dom = v.transientsDomOnly.map((t) => `${t.key} ${t.before}->${t.extreme}->${t.after} ${t.durationMs}ms`).join('; ')
    lines.push(
      `   ${v.view.padEnd(15)} frames=${v.frames} bcast=${JSON.stringify(v.broadcastAfterMs)} ` +
        `${painted ? 'PAINTED: ' + painted : 'clean'}${dom ? '  | dom-only: ' + dom : ''}  final=${JSON.stringify(v.finalSig)}`,
    )
  }
  return lines.join('\n')
}
