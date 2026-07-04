export interface Person {
  id: string
  name: string
}

export interface Room {
  id: string
  name: string
  capacity: number
}

export type RoomError = 'NameRequired'

export interface CreateRoomResult {
  room: Room | null
  errors: RoomError[]
}

export const ROOM_ERROR_MESSAGES: Record<RoomError, string> = {
  NameRequired: 'Name must not be blank.',
}

export interface Booking {
  id: string
  room: Room
  organiser: Person
  attendees: Person[]
  startTime: string
  endTime: string
}

export type BookingError =
  | 'StartMissaligned'
  | 'EndMissaligned'
  | 'InsufficientCapacity'
  | 'TimeRangeUnavailable'
  | 'RoomRequired'
  | 'RoomNotFound'
  | 'OrganiserRequired'
  | 'OrganiserNotFound'
  | 'AttendeeNotFound'

export interface CreateBookingResult {
  booking: Booking | null
  errors: BookingError[]
}

export const BOOKING_ERROR_MESSAGES: Record<BookingError, string> = {
  StartMissaligned: 'Start time must fall on a 5 minute boundary.',
  EndMissaligned: 'End time must fall on a 5 minute boundary.',
  InsufficientCapacity: 'The room does not have enough capacity for all attendees.',
  TimeRangeUnavailable: 'The room is already booked during that time range.',
  RoomRequired: 'Please select a room.',
  RoomNotFound: 'The selected room could not be found.',
  OrganiserRequired: 'Please select an organiser.',
  OrganiserNotFound: 'The selected organiser could not be found.',
  AttendeeNotFound: 'One or more selected attendees could not be found.',
}
