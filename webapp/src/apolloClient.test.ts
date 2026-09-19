import { describe, expect, it } from 'vitest'
import { InMemoryCache } from '@apollo/client'
import { DAYS, PAGE_LOAD } from './graphql/queries'

// Mirrors the real typePolicies from apolloClient.ts, built inline rather than imported - that
// module reads `window.__MOOTMAKER_CONFIG__` at import time, so it needs a browser environment.
// Same pattern as graphql/referenceDataCache.test.ts.
function newCache(): InMemoryCache {
  return new InMemoryCache({
    typePolicies: {
      Day: { keyFields: ['date'] },
      Workspace: { keyFields: false, fields: { days: { merge: false } } },
      Query: {
        fields: {
          workspace: {
            keyArgs: false,
            read(existing: { days?: unknown } | undefined, { args, toReference, canRead }) {
              const dates = args?.dates as string[] | undefined
              if (!dates) return existing
              const days = dates.map((date) => toReference({ __typename: 'Day', date }))
              if (!days.some((day) => canRead(day))) {
                const { days: _staleDays, ...rest } = existing ?? {}
                return rest
              }
              return { ...existing, days }
            },
          },
        },
      },
    },
  })
}

function day(date: string) {
  return {
    __typename: 'Day',
    date,
    meetings: [
      {
        __typename: 'Meeting',
        id: `m-${date}`,
        subject: `meeting on ${date}`,
        startTime: `${date}T09:00:00`,
        endTime: `${date}T10:00:00`,
        room: { __typename: 'Room', id: 'room-1' },
        organiser: { __typename: 'Person', id: 'person-1' },
        attendees: [{ __typename: 'Person', id: 'person-1' }],
      },
    ],
  }
}

// Cast at each call site below (`as never`) - same reason as graphql/referenceDataCache.test.ts:
// the generated PageLoadQuery type omits __typename and treats dateFormat/timeFormat as their
// real enum unions, neither of which a plain object literal like this infers on its own.
function pageLoadData(dates: string[]) {
  return {
    workspace: {
      __typename: 'Workspace',
      me: { __typename: 'Person', id: 'person-1', name: 'Me', dateFormat: 'Iso', timeFormat: 'TwentyFourHour' },
      people: [{ __typename: 'Person', id: 'person-1', name: 'Me' }],
      rooms: [{ __typename: 'Room', id: 'room-1', name: 'Room 1', capacity: 4 }],
      boundaries: { __typename: 'Boundaries', earliestRetainedDate: '2026-01-01', latestBookableDate: '2027-01-01' },
      days: dates.map(day),
    },
  }
}

function readDates(cache: InMemoryCache, dates: string[]): string[] {
  const result = cache.readQuery({ query: PAGE_LOAD, variables: { dates } }) as {
    workspace: { days: { date: string }[] }
  } | null
  return (result?.workspace.days ?? []).map((d) => d.date)
}

describe('apolloClient cache: workspace.days honours the requested dates (mootmaker-webapp#66)', () => {
  it('renders the overlapping days of a shifted window from cache, with no stale extras', () => {
    const cache = newCache()

    // A 6-week window (Mon-Fri), matching PersonCalendarPage's WEEKS_SHOWN.
    const windowA = Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 5 }, (_, d) => {
        const date = new Date('2026-09-07')
        date.setDate(date.getDate() + w * 7 + d)
        return date.toISOString().slice(0, 10)
      }),
    ).flat()
    cache.writeQuery({ query: PAGE_LOAD, variables: { dates: windowA }, data: pageLoadData(windowA) as never })

    // "Next week": the whole window shifts forward by 7 days - 25 of the 30 dates are unchanged.
    const windowB = windowA.map((d) => {
      const date = new Date(d)
      date.setDate(date.getDate() + 7)
      return date.toISOString().slice(0, 10)
    })

    const overlap = windowB.filter((d) => windowA.includes(d))
    expect(overlap).toHaveLength(25)

    const returned = readDates(cache, windowB)

    // The bug: this used to return windowA's 30 dates unchanged (the previous, now-stale window),
    // rather than being read fresh for windowB.
    expect(returned).toEqual(overlap) // exactly the days already fetched, nothing stale, nothing invented
    expect(returned).not.toContain(windowA[0]) // the week that scrolled out is gone, not stale
    windowB
      .filter((d) => !windowA.includes(d))
      .forEach((newDate) => expect(returned).not.toContain(newDate)) // the new week isn't rendered as if it were already known
  })

  it('is exactly correct once the shifted window has also been fetched', () => {
    const cache = newCache()
    const windowA = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']
    cache.writeQuery({ query: PAGE_LOAD, variables: { dates: windowA }, data: pageLoadData(windowA) as never })

    const windowB = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']
    cache.writeQuery({ query: PAGE_LOAD, variables: { dates: windowB }, data: pageLoadData(windowB) as never })

    expect(readDates(cache, windowB)).toEqual(windowB)
    // The individual Day entities from windowA are still cached independently...
    expect(readDates(cache, windowA)).toEqual(windowA)
    // ...even though workspace.days itself (a single, keyArgs:false slot) was last written for windowB.
  })

  it('does not read a genuinely fresh date as complete-and-empty (RoomAvailabilityPage, DAYS only)', () => {
    const cache = newCache()

    // Nothing has ever been written to this cache - the DAYS query selects nothing but `days`
    // (see graphql/queries.ts), unlike PAGE_LOAD, so there is no other field (rooms/people/
    // boundaries) to independently signal that this is a genuine first visit. Dropping every
    // requested date's unresolvable reference would otherwise leave `days: []` - a complete,
    // valid-looking answer indistinguishable from a day that was actually fetched and is
    // genuinely empty, silently defeating RoomAvailabilityPage's showSpinner check.
    const fresh = cache.readQuery({ query: DAYS, variables: { dates: ['2026-11-01'] } })
    expect(fresh).toBeNull()

    // Once that date really is known, it reads back correctly.
    cache.writeQuery({
      query: DAYS,
      variables: { dates: ['2026-11-01'] },
      data: { workspace: { __typename: 'Workspace', days: [day('2026-11-01')] } } as never,
    })
    const known = cache.readQuery({ query: DAYS, variables: { dates: ['2026-11-01'] } }) as {
      workspace: { days: { date: string }[] }
    } | null
    expect(known?.workspace.days.map((d) => d.date)).toEqual(['2026-11-01'])
  })
})
