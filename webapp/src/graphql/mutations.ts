import { gql } from '@apollo/client'

export const CREATE_PERSON = gql`
  mutation CreatePerson($person: PersonInput!) {
    createPerson(person: $person) {
      id
      name
    }
  }
`

export const CREATE_ROOM = gql`
  mutation CreateRoom($room: RoomInput!) {
    createRoom(room: $room) {
      room {
        id
        name
        capacity
      }
      errors
    }
  }
`

export const CREATE_BOOKING = gql`
  mutation CreateBooking($booking: BookingInput!) {
    createBooking(booking: $booking) {
      booking {
        id
        startTime
        endTime
        room {
          id
          name
          capacity
        }
        organiser {
          id
          name
        }
        attendees {
          id
          name
        }
      }
      errors
    }
  }
`
