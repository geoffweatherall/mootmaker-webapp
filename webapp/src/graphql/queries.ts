import { gql } from '@apollo/client'

export const LIST_PEOPLE = gql`
  query ListPeople {
    people {
      id
      name
    }
  }
`

export const MY_PERSON = gql`
  query MyPerson {
    myPerson {
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

export const LIST_MEETINGS = gql`
  query ListMeetings($filter: MeetingsFilter) {
    meetings(filter: $filter) {
      id
      subject
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
