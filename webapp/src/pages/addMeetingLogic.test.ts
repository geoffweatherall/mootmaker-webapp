import { describe, expect, it } from 'vitest'
import {
  advanceSuggestion,
  filterAttendeeOptions,
  filterOrganiserOptions,
  initialSuggestionCache,
  type SuggestionCache,
} from './addMeetingLogic'
import type { Person, Room } from '../graphql/types'

const alice: Person = { id: 'p1', name: 'Alice' }
const bob: Person = { id: 'p2', name: 'Bob' }
const carol: Person = { id: 'p3', name: 'Carol' }
const people: Person[] = [alice, bob, carol]

const roomA: Room = { id: 'r1', name: 'Room A', capacity: 4 }
const roomB: Room = { id: 'r2', name: 'Room B', capacity: 6 }
const roomC: Room = { id: 'r3', name: 'Room C', capacity: 8 }

const keyA = '2026-01-01T10:00:00|2026-01-01T11:00:00|2'
const keyB = '2026-01-01T10:00:00|2026-01-01T11:00:00|4'

describe('filterOrganiserOptions', () => {
  it('excludes anyone currently selected as an attendee', () => {
    expect(filterOrganiserOptions(people, [bob.id])).toEqual([alice, carol])
  })

  it('excludes every attendee when more than one is selected', () => {
    expect(filterOrganiserOptions(people, [bob.id, carol.id])).toEqual([alice])
  })

  it('offers everyone when nobody is selected as an attendee yet', () => {
    expect(filterOrganiserOptions(people, [])).toEqual(people)
  })
})

describe('filterAttendeeOptions', () => {
  it('excludes whoever is currently the organiser', () => {
    expect(filterAttendeeOptions(people, alice.id)).toEqual([bob, carol])
  })

  it('offers everyone when no organiser is selected yet', () => {
    expect(filterAttendeeOptions(people, '')).toEqual(people)
  })
})

describe('initialSuggestionCache', () => {
  it('starts with no cached candidates, index 0, and no key', () => {
    expect(initialSuggestionCache()).toEqual({ candidates: null, index: 0, key: '' })
  })
})

describe('advanceSuggestion', () => {
  it('on the first press (candidates: null), uses the freshly fetched ranked list and picks its first room', () => {
    const cache = initialSuggestionCache()
    const step = advanceSuggestion(cache, keyA, [roomA, roomB, roomC])

    expect(step.room).toBe(roomA)
    expect(step.cache).toEqual({ candidates: [roomA, roomB, roomC], index: 0, key: keyA })
  })

  it('on a further press for the same key, steps to the next cached room without needing a fetched list', () => {
    const cache: SuggestionCache = { candidates: [roomA, roomB, roomC], index: 0, key: keyA }
    const step = advanceSuggestion(cache, keyA)

    expect(step.room).toBe(roomB)
    expect(step.cache).toEqual({ candidates: [roomA, roomB, roomC], index: 1, key: keyA })
  })

  it('wraps back around to the first room once every cached room has been offered', () => {
    const cache: SuggestionCache = { candidates: [roomA, roomB, roomC], index: 2, key: keyA }
    const step = advanceSuggestion(cache, keyA)

    expect(step.room).toBe(roomA)
    expect(step.cache.index).toBe(0)
  })

  it('cycles a single-room list back to itself every press', () => {
    let cache: SuggestionCache = { candidates: [roomA], index: 0, key: keyA }
    const first = advanceSuggestion(cache, keyA)
    expect(first.room).toBe(roomA)
    cache = first.cache
    const second = advanceSuggestion(cache, keyA)
    expect(second.room).toBe(roomA)
  })

  it('returns a null room, and stays on an empty cached list, when the fetched list is empty', () => {
    const cache = initialSuggestionCache()
    const step = advanceSuggestion(cache, keyA, [])

    expect(step.room).toBeNull()
    expect(step.cache).toEqual({ candidates: [], index: 0, key: keyA })
  })

  it('keeps returning a null room on further presses against an already-empty cached list, without fetching again', () => {
    const cache: SuggestionCache = { candidates: [], index: 0, key: keyA }
    const step = advanceSuggestion(cache, keyA)

    expect(step.room).toBeNull()
    expect(step.cache).toEqual({ candidates: [], index: 0, key: keyA })
  })

  it('ignores a fetchedRooms argument when candidates are already cached for the same key (no re-fetch needed)', () => {
    const cache: SuggestionCache = { candidates: [roomA, roomB], index: 0, key: keyA }
    const step = advanceSuggestion(cache, keyA, [roomC])

    expect(step.room).toBe(roomB)
    expect(step.cache.candidates).toEqual([roomA, roomB])
  })

  // Regression test for a real race: the cache used to be invalidated by a separate effect
  // watching time/attendee-count and clearing it asynchronously, which could still be "not yet
  // run" by the time a fast next press read it - a press right after the key changed could
  // silently reuse an already-stale candidate list instead of re-fetching. Comparing `key` inline
  // removes that: a mismatched key is always treated as stale, however the cache got here.
  it('treats a cache for a different key as stale even when candidates are non-null, and requires a fresh fetched list', () => {
    const staleCache: SuggestionCache = { candidates: [roomA, roomB, roomC], index: 1, key: keyA }
    const step = advanceSuggestion(staleCache, keyB, [roomC])

    expect(step.room).toBe(roomC)
    expect(step.cache).toEqual({ candidates: [roomC], index: 0, key: keyB })
  })
})
