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
