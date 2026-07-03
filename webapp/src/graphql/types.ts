export interface Person {
  id: string
  name: string
}

export interface Room {
  id: string
  name: string
  capacity: number
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
  | 'RoomNotFound'
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
  RoomNotFound: 'The selected room could not be found.',
  OrganiserNotFound: 'The selected organiser could not be found.',
  AttendeeNotFound: 'One or more selected attendees could not be found.',
}
