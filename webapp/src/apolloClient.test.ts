import { describe, expect, it } from 'vitest'
import { ApolloClient, ApolloLink, InMemoryCache, Observable, gql } from '@apollo/client'
import { defaultOptions, typePolicies } from './cachePolicies'
import { DAYS, PAGE_LOAD } from './graphql/queries'

// The real policies, not a copy: they live in their own module precisely so tests can import them
// (apolloClient.ts reads `window.__MOOTMAKER_CONFIG__` at import time).
function newCache(): InMemoryCache {
  return new InMemoryCache({ typePolicies })
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
        attendees: [
          { __typename: 'Attendee', person: { __typename: 'Person', id: 'person-1' }, status: 'NoResponse' },
        ],
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
      me: {
        __typename: 'Person',
        id: 'person-1',
        name: 'Me',
        dateFormat: 'Iso',
        timeFormat: 'TwentyFourHour',
        weekStart: 'Monday',
      },
      people: [
        {
          __typename: 'Person',
          id: 'person-1',
          name: 'Me',
          isAdmin: false,
          linkedEmails: [],
          avatarUrl: null,
        },
      ],
      rooms: [{ __typename: 'Room', id: 'room-1', name: 'Room 1', capacity: 4, color: null }],
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

describe('refetches of one workspace query', () => {
  const DAYS_ONLY = gql`
    query DaysOnly($dates: [String!]) {
      workspace(dates: $dates) { days { date meetings { id } } }
    }
  `
  const ROOMS_ONLY = gql`
    query RoomsOnly {
      workspace { rooms { id name } }
    }
  `

  async function pageWith(options: ApolloClient.DefaultOptions | undefined) {
    const requests: string[] = []
    const link = new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          requests.push(operation.operationName ?? '?')
          const data =
            operation.operationName === 'DaysOnly'
              ? { workspace: { __typename: 'Workspace', days: [{ __typename: 'Day', date: '2026-10-08', meetings: [] }] } }
              : { workspace: { __typename: 'Workspace', rooms: [{ __typename: 'Room', id: 'r-1', name: 'Kauri' }] } }
          setTimeout(() => {
            observer.next({ data } as never)
            observer.complete()
          }, 1)
        }),
    )
    const cache = new InMemoryCache({ typePolicies })
    const client = new ApolloClient({ cache, link, defaultOptions: options })
    client.watchQuery({ query: DAYS_ONLY, variables: { dates: ['2026-10-08'] }, fetchPolicy: 'cache-and-network' }).subscribe({})
    client.watchQuery({ query: ROOMS_ONLY, fetchPolicy: 'cache-first' }).subscribe({})
    await settle()
    requests.length = 0
    await client.refetchQueries({ include: ['DaysOnly'] })
    await settle()
    const workspace = (cache.extract() as { ROOT_QUERY: { workspace: Record<string, unknown> } }).ROOT_QUERY.workspace
    return { requests, workspace }
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

  it('leave the fields other queries wrote in place, so nothing else goes back to the network', async () => {
    const { requests, workspace } = await pageWith(defaultOptions)

    expect(workspace).toHaveProperty('rooms')
    expect(requests).toEqual(['DaysOnly'])
  })

  it("would wipe them under Apollo's default overwrite-on-refetch, which is why it is overridden", async () => {
    // Pins the Apollo behaviour defaultOptions exists for. If this starts failing, a future Apollo
    // merges on refetch by default and the override in cachePolicies.ts can go.
    const { requests, workspace } = await pageWith(undefined)

    expect(workspace).not.toHaveProperty('rooms')
    expect(requests).toEqual(['DaysOnly', 'RoomsOnly'])
  })
})
