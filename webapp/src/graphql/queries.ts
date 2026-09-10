import { graphql } from './generated'

/**
 * The whole of page load, in one request.
 *
 * Replaces four separate queries — people, rooms, myPerson and meetings — and the waterfall between
 * them, since `me` no longer has to resolve before meetings can be asked for. `dates` is optional:
 * omitting it means no days are wanted, which is how a reference-data refresh asks for just rooms
 * and people.
 *
 * Meetings select ids only for room, organiser and attendees. Names are resolved from `rooms` and
 * `people` in the same result — Apollo normalises those by id, so a component reads `Room:abc`
 * straight from the cache rather than threading a lookup map down the tree. Asking for the names
 * here would make the server do a lookup per meeting for data the client already holds.
 */
export const PAGE_LOAD = graphql(`
  query PageLoad($dates: [String!]) {
    workspace(dates: $dates) {
      me {
        id
        name
        dateFormat
        timeFormat
      }
      people {
        id
        name
      }
      rooms {
        id
        name
        capacity
      }
      boundaries {
        earliestRetainedDate
        latestBookableDate
      }
      days {
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
            id
          }
        }
      }
    }
  }
`)

/**
 * Only the days a screen is missing.
 *
 * Note what is NOT selected: no people, rooms, me or boundaries, so the server does none of that
 * work. Every meetings screen is this same query with a different set of dates — a calendar week, a
 * single day on room availability, three days on the home page — which is what day-keyed entities
 * buy. Moving to an already-visited day sends nothing at all.
 */
export const DAYS = graphql(`
  query Days($dates: [String!]) {
    workspace(dates: $dates) {
      days {
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
            id
          }
        }
      }
    }
  }
`)

/**
 * Reference data on its own, with no `dates` argument at all.
 *
 * A long session can outlive the rooms and people it loaded with. This is a refresh rather than a
 * prerequisite: the form renders from cache immediately while it runs.
 */
export const REFERENCE_DATA = graphql(`
  query ReferenceData {
    workspace {
      rooms {
        id
        name
        capacity
      }
      people {
        id
        name
      }
    }
  }
`)

/**
 * The one lookup that is not a date range, so a details link works from anywhere — bookmarked,
 * shared, or refreshed — without assuming what loaded first.
 *
 * Names ARE selected here, unlike every other meetings query: a details page reached cold has no
 * cached rooms or people to resolve ids against.
 */
export const MEETING_BY_ID = graphql(`
  query MeetingById($id: ID!) {
    meeting(id: $id) {
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

/**
 * Just the signed-in viewer, for session setup.
 *
 * A separate query rather than reusing PAGE_LOAD because selection is what the server charges for:
 * PAGE_LOAD would make it fetch every room and person to answer a question about one Person. No
 * `dates` argument at all, so no day items are read either.
 */
export const SESSION = graphql(`
  query Session {
    workspace {
      me {
        id
        name
        dateFormat
        timeFormat
      }
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
