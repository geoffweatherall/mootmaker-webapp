// Pure logic extracted from AddMeetingPage.tsx so it can be unit-tested (Vitest) without
// rendering the component or mocking Apollo - see testing-strategy.md's "Unit tests" layer. Kept
// deliberately free of React/Apollo imports; AddMeetingPage.tsx wires these into its own
// useState/useEffect and the useLazyQuery-driven `suggestRoom` call.
import type { Dayjs } from 'dayjs'
import type { Person, Room } from '../graphql/types'

// --- Organiser/attendee mutual exclusivity -------------------------------------------------
//
// See README.md's "Organiser/attendee mutual exclusivity" section: the same person can never be
// picked as both, so each dropdown's options exclude whoever is currently selected on the other.

export function filterOrganiserOptions(people: Person[], attendeeIds: string[]): Person[] {
  return people.filter((person) => !attendeeIds.includes(person.id))
}

export function filterAttendeeOptions(people: Person[], organiserId: string): Person[] {
  return people.filter((person) => person.id !== organiserId)
}

// --- Suggested-room caching -----------------------------------------------------------------
//
// See README.md's "Suggested-room caching" section. `candidates: null` means "not fetched yet for
// the current time/attendee-count inputs"; `[]` means "fetched, and nothing qualified" - the two
// are kept distinct so a second press can tell them apart without re-querying either way.
//
// `key` identifies which time/attendee-count inputs the cache was built for (see
// AddMeetingPage.tsx's suggestionKey). Staleness is checked against it directly inside
// handleSuggestRoom on every press, rather than via a separate effect watching those same inputs
// and clearing the cache asynchronously - the two-effects-race that shape used to have (the reset
// effect not yet having run by the time a fast next press reads the cache, so a press right after
// changing the attendee count could silently reuse an already-stale candidate list instead of
// re-fetching) is real under genuine network latency even though it never reproduces against a
// near-instant mock. Comparing the key inline removes the race by construction: there's no second
// piece of state that can lag behind.

export interface SuggestionCache {
  candidates: Room[] | null
  index: number
  key: string
}

export function initialSuggestionCache(): SuggestionCache {
  return { candidates: null, index: 0, key: '' }
}

export interface SuggestionStep {
  /** The new cache to store in component state. */
  cache: SuggestionCache
  /** The room to fill into the Room field, or null if none qualified (show the inline message). */
  room: Room | null
}

/**
 * Advances the suggestion cache by one step for the given `key`. Pass `fetchedRooms` only when
 * the cache turns out to need a fresh fetch for this `key` (either it's for a different key, or
 * `candidates` is still `null`) - it's ignored otherwise, since a cached list for the same key is
 * stepped through locally without a further fetch.
 */
export function advanceSuggestion(cache: SuggestionCache, key: string, fetchedRooms?: Room[]): SuggestionStep {
  let candidates = cache.key === key ? cache.candidates : null
  let index = cache.key === key ? cache.index : 0

  if (candidates === null) {
    candidates = fetchedRooms ?? []
    index = 0
  } else if (candidates.length > 0) {
    index = (index + 1) % candidates.length
  }

  return {
    cache: { candidates, index, key },
    room: candidates.length === 0 ? null : candidates[index],
  }
}

// --- Default meeting times ------------------------------------------------------------------
//
// The API requires both start and end to fall on a 15-minute boundary, and a meeting may not span
// midnight (see MeetingError.SpansMultipleDays). Those two rules interact awkwardly late in the
// evening, which is where this used to be wrong: the old midnight guard fell back to 23:55, which
// is not on the grid, so between 22:45 and 23:45 local time the form pre-filled an end time the
// API was guaranteed to reject - a field the user never touched. See mootmaker-webapp#48; it broke
// release v1.0.0 because GitHub runners are UTC and that run happened to start at 23:44:47.
//
// Both values are returned together rather than as two functions. Computing them from separate
// dayjs() calls meant the clock could tick across a boundary between the two, making the end time
// inconsistent with the start it was supposedly derived from.

/** Rounds up to the next 15-minute boundary, leaving an already-aligned time alone. */
export function nextFifteenMinuteBoundary(from: Dayjs): Dayjs {
  const rounded = from.second(0).millisecond(0)
  const remainder = rounded.minute() % 15
  return remainder === 0 ? rounded : rounded.add(15 - remainder, 'minute')
}

export interface DefaultMeetingTimes {
  start: Dayjs
  end: Dayjs
}

/**
 * The times the Add Meeting form starts with: the next 15-minute boundary, running for an hour.
 *
 * When that hour would cross midnight the pair is clamped back to the last slot that fits on the
 * grid before it - 23:30 to 23:45 at the extreme. Rolling forward to the next day was considered
 * and rejected: the date field is separate and defaults to today (or whichever date the user was
 * looking at), so quietly moving it would be more surprising than a short default meeting.
 */
export function defaultMeetingTimes(now: Dayjs): DefaultMeetingTimes {
  const start = nextFifteenMinuteBoundary(now)
  const candidateEnd = start.add(1, 'hour')
  if (candidateEnd.isSame(start, 'day')) {
    return { start, end: candidateEnd }
  }
  const end = start.hour(23).minute(45).second(0).millisecond(0)
  // A 23:45 start leaves no room for an end after it, so give up the hour rather than the grid.
  const clampedStart = start.isBefore(end) ? start : end.subtract(15, 'minute')
  return { start: clampedStart, end }
}

/**
 * Whether the form may be rendered interactive yet.
 *
 * Two independent loads gate it, and the second one is easy to miss because it is not this page's
 * own query: reference data (rooms and people, which the fields render from) AND the signed-in
 * user's own Person (which the Organiser field DEFAULTS to, and which arrives from the SESSION
 * query in AuthProvider).
 *
 * Rendering on reference data alone means the form is submittable while Organiser is still blank.
 * A fast Save then sends `organiserId: ""`, the server rejects it with `OrganiserRequired`, and the
 * user reads "Please select an organiser." while watching the field fill in with their own name.
 *
 * This was latent for as long as reference data always cost a round trip - reliably slower than the
 * SESSION query, so the person always won. Serving reference data from the cache reverses the order
 * on any second visit. A race that is invisible until something else gets faster.
 */
export function referenceDataReady(referenceLoading: boolean, personLoading: boolean): boolean {
  return !referenceLoading && !personLoading
}
