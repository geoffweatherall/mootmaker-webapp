// Pure logic extracted from AddMeetingPage.tsx so it can be unit-tested (Vitest) without
// rendering the component or mocking Apollo - see testing-strategy.md's "Unit tests" layer. Kept
// deliberately free of React/Apollo imports; AddMeetingPage.tsx wires these into its own
// useState/useEffect and the useLazyQuery-driven `suggestRoom` call.
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
