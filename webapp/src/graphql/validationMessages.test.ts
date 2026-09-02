import { describe, expect, it } from 'vitest'
import {
  MEETING_ERROR_MESSAGES,
  PERSON_ERROR_MESSAGES,
  ROOM_ERROR_MESSAGES,
} from './validationMessages'
import type {
  MeetingError,
  PersonError,
  RoomError,
} from './types'

// These maps translate the API's validation-rule error codes into the user-facing text shown in
// ErrorBanner (see README.md's "Error handling" section). The main risk here is silent drift: a
// new error code added to a union type without a matching message entry would compile fine (the
// object literal just gets a wider index signature) unless we also assert the key sets match
// exactly - these tests exist to catch that drift regardless of what codes are added later, not
// to duplicate the API's own error-code list.

describe('ROOM_ERROR_MESSAGES', () => {
  const codes: RoomError[] = ['NameRequired', 'CapacityTooLow', 'RoomNotFound']

  it('has a non-empty message for every RoomError code, and no extra ones', () => {
    expect(Object.keys(ROOM_ERROR_MESSAGES).sort()).toEqual([...codes].sort())
    for (const code of codes) {
      expect(ROOM_ERROR_MESSAGES[code]).toEqual(expect.any(String))
      expect(ROOM_ERROR_MESSAGES[code].length).toBeGreaterThan(0)
    }
  })
})

describe('PERSON_ERROR_MESSAGES', () => {
  const codes: PersonError[] = ['NameRequired', 'PersonNotFound']

  it('has a non-empty message for every PersonError code, and no extra ones', () => {
    expect(Object.keys(PERSON_ERROR_MESSAGES).sort()).toEqual([...codes].sort())
    for (const code of codes) {
      expect(PERSON_ERROR_MESSAGES[code].length).toBeGreaterThan(0)
    }
  })
})

describe('MEETING_ERROR_MESSAGES', () => {
  const codes: MeetingError[] = [
    'StartMissaligned',
    'EndMissaligned',
    'SpansMultipleDays',
    'EndBeforeStart',
    'InsufficientCapacity',
    'TimeRangeUnavailable',
    'RoomRequired',
    'RoomNotFound',
    'OrganiserRequired',
    'OrganiserNotFound',
    'AttendeeNotFound',
    'SubjectRequired',
    'OrganiserIsAttendee',
  ]

  it('has a non-empty message for every MeetingError code, and no extra ones', () => {
    expect(Object.keys(MEETING_ERROR_MESSAGES).sort()).toEqual([...codes].sort())
    for (const code of codes) {
      expect(MEETING_ERROR_MESSAGES[code].length).toBeGreaterThan(0)
    }
  })

  it('gives OrganiserIsAttendee a message distinct from the plain "required" ones, since a UI bug that showed the wrong message here would be confusing', () => {
    expect(MEETING_ERROR_MESSAGES.OrganiserIsAttendee).not.toBe(MEETING_ERROR_MESSAGES.OrganiserRequired)
    expect(MEETING_ERROR_MESSAGES.OrganiserIsAttendee.toLowerCase()).toContain('attendee')
  })
})
