import { graphql } from './generated'

export const LIST_PEOPLE = graphql(`
  query ListPeople {
    people {
      id
      name
    }
  }
`)

export const MY_PERSON = graphql(`
  query MyPerson {
    myPerson {
      id
      name
      dateFormat
      timeFormat
    }
  }
`)

export const LIST_ROOMS = graphql(`
  query ListRooms {
    rooms {
      id
      name
      capacity
    }
  }
`)

export const SUGGEST_ROOM = graphql(`
  query SuggestRoom($startTime: String!, $endTime: String!, $requiredCapacity: Int!) {
    suggestRoom(startTime: $startTime, endTime: $endTime, requiredCapacity: $requiredCapacity) {
      id
      name
      capacity
    }
  }
`)

export const LIST_MEETINGS = graphql(`
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
`)
