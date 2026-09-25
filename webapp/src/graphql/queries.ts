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
        weekStart
      }
      people {
        id
        name
        isAdmin
        linkedEmails
      }
      rooms {
        id
        name
        capacity
        color
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
            person {
              id
            }
            status
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
            person {
              id
            }
            status
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
        color
      }
      people {
        id
        name
        isAdmin
        linkedEmails
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
        color
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
        weekStart
      }
    }
  }
`)

/**
 * A live binding into every field `updateMeeting`/`cancelMeeting` can change, keyed by id - read
 * with `useFragment` (see MeetingDetailContent.tsx), not fetched directly.
 *
 * Covers `subject`/`startTime`/`endTime` directly, and `room`/`organiser`/`attendees[].person` by
 * id+name. Every meetings query (PAGE_LOAD, DAYS, MEETING_BY_ID) already selects at least `room {
 * id }`/`organiser { id }`/`attendees { person { id } }` on every Meeting, so this fragment's own
 * `room`/`organiser`/`attendee.person` selections always resolve through an existing reference;
 * the `name` each one adds resolves against the separately normalised Room/Person entity (from
 * PAGE_LOAD/REFERENCE_DATA's own top-level `rooms`/`people` lists) rather than needing the
 * Meeting's own query to have asked for it - every page that can open a meeting detail sheet/panel
 * has already loaded its own rooms/people list before a user could click a row, so those entities
 * are complete in cache well before this fragment is ever read. (Before this widened to every
 * editable field, it covered only `attendees { person { id } status }` - narrow specifically
 * because everything else on a meeting genuinely never changed after creation. That's no longer
 * true.)
 *
 * Originally existed just for attendee status, because the detail sheet/panel's `meeting` prop is
 * a snapshot captured once, not itself reactive - and attendee status changes underneath an
 * already-open sheet whenever anyone (including another client) responds. Now the same reasoning
 * covers every field an edit can change, and the meeting being cancelled entirely: `useFragment`'s
 * `complete` flag flips to `false` once `cache.gc()` collects the now-unreachable entity after a
 * cancellation, which `MeetingDetailContent` uses to show "This meeting was cancelled" instead of
 * stale content. `useFragment` is Apollo's purpose-built tool for exactly this: a live view of one
 * normalised entity, independent of which query is currently mounted.
 */
export const MEETING_LIVE_FIELDS_FRAGMENT = graphql(`
  fragment MeetingLiveFields on Meeting {
    id
    subject
    startTime
    endTime
    room {
      id
      name
      capacity
      color
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
`)

export const SUGGEST_ROOM = graphql(`
  query SuggestRoom(
    $startTime: String!
    $endTime: String!
    $requiredCapacity: Int!
    $excludingMeetingId: ID
  ) {
    suggestRoom(
      startTime: $startTime
      endTime: $endTime
      requiredCapacity: $requiredCapacity
      excludingMeetingId: $excludingMeetingId
    ) {
      id
      name
      capacity
      color
    }
  }
`)
