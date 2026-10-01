import { graphql } from './generated'

/**
 * The version of a meeting, as the edit form read it (mootmaker-api#96). Sent back with the update
 * as `expectedVersion`, so an edit made from a copy someone else has since changed is rejected
 * (`MeetingChanged`) instead of silently undoing their change.
 *
 * Its own query, fetched alongside the form's MEETING_BY_ID, rather than another field on that
 * shared query. The two are issued together and the server re-checks on write, so the only gap is
 * an edit landing in the milliseconds between them - which the next save then reports.
 */
export const MEETING_VERSION = graphql(`
  query MeetingVersion($id: ID!) {
    meeting(id: $id) {
      id
      version
    }
  }
`)
