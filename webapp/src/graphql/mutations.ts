import { graphql } from './generated'

export const CREATE_ROOM = graphql(`
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
`)

export const UPDATE_ROOM = graphql(`
  mutation UpdateRoom($id: ID!, $room: RoomInput!) {
    updateRoom(id: $id, room: $room) {
      room {
        id
        name
        capacity
      }
      errors
    }
  }
`)

export const CREATE_PERSON = graphql(`
  mutation CreatePerson($person: PersonInput!) {
    createPerson(person: $person) {
      id
      name
    }
  }
`)

export const UPDATE_PERSON = graphql(`
  mutation UpdatePerson($id: ID!, $person: PersonInput!) {
    updatePerson(id: $id, person: $person) {
      person {
        id
        name
      }
      errors
    }
  }
`)

export const UPDATE_MY_PREFERENCES = graphql(`
  mutation UpdateMyPreferences($preferences: PreferencesInput!) {
    updateMyPreferences(preferences: $preferences) {
      person {
        id
        name
        dateFormat
        timeFormat
      }
      errors
    }
  }
`)

export const DELETE_MY_ACCOUNT = graphql(`
  mutation DeleteMyAccount {
    deleteMyAccount
  }
`)

export const CREATE_MEETING = graphql(`
  mutation CreateMeeting($meeting: MeetingInput!) {
    createMeeting(meeting: $meeting) {
      meeting {
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
      errors
    }
  }
`)
