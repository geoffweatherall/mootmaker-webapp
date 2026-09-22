import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import type { Meeting, Person, Room } from '../graphql/types'
import {
  formatRangeLabel,
  mergeNeedsResponseEntries,
  needsResponseEntriesForDay,
  nextSearchDates,
  windowEndOffset,
  type NeedsResponseEntry,
} from './searchFurtherAheadLogic'

describe('windowEndOffset', () => {
  it('is 2 (today + the next two days) at level 0, matching PAGE_LOAD\'s own fixed window', () => {
    expect(windowEndOffset(0)).toBe(2)
  })

  it('advances by 3 more days per level', () => {
    expect(windowEndOffset(1)).toBe(5)
    expect(windowEndOffset(2)).toBe(8)
    expect(windowEndOffset(3)).toBe(11)
  })
})

describe('nextSearchDates', () => {
  const today = dayjs('2026-09-22')

  it('covers the 3 days immediately past the initial window on the first click', () => {
    expect(nextSearchDates(0, today)).toEqual(['2026-09-25', '2026-09-26', '2026-09-27'])
  })

  it('covers the next 3 days past that on a second click, never re-covering the first', () => {
    expect(nextSearchDates(1, today)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
  })
})

describe('formatRangeLabel', () => {
  it('names both ends of the current window', () => {
    const today = dayjs('2026-09-22')
    expect(formatRangeLabel(today, 0)).toBe('Tue 22 Sep – Thu 24 Sep')
    expect(formatRangeLabel(today, 1)).toBe('Tue 22 Sep – Sun 27 Sep')
  })
})

function meeting(id: string, startTime: string, organiserId: string, attendeeId: string, status: Meeting['attendees'][number]['status']): Meeting {
  return {
    id,
    subject: `Meeting ${id}`,
    startTime,
    endTime: startTime,
    room: { id: 'room-1' },
    organiser: { id: organiserId },
    attendees: [{ person: { id: attendeeId }, status }],
  } as Meeting
}

const PERSON_ID = 'person-me'
const peopleById = new Map<string, Person>([['person-organiser', { id: 'person-organiser', name: 'Jordan Lee' } as Person]])
const roomsById = new Map<string, Room>([['room-1', { id: 'room-1', name: 'Kauri', capacity: 4 } as Room]])

describe('needsResponseEntriesForDay', () => {
  it('includes a meeting where the person is an attendee who has not responded', () => {
    const day = { date: '2026-09-22', meetings: [meeting('m1', '2026-09-22T10:00:00', 'person-organiser', PERSON_ID, 'NoResponse')] }
    const entries = needsResponseEntriesForDay(day, PERSON_ID, peopleById, roomsById, 'initial')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ organiserName: 'Jordan Lee', roomName: 'Kauri', source: 'initial' })
  })

  it('excludes a meeting the person organises, even with no response recorded', () => {
    const day = { date: '2026-09-22', meetings: [meeting('m1', '2026-09-22T10:00:00', PERSON_ID, 'person-organiser', 'NoResponse')] }
    expect(needsResponseEntriesForDay(day, PERSON_ID, peopleById, roomsById, 'initial')).toEqual([])
  })

  it('excludes a meeting the person has already responded to', () => {
    const day = { date: '2026-09-22', meetings: [meeting('m1', '2026-09-22T10:00:00', 'person-organiser', PERSON_ID, 'Going')] }
    expect(needsResponseEntriesForDay(day, PERSON_ID, peopleById, roomsById, 'initial')).toEqual([])
  })
})

describe('mergeNeedsResponseEntries', () => {
  const entry = (id: string, startTime: string, source: 'initial' | 'extra'): NeedsResponseEntry => ({
    meeting: meeting(id, startTime, 'person-organiser', PERSON_ID, 'NoResponse'),
    organiserName: 'Jordan Lee',
    roomName: 'Kauri',
    source,
  })

  it('leaves the list unchanged when a search finds nothing new', () => {
    const existing = [entry('m1', '2026-09-22T10:00:00', 'initial')]
    expect(mergeNeedsResponseEntries(existing, [])).toEqual(existing)
  })

  it('appends a newly-found entry, sorted in with the existing ones by start time', () => {
    const existing = [entry('m1', '2026-09-24T10:00:00', 'initial')]
    const found = [entry('m2', '2026-09-23T09:00:00', 'extra')]
    const merged = mergeNeedsResponseEntries(existing, found)
    expect(merged.map((item) => item.meeting.id)).toEqual(['m2', 'm1'])
    expect(merged[0].source).toBe('extra')
  })

  it('populates a previously-empty list - proven as its own case, not assumed from "appends"', () => {
    const found = [entry('m1', '2026-09-27T10:00:00', 'extra')]
    expect(mergeNeedsResponseEntries([], found)).toEqual(found)
  })

  it('never duplicates a meeting a later, wider search re-discovers', () => {
    const existing = [entry('m1', '2026-09-24T10:00:00', 'initial')]
    const found = [entry('m1', '2026-09-24T10:00:00', 'extra')]
    const merged = mergeNeedsResponseEntries(existing, found)
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('initial')
  })
})
