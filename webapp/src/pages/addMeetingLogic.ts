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

export interface SuggestionCache {
  candidates: Room[] | null
  index: number
}

export function initialSuggestionCache(): SuggestionCache {
  return { candidates: null, index: 0 }
}

export interface SuggestionStep {
  /** The new cache to store in component state. */
  cache: SuggestionCache
  /** The room to fill into the Room field, or null if none qualified (show the inline message). */
  room: Room | null
}

/**
 * Advances the suggestion cache by one step. Pass `fetchedRooms` only when `cache.candidates` is
 * still `null` (i.e. the caller just fetched a fresh ranked list via `suggestRoom` because there
 * was nothing cached to step through yet) - it's ignored otherwise, since a cached list is
 * stepped through locally without a further fetch.
 */
export function advanceSuggestion(cache: SuggestionCache, fetchedRooms?: Room[]): SuggestionStep {
  let candidates = cache.candidates
  let index = cache.index

  if (candidates === null) {
    candidates = fetchedRooms ?? []
    index = 0
  } else if (candidates.length > 0) {
    index = (index + 1) % candidates.length
  }

  return {
    cache: { candidates, index },
    room: candidates.length === 0 ? null : candidates[index],
  }
}
