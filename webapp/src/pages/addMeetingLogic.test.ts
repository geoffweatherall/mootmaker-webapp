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
  it('starts with no cached candidates and index 0', () => {
    expect(initialSuggestionCache()).toEqual({ candidates: null, index: 0 })
  })
})

describe('advanceSuggestion', () => {
  it('on the first press (candidates: null), uses the freshly fetched ranked list and picks its first room', () => {
    const cache = initialSuggestionCache()
    const step = advanceSuggestion(cache, [roomA, roomB, roomC])

    expect(step.room).toBe(roomA)
    expect(step.cache).toEqual({ candidates: [roomA, roomB, roomC], index: 0 })
  })

  it('on a further press, steps to the next cached room without needing a fetched list', () => {
    const cache: SuggestionCache = { candidates: [roomA, roomB, roomC], index: 0 }
    const step = advanceSuggestion(cache)

    expect(step.room).toBe(roomB)
    expect(step.cache).toEqual({ candidates: [roomA, roomB, roomC], index: 1 })
  })

  it('wraps back around to the first room once every cached room has been offered', () => {
    const cache: SuggestionCache = { candidates: [roomA, roomB, roomC], index: 2 }
    const step = advanceSuggestion(cache)

    expect(step.room).toBe(roomA)
    expect(step.cache.index).toBe(0)
  })

  it('cycles a single-room list back to itself every press', () => {
    let cache: SuggestionCache = { candidates: [roomA], index: 0 }
    const first = advanceSuggestion(cache)
    expect(first.room).toBe(roomA)
    cache = first.cache
    const second = advanceSuggestion(cache)
    expect(second.room).toBe(roomA)
  })

  it('returns a null room, and stays on an empty cached list, when the fetched list is empty', () => {
    const cache = initialSuggestionCache()
    const step = advanceSuggestion(cache, [])

    expect(step.room).toBeNull()
    expect(step.cache).toEqual({ candidates: [], index: 0 })
  })

  it('keeps returning a null room on further presses against an already-empty cached list, without fetching again', () => {
    const cache: SuggestionCache = { candidates: [], index: 0 }
    const step = advanceSuggestion(cache)

    expect(step.room).toBeNull()
    expect(step.cache).toEqual({ candidates: [], index: 0 })
  })

  it('ignores a fetchedRooms argument when candidates are already cached (no re-fetch needed)', () => {
    const cache: SuggestionCache = { candidates: [roomA, roomB], index: 0 }
    const step = advanceSuggestion(cache, [roomC])

    expect(step.room).toBe(roomB)
    expect(step.cache.candidates).toEqual([roomA, roomB])
  })
})
