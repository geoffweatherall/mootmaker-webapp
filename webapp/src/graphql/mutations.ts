import { gql } from '@apollo/client'

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

export const UPDATE_ROOM = gql`
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
`

export const CREATE_PERSON = gql`
  mutation CreatePerson($person: PersonInput!) {
    createPerson(person: $person) {
      id
      name
    }
  }
`

export const UPDATE_PERSON = gql`
  mutation UpdatePerson($id: ID!, $person: PersonInput!) {
    updatePerson(id: $id, person: $person) {
      person {
        id
        name
      }
      errors
    }
  }
`

export const UPDATE_MY_PREFERENCES = gql`
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
`

export const DELETE_MY_ACCOUNT = gql`
  mutation DeleteMyAccount {
    deleteMyAccount
  }
`

export const CREATE_MEETING = gql`
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
`
