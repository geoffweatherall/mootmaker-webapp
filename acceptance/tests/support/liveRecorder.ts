import type { BrowserContext, Page } from '@playwright/test'

/**
 * Injected into every page before any app script runs. Records what the page SHOWS over time, two
 * ways, as independent series:
 *
 *  - 'frame': sampled in every requestAnimationFrame, i.e. just before the browser paints. A state
 *    seen here was, to within a frame, on screen.
 *  - 'mo': sampled on every DOM mutation. Catches states that existed in the DOM between frames and
 *    may never have been painted.
 *
 * Each series logs only when its own signature changes. A signature is the count of each
 * negative/empty-state phrase in the visible text (innerText, so collapsed or hidden text does not
 * count), the count of each watched string (e.g. a meeting's subject), and the number of progress
 * indicators.
 *
 * Also logs every non-keepalive AppSync WebSocket message, so a broadcast's arrival can be lined up
 * against what the page did next.
 */
export function recorder(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  if (w.__rec) return
  const rec = {
    frame: [] as { t: number; sig: Record<string, number> }[],
    mo: [] as { t: number; sig: Record<string, number> }[],
    ws: [] as { t: number; type: string; body: string }[],
    watch: [] as string[],
    frames: 0,
  }
  w.__rec = rec
  const now = () => performance.timeOrigin + performance.now()

  const PHRASES: [string, RegExp][] = [
    ['cancelled', /This meeting was cancelled\./g],
    ['meetingNotFound', /Meeting not found\./g],
    ['noMeetingsBooked', /No meetings booked for/g],
    ['freeAllDay', /Free all day/g],
    ['noMeetings', /(^|\n)No meetings(\n|$)/g],
    ['noMeetingsTodayTomorrow', /No meetings today or tomorrow\./g],
    ['nothingWaiting', /Nothing waiting on a response/g],
    ['noRooms', /No rooms exist yet\./g],
    ['noPeople', /No people exist yet\./g],
    ['countZero', /meetings \(0\)/g],
    ['noLongerExists', /no longer exists/g],
  ]

  function signature(): Record<string, number> | null {
    if (!document.body) return null
    const text = document.body.innerText
    const sig: Record<string, number> = {}
    for (const [key, re] of PHRASES) {
      const m = text.match(re)
      if (m) sig[key] = m.length
    }
    for (const s of rec.watch) sig['watch:' + s] = text.split(s).length - 1
    const progress = document.querySelectorAll('[role=progressbar]').length
    if (progress) sig.progress = progress
    return sig
  }

  const last = { frame: '', mo: '' }
  function sample(source: 'frame' | 'mo') {
    const sig = signature()
    if (!sig) return
    const key = JSON.stringify(sig)
    if (key === last[source]) return
    last[source] = key
    rec[source].push({ t: now(), sig })
  }

  const loop = () => {
    rec.frames++
    sample('frame')
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  const startObserver = () =>
    new MutationObserver(() => sample('mo')).observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    })
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver)
  else startObserver()

  const Original = window.WebSocket
  class Recording extends Original {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      this.addEventListener('message', (event) => {
        const body = String(event.data)
        let type = '?'
        try {
          type = JSON.parse(body).type ?? '?'
        } catch {
          // not JSON
        }
        if (type === 'ka') return
        rec.ws.push({ t: now(), type, body: body.slice(0, 400) })
      })
    }
  }
  window.WebSocket = Recording as typeof WebSocket

  // Lets the probe force an immediate sample after changing the watch list.
  w.__recResample = () => {
    last.frame = ''
    last.mo = ''
    sample('frame')
    sample('mo')
  }
}

// ---------------------------------------------------------------------------------------------
// Test-side helpers (mootmaker-webapp#137)


interface Sample {
  t: number
  sig: Record<string, number>
}

interface Recording {
  frame: Sample[]
  mo: Sample[]
  ws: { t: number; type: string; body: string }[]
  frames: number
}

/** Injects the recorder into every page this context opens, before any app script runs. */
export async function recordLiveUpdates(context: BrowserContext): Promise<void> {
  await context.addInitScript(recorder)
}

/** Sets the strings to count on screen - typically a meeting's subject, old and new. */
export async function watchFor(page: Page, strings: string[]): Promise<void> {
  await page.evaluate((watched) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__rec.watch = watched
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__recResample()
  }, strings)
}

/** Waits until the page's live-update subscription is acknowledged, so a change is not missed. */
export async function subscribed(page: Page): Promise<void> {
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (window as any).__rec.ws.some((message: { type: string }) => message.type === 'start_ack'),
    undefined,
    { timeout: 30_000 },
  )
}

/** Milliseconds since the epoch, on the same clock the recorder stamps samples with. */
export function now(): number {
  return Date.now()
}

/**
 * Something a view showed, between `from` and `to`, that was true neither before nor after: a
 * negative phrase that came and went ("This meeting was cancelled." 0 -> 1 -> 0), or watched
 * content that vanished and came back (a subject 1 -> 0 -> 1). Only states seen at an animation
 * frame count - those were on screen.
 */
export interface Transient {
  key: string
  before: number
  extreme: number
  after: number
  durationMs: number
}

export async function transientsBetween(page: Page, from: number, to: number): Promise<Transient[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rec = (await page.evaluate(() => (window as any).__rec)) as Recording
  const samples = rec.frame.map((s) => {
    const sig = { ...s.sig }
    const watched = Object.keys(sig).filter((k) => k.startsWith('watch:'))
    // Renaming a meeting swaps one watched subject for another; only "neither shown" is a gap.
    if (watched.length) sig['watch:any'] = watched.reduce((sum, k) => sum + sig[k], 0)
    return { t: s.t, sig }
  })
  const keys = new Set(samples.flatMap((s) => Object.keys(s.sig)))
  keys.delete('progress')
  let startIndex = -1
  samples.forEach((s, i) => {
    if (s.t < from) startIndex = i
  })
  const inWindow = samples.map((s, i) => ({ ...s, i })).filter((s) => s.t >= from && s.t <= to)
  const endIndex = inWindow.length ? inWindow[inWindow.length - 1].i : startIndex
  const valueAt = (i: number, key: string) => (i < 0 ? 0 : (samples[i].sig[key] ?? 0))

  const found: Transient[] = []
  for (const key of keys) {
    if (key.startsWith('watch:') && key !== 'watch:any') continue
    const before = valueAt(startIndex, key)
    const after = valueAt(endIndex, key)
    const lo = Math.min(before, after)
    const hi = Math.max(before, after)
    let open = null as { start: number; extreme: number } | null
    for (const s of inWindow) {
      const v = s.sig[key] ?? 0
      if (v < lo || v > hi) {
        open = open ? { ...open, extreme: v > hi ? Math.max(open.extreme, v) : Math.min(open.extreme, v) } : { start: s.t, extreme: v }
      } else if (open) {
        found.push({ key, before, extreme: open.extreme, after, durationMs: Math.round(s.t - open.start) })
        open = null
      }
    }
    if (open) found.push({ key, before, extreme: open.extreme, after, durationMs: -1 })
  }
  return found
}

/** Switches the page away and back, as a user changing tabs does. */
export async function switchTabAwayAndBack(page: Page): Promise<void> {
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((v) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    }, state)
  await setVisibility('hidden')
  await page.waitForTimeout(500)
  await setVisibility('visible')
}
