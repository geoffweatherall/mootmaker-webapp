import { describe, expect, it } from 'vitest'
import { ApolloClient, ApolloLink, InMemoryCache, Observable, gql } from '@apollo/client'
import { defaultOptions, typePolicies } from '../cachePolicies'
import { DayInvalidations } from './daysInvalidated'
import { evictAndRefetch } from './evictAndRefetch'

const DAYS = gql`
  query Days($dates: [String!]) {
    workspace(dates: $dates) {
      days { date meetings { id subject startTime } }
    }
  }
`
const ROOMS = gql`
  query Rooms {
    workspace { rooms { id name } }
  }
`
const MEETING = gql`
  query Meeting($id: ID!) {
    meeting(id: $id) { id subject startTime }
  }
`

const day = (date: string) => ({
  __typename: 'Day',
  date,
  meetings: [{ __typename: 'Meeting', id: `m-${date}`, subject: 's', startTime: `${date}T09:00:00` }],
})

/**
 * A page's worth of watched queries over the REAL type policies and client defaults - the
 * `workspace` read policy is exactly what dependency tracking has to see through, and without
 * merge-on-refetch a refetched day would wipe the rooms query's data and refetch it anyway - with a
 * fake server counting requests.
 */
async function page() {
  const requests: Record<string, number> = {}
  const link = new ApolloLink(
    (operation) =>
      new Observable((observer) => {
        const name = operation.operationName ?? '?'
        requests[name] = (requests[name] ?? 0) + 1
        const data =
          name === 'Days'
            ? { workspace: { __typename: 'Workspace', days: (operation.variables.dates as string[]).map(day) } }
            : name === 'Rooms'
              ? { workspace: { __typename: 'Workspace', rooms: [{ __typename: 'Room', id: 'r-1', name: 'Kauri' }] } }
              : { meeting: { __typename: 'Meeting', id: 'm-x', subject: 's', startTime: '2026-10-10T09:00:00' } }
        setTimeout(() => {
          observer.next({ data } as never)
          observer.complete()
        }, 1)
      }),
  )
  const cache = new InMemoryCache({ typePolicies })
  const client = new ApolloClient({ cache, link, defaultOptions })
  for (const [query, variables] of [
    [DAYS, { dates: ['2026-10-08', '2026-10-09'] }],
    [ROOMS, {}],
    [MEETING, { id: 'm-x' }],
  ] as const) {
    client.watchQuery({ query, variables, fetchPolicy: 'cache-and-network' }).subscribe({})
  }
  await settle()
  const invalidations = new DayInvalidations(cache)
  const requestsSince = () => {
    const before = { ...requests }
    return () =>
      Object.fromEntries(
        Object.entries(requests)
          .map(([name, count]) => [name, count - (before[name] ?? 0)] as const)
          .filter(([, delta]) => delta > 0),
      )
  }
  return { client, invalidations, requestsSince }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('evictAndRefetch', () => {
  it('refetches only the query that read the evicted day', async () => {
    const { client, invalidations, requestsSince } = await page()
    const delta = requestsSince()

    evictAndRefetch(client, () => invalidations.invalidate(['2026-10-08']))
    await settle()

    // Not Rooms, not Meeting: neither read 8 October. `include: 'active'` refetched all three.
    expect(delta()).toEqual({ Days: 1 })
  })

  it('refetches nothing for a day nobody holds', async () => {
    const { client, invalidations, requestsSince } = await page()
    const delta = requestsSince()

    evictAndRefetch(client, () => invalidations.invalidate(['2026-12-25']))
    await settle()

    expect(delta()).toEqual({})
  })

  it('refetches a meeting held without its day, and nothing else', async () => {
    const { client, invalidations, requestsSince } = await page()
    const delta = requestsSince()

    // m-x is dated 10 October and held only through meeting(id) - the pop-out page's shape.
    evictAndRefetch(client, () => invalidations.invalidate(['2026-10-10']))
    await settle()

    expect(delta()).toEqual({ Meeting: 1 })
  })

  it("refetches nothing for this tab's own recent write", async () => {
    const { client, invalidations, requestsSince } = await page()
    invalidations.noteOwnWrite(['2026-10-08'])
    const delta = requestsSince()

    evictAndRefetch(client, () => invalidations.invalidate(['2026-10-08']))
    await settle()

    expect(delta()).toEqual({})
  })
})
