import { gql } from '@apollo/client'

export const LIST_PEOPLE = gql`
  query ListPeople {
    people {
      id
      name
    }
  }
`

export const LIST_ROOMS = gql`
  query ListRooms {
    rooms {
      id
      name
      capacity
    }
  }
`

export const LIST_BOOKINGS = gql`
  query ListBookings {
    bookings {
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
  }
`
