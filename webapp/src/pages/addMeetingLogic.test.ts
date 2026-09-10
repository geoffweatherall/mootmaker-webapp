import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import {
  advanceSuggestion,
  defaultMeetingTimes,
  filterAttendeeOptions,
  filterOrganiserOptions,
  initialSuggestionCache,
  referenceDataReady,
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

describe('defaultMeetingTimes', () => {
  const at = (hour: number, minute: number, second = 0) => dayjs('2026-09-05').hour(hour).minute(minute).second(second)

  it('starts at the next 15-minute boundary and runs for an hour', () => {
    const { start, end } = defaultMeetingTimes(at(10, 7))
    expect(start.format('HH:mm')).toBe('10:15')
    expect(end.format('HH:mm')).toBe('11:15')
  })

  it('leaves an already-aligned time alone rather than pushing it on 15 minutes', () => {
    expect(defaultMeetingTimes(at(10, 30)).start.format('HH:mm')).toBe('10:30')
  })

  it('ignores seconds when deciding whether a time is already aligned', () => {
    // Seconds are truncated before the check, so 10:30:42 counts as already on the boundary and
    // stays at 10:30 rather than being pushed on to 10:45.
    expect(defaultMeetingTimes(at(10, 30, 42)).start.format('HH:mm:ss')).toBe('10:30:00')
  })

  // mootmaker-webapp#48: the midnight guard used to fall back to 23:55, which is not on the
  // 15-minute grid the API requires, so the form pre-filled an end time that was always rejected.
  it.each([
    ['22:46', 22, 46, '23:00', '23:45'],
    ['23:00', 23, 0, '23:00', '23:45'],
    ['23:20', 23, 20, '23:30', '23:45'],
    ['23:44', 23, 44, '23:30', '23:45'],
  ])('clamps to the last slot before midnight at %s', (_label, h, m, expectedStart, expectedEnd) => {
    const { start, end } = defaultMeetingTimes(at(h, m))
    expect(start.format('HH:mm')).toBe(expectedStart)
    expect(end.format('HH:mm')).toBe(expectedEnd)
  })

  // The exhaustive form of the above. Every minute of the day, checked against every rule the API
  // enforces - which is the check that would have caught #48 the day it was written.
  it('produces a valid meeting at every single minute of the day', () => {
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute++) {
        const { start, end } = defaultMeetingTimes(at(hour, minute))
        const where = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
        expect(start.minute() % 15, `start off the grid at ${where}`).toBe(0)
        expect(end.minute() % 15, `end off the grid at ${where}`).toBe(0)
        expect(end.isAfter(start), `end not after start at ${where}`).toBe(true)
        expect(end.isSame(start, 'day'), `spans midnight at ${where}`).toBe(true)
        expect(start.second() + start.millisecond(), `start not zeroed at ${where}`).toBe(0)
        expect(end.second() + end.millisecond(), `end not zeroed at ${where}`).toBe(0)
      }
    }
  })
})

describe('referenceDataReady', () => {
  it('waits for the reference data the fields render from', () => {
    expect(referenceDataReady(true, false)).toBe(false)
  })

  it("waits for the signed-in user's own Person, which the Organiser field defaults to", () => {
    // The regression this exists to prevent: rendering here makes the form submittable with a blank
    // Organiser, and the server answers OrganiserRequired - "Please select an organiser." - while
    // the field fills in with the user's own name. Caught by acceptance test F.50, which loads
    // reference data into the cache (by creating a room) and then opens this page, so reference
    // data is instant and the SESSION query is the one still in flight.
    expect(referenceDataReady(false, true)).toBe(false)
  })

  it('renders once both have settled, whether or not a Person was actually found', () => {
    // personLoading goes false either way, so an account with no linked Person gets the form with a
    // blank Organiser - the degraded-but-usable case - rather than a permanent spinner. There is no
    // separate case to assert here: "no linked Person" IS (false, false), and writing it as its own
    // test would assert the same inputs twice while reading like extra coverage.
    expect(referenceDataReady(false, false)).toBe(true)
  })
})
