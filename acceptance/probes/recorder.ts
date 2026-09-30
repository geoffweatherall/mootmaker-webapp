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
