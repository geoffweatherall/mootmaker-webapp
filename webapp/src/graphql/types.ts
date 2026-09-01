import type { DateFormat, TimeFormat } from './formatDateTime'

export interface Person {
  id: string
  name: string
}

/**
 * The signed-in viewer's own Person, as returned by the myPerson query and updateMyPreferences.
 *
 * Separate from Person because only those two operations select the display preferences: no other
 * client has any reason to render a date in somebody else's format (a shared view always uses the
 * viewer's own), so `people` and a meeting's organiser/attendees deliberately don't ask for them
 * and genuinely don't have them at runtime.
 */
export interface MyPerson extends Person {
  dateFormat: DateFormat
  timeFormat: TimeFormat
}

export type { DateFormat, TimeFormat }

export interface Room {
  id: string
  name: string
  capacity: number
}

export type RoomError = 'NameRequired' | 'CapacityTooLow' | 'RoomNotFound'

export interface CreateRoomResult {
  room: Room | null
  errors: RoomError[]
}

export interface UpdateRoomResult {
  room: Room | null
  errors: RoomError[]
}

export const ROOM_ERROR_MESSAGES: Record<RoomError, string> = {
  NameRequired: 'Name must not be blank.',
  CapacityTooLow: 'Room capacity must be at least 2.',
  RoomNotFound: 'This room no longer exists - it may have been deleted.',
}

export type PersonError = 'NameRequired' | 'PersonNotFound'

/**
 * The only way updateMyPreferences can fail. Both formats are non-null in the schema, so a
 * partial update is rejected by the server's own validation before the resolver runs.
 */
export type PreferencesError = 'NoLinkedPerson'

export interface UpdateMyPreferencesResult {
  person: MyPerson | null
  errors: PreferencesError[]
}

export const PREFERENCES_ERROR_MESSAGES: Record<PreferencesError, string> = {
  NoLinkedPerson: "Your account isn't linked to a person yet, so preferences can't be saved.",
}

export interface UpdatePersonResult {
  person: Person | null
  errors: PersonError[]
}

export const PERSON_ERROR_MESSAGES: Record<PersonError, string> = {
  NameRequired: 'Name must not be blank.',
  PersonNotFound: 'This person no longer exists - it may have been deleted.',
}

export interface Meeting {
  id: string
  room: Room
  organiser: Person
  attendees: Person[]
  subject: string
  startTime: string
  endTime: string
}

// fromStartTime/toEndTime must be supplied together (or both omitted); personId is independent.
export interface MeetingsFilter {
  fromStartTime?: string
  toEndTime?: string
  personId?: string
}

export type MeetingError =
  | 'StartMissaligned'
  | 'EndMissaligned'
  | 'SpansMultipleDays'
  | 'EndBeforeStart'
  | 'InsufficientCapacity'
  | 'TimeRangeUnavailable'
  | 'RoomRequired'
  | 'RoomNotFound'
  | 'OrganiserRequired'
  | 'OrganiserNotFound'
  | 'AttendeeNotFound'
  | 'SubjectRequired'
  | 'OrganiserIsAttendee'

export interface CreateMeetingResult {
  meeting: Meeting | null
  errors: MeetingError[]
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
