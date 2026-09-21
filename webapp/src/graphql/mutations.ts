import { graphql } from './generated'

/**
 * Selects `rooms` as well as `room`, and that is what removes the update function this used to need.
 *
 * Apollo normalises entities by id, so returning one Room updates it everywhere it is referenced —
 * but it does NOT add it to a cached `rooms` list, which is a separate cache field entirely. The
 * server's list is authoritative and replaces the cached one wholesale: no merge logic, and no
 * refetch racing it.
 */
export const CREATE_ROOM = graphql(`
  mutation CreateRoom($room: RoomInput!) {
    createRoom(room: $room) {
      rooms {
        id
        name
        capacity
      }
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
      rooms {
        id
        name
        capacity
      }
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
      people {
        id
        name
      }
      person {
        id
        name
      }
      errors
    }
  }
`)

export const UPDATE_PERSON = graphql(`
  mutation UpdatePerson($id: ID!, $person: PersonInput!) {
    updatePerson(id: $id, person: $person) {
      people {
        id
        name
      }
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

/**
 * Selects the whole affected `day`, which is what makes this genuinely update-function-free.
 *
 * `Day` is a normalised entity keyed by its date, and `meetings` is a field ON that entity — so
 * writing the returned day replaces the cached day's meeting list outright. No `update`, no
 * `refetchQueries`, and no client code that has to know a meeting belongs to a day.
 *
 * It also removes the read-after-write hazard by construction: the response IS the new state, so
 * nothing is re-read. Both workarounds that existed for that window — the router-state handoff out
 * of Add Meeting, and the paired merge on Room Availability — are deleted.
 *
 * Ids only inside the day, matching every other meetings query: names come from the cached rooms
 * and people. `meeting` is selected separately with names, because the page navigates to it.
 */
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
          person {
            id
            name
          }
          status
        }
      }
      day {
        date
        meetings {
          id
          subject
          startTime
          endTime
          room {
            id
          }
          organiser {
            id
          }
          attendees {
            person {
              id
            }
            status
          }
        }
      }
      errors
    }
  }
`)

/**
 * Self-only - meetingId plus the caller's own new status, no other argument. Selects the whole
 * updated `meeting`, names included, so the response overwrites the normalised `Meeting:<id>`
 * cache entity wherever it's referenced (this page's own attendee list, and any other cached Day
 * that embeds the same meeting) - the same "the response IS the new state" reasoning CREATE_MEETING
 * above already relies on, so no `update` function or refetch is needed here either. Other
 * clients/tabs learn about the change via daysInvalidated (see realtime/useDaysInvalidated.ts) -
 * RespondToMeetingHandler publishes it server-side on success, same as createMeeting.
 */
export const RESPOND_TO_MEETING = graphql(`
  mutation RespondToMeeting($meetingId: ID!, $status: AttendeeStatus!) {
    respondToMeeting(meetingId: $meetingId, status: $status) {
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
          person {
            id
            name
          }
          status
        }
      }
      errors
    }
  }
`)
