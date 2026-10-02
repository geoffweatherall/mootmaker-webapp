import { graphql } from './generated'

/**
 * The window of dates the server keeps and accepts bookings in, on its own for pages whose main
 * query doesn't select it (Room Availability's DAYS - mootmaker-webapp#60). Published by the server
 * and never computed here, for the same reason as PersonCalendarPage's: one authority per fact.
 */
export const BOUNDARIES = graphql(`
  query Boundaries {
    workspace {
      boundaries {
        earliestRetainedDate
        latestBookableDate
      }
    }
  }
`)
