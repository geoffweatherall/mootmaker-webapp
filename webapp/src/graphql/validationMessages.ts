/**
 * User-facing text for the API's validation-rule error codes, shown in ErrorBanner (see README.md's
 * "Error handling" section).
 *
 * Hand-written on purpose: this is UI copy, not part of the contract, so it is not generated. What
 * *is* generated is the error unions these maps are keyed by — so adding a code to the schema
 * widens the union, and this file stops compiling until the new code has a message. That is a
 * stronger guarantee than the hand-maintained version had, where both the union and the map were
 * written by the same hand and could drift together.
 *
 * Split out of `types.ts` when that file stopped being a hand-maintained schema mirror.
 */
import type {
  MeetingError,
  PersonError,
  PreferencesError,
  RoomError,
} from './generated/graphql'

export const ROOM_ERROR_MESSAGES: Record<RoomError, string> = {
  NameRequired: 'Name must not be blank.',
  CapacityTooLow: 'Room capacity must be at least 2.',
  RoomNotFound: 'This room no longer exists - it may have been deleted.',
}

export const PREFERENCES_ERROR_MESSAGES: Record<PreferencesError, string> = {
  NoLinkedPerson: "Your account isn't linked to a person yet, so preferences can't be saved.",
}

export const PERSON_ERROR_MESSAGES: Record<PersonError, string> = {
  NameRequired: 'Name must not be blank.',
  PersonNotFound: 'This person no longer exists - it may have been deleted.',
}

export const MEETING_ERROR_MESSAGES: Record<MeetingError, string> = {
  StartMissaligned: 'Start time must fall on a 15 minute boundary.',
  EndMissaligned: 'End time must fall on a 15 minute boundary.',
  SpansMultipleDays: 'A meeting cannot span midnight - start and end time must be on the same day.',
  EndBeforeStart: 'End time must be after the start time.',
  InsufficientCapacity: 'The room does not have enough capacity for all attendees.',
  TimeRangeUnavailable: 'The room already has a meeting scheduled during that time range.',
  RoomRequired: 'Please select a room.',
  RoomNotFound: 'The selected room could not be found.',
  OrganiserRequired: 'Please select an organiser.',
  OrganiserNotFound: 'The selected organiser could not be found.',
  AttendeeNotFound: 'One or more selected attendees could not be found.',
  SubjectRequired: 'Please enter a subject.',
  OrganiserIsAttendee: 'The organiser cannot also be listed as an attendee.',
}
