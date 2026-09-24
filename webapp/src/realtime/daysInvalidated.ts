import type { InMemoryCache } from '@apollo/client'

/**
 * Turns "these dates changed" broadcasts into cache evictions.
 *
 * The broadcast carries dates, never data, so there is nothing to merge and no ordering to reason
 * about: evict `Day:<date>`, and the ordinary gap fetch refills it when something is watching. An
 * eviction for a day nobody is looking at is a complete no-op, which is intended rather than a
 * missed optimisation.
 */

/**
 * How long a date this client wrote itself is ignored for.
 *
 * Long enough to cover the broadcast round trip, short enough that a genuinely different change by
 * someone else to the same date is not swallowed for long. That trade-off is real and is accepted
 * deliberately - see `noteOwnWrite`.
 */
const OWN_WRITE_GRACE_MS = 5_000

export class DayInvalidations {
  private readonly cache: InMemoryCache
  private readonly now: () => number

  /** date -> when this client's own mutation wrote it. See `noteOwnWrite`. */
  private readonly ownWrites = new Map<string, number>()

  /**
   * date -> when it was last invalidated.
   *
   * The in-flight race this closes: A writes at t0. B's fetch was issued at t-1 and lands at t+1
   * carrying pre-write data, AFTER B evicted at t0 - so B's cache ends up holding stale data with
   * nothing left to trigger another refetch. B is stale indefinitely, on one machine, with no error
   * anywhere. Comparing a response's issue time against this marker catches exactly that case.
   */
  private readonly lastInvalidatedAt = new Map<string, number>()

  constructor(cache: InMemoryCache, now: () => number = Date.now) {
    this.cache = cache
    this.now = now
  }

  /**
   * Records that this client's own mutation authoritatively wrote these dates.
   *
   * Without this the tab that just booked evicts the `Day` its own mutation response just wrote,
   * refetches it, and renders empty in between - so **the person who made the booking watches their
   * own screen flicker, on every create**. That is a visible defect, not a wasted round trip.
   *
   * The cost, stated rather than hidden: if someone else changes the same date inside the grace
   * window, this client ignores that too and stays stale until it next navigates. Accepted because
   * the window is seconds and the alternative is a guaranteed flicker on every booking.
   */
  noteOwnWrite(dates: readonly string[]): void {
    const at = this.now()
    for (const date of dates) this.ownWrites.set(date, at)
  }

  /** Applies a broadcast. Returns the dates actually evicted, which the tests assert on. */
  invalidate(dates: readonly string[]): string[] {
    const at = this.now()
    const evicted: string[] = []
    for (const date of dates) {
      this.lastInvalidatedAt.set(date, at)
      if (this.isOwnRecentWrite(date, at)) continue
      if (this.evict(date)) evicted.push(date)
    }
    if (evicted.length > 0) this.cache.gc()
    return evicted
  }

  /**
   * Call with the time a fetch was ISSUED, once its response has been written to the cache.
   *
   * Any date invalidated after that moment was invalidated while the response was in flight, so the
   * data just written may predate the change. Evicting again is the only safe answer: the response
   * cannot be known to be current, and the alternative is silent, permanent staleness.
   */
  reconcileAfterFetch(dates: readonly string[], issuedAt: number): string[] {
    const evicted: string[] = []
    for (const date of dates) {
      const invalidatedAt = this.lastInvalidatedAt.get(date)
      if (invalidatedAt !== undefined && invalidatedAt > issuedAt && this.evict(date)) {
        evicted.push(date)
      }
    }
    if (evicted.length > 0) this.cache.gc()
    return evicted
  }

  /**
   * Evicts every day currently held, used after a gap in the connection.
   *
   * A subscription cannot outlive its connection and AppSync does not replay, so anything published
   * while disconnected is lost. The client never needs to know WHAT it missed - only to stop
   * trusting what it holds. This is also why correctness must not depend on the socket surviving.
   */
  invalidateEverything(): string[] {
    const dates = this.cachedDates()
    // Deliberately ignores ownWrites: after a gap, a date this client wrote may ALSO have been
    // changed by someone else while the socket was down, and there is no way to tell.
    const evicted = dates.filter((date) => this.evict(date))
    if (evicted.length > 0) this.cache.gc()
    return evicted
  }

  private isOwnRecentWrite(date: string, at: number): boolean {
    const wroteAt = this.ownWrites.get(date)
    if (wroteAt === undefined) return false
    if (at - wroteAt <= OWN_WRITE_GRACE_MS) return true
    // Expired: drop it so the map cannot grow without bound over a long session.
    this.ownWrites.delete(date)
    return false
  }

  /**
   * `identify` rather than a hand-built `Day:{"date":...}` string. The key format is Apollo's
   * business - it follows from `keyFields: ['date']` in the type policy - and hardcoding it here
   * would make a cache-key change fail silently as an eviction that quietly stops matching.
   */
  private evict(date: string): boolean {
    const id = this.cache.identify({ __typename: 'Day', date })
    if (id === undefined) return false
    this.evictMeetingsOf(id)
    return this.cache.evict({ id })
  }

  /**
   * Evicts every Meeting the day currently references, before the day itself goes.
   *
   * Evicting the Day alone leaves each Meeting entity's own fields completely untouched - fine
   * for a meeting that's still there (the refetch this triggers overwrites it fresh a moment
   * later regardless), but wrong for one that's been CANCELLED: nothing else ever removes a
   * Meeting entity on its own, and Apollo's automatic `cache.gc()` (called right after this by
   * every caller of `evict`) does not reliably collect an entity that still has an active
   * watcher - which an open `MeetingDetailContent`'s own `useFragment` on this exact id always
   * is. Without this, that sheet's `complete` flag could stay `true` indefinitely, watching an
   * entity that no longer corresponds to anything (see designs/edit-and-cancel-meetings.md's
   * Decision 10 - this is the fix that decision needed and gc() alone didn't reliably provide).
   *
   * Safe either way: a still-valid meeting is simply incomplete for the brief window until the
   * refetch this triggers lands and writes it fresh - the same transient every Day-level eviction
   * here already accepts, not a new category of risk.
   */
  private evictMeetingsOf(dayId: string): void {
    const day = this.cache.extract()[dayId] as { meetings?: readonly { __ref?: string }[] } | undefined
    for (const ref of day?.meetings ?? []) {
      if (ref.__ref) this.cache.evict({ id: ref.__ref })
    }
  }

  /** Every `Day` the cache currently holds, read from the cache rather than tracked separately. */
  private cachedDates(): string[] {
    const extracted = this.cache.extract() as Record<string, { __typename?: string; date?: string }>
    return Object.values(extracted)
      .filter((entity) => entity?.__typename === 'Day' && typeof entity.date === 'string')
      .map((entity) => entity.date as string)
  }
}
