import { describe, expect, it, vi } from 'vitest'
import { ApolloClient, ApolloLink, InMemoryCache, Observable, gql } from '@apollo/client'
import { DayInvalidations } from './daysInvalidated'
import { datesIn, reconcileLink } from './reconcileLink'

const WORKSPACE = gql`
  query W($dates: [String!]) {
    workspace(dates: $dates) {
      days { date meetings { id subject } }
    }
  }
`

const CANCEL = gql`
  mutation C($id: ID!) {
    cancelMeeting(id: $id) {
      day { date meetings { id subject } }
    }
  }
`

const DATE = '2026-09-14'

function dayWith(subject: string) {
  return {
    __typename: 'Day',
    date: DATE,
    meetings: [{ __typename: 'Meeting', id: 'm-1', subject }],
  }
}

/**
 * A terminating link whose responses the test releases by hand, so a broadcast can be made to land
 * while a request is genuinely in flight - the whole point of the race.
 */
function heldServer() {
  const held: (() => void)[] = []
  let respondWith: unknown = null
  const link = new ApolloLink(
    () =>
      new Observable((observer) => {
        const data = respondWith
        held.push(() => {
          observer.next({ data } as never)
          observer.complete()
        })
      }),
  )
  return {
    link,
    nextResponse: (data: unknown) => {
      respondWith = data
    },
    releaseAll: () => held.splice(0).forEach((release) => release()),
  }
}

/** Mirrors the real typePolicies in apolloClient.ts, which reads window config at import time. */
function setup() {
  let clock = 1_000
  const now = () => clock
  const cache = new InMemoryCache({
    typePolicies: {
      Day: { keyFields: ['date'] },
      Workspace: { keyFields: false, fields: { days: { merge: false } } },
      Query: { fields: { workspace: { keyArgs: false } } },
    },
  })
  const invalidations = new DayInvalidations(cache, now)
  const onReEvicted = vi.fn()
  const server = heldServer()
  const client = new ApolloClient({
    cache,
    link: ApolloLink.from([
      reconcileLink((dates, issuedAt) => {
        if (invalidations.reconcileAfterFetch(dates, issuedAt).length > 0) onReEvicted()
      }, now),
      server.link,
    ]),
  })
  cache.writeQuery({
    query: WORKSPACE,
    variables: { dates: [DATE] },
    data: { workspace: { __typename: 'Workspace', days: [dayWith('before')] } },
  })
  return {
    cache,
    client,
    invalidations,
    onReEvicted,
    server,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

const holdsDay = (cache: InMemoryCache) => `Day:{"date":"${DATE}"}` in cache.extract()
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('reconcileLink', () => {
  it('re-evicts a day whose query was issued before the invalidation and landed after it', async () => {
    const { cache, client, invalidations, onReEvicted, server, advance } = setup()

    server.nextResponse({ workspace: { __typename: 'Workspace', days: [dayWith('pre-write')] } })
    const query = client.query({ query: WORKSPACE, variables: { dates: [DATE] }, fetchPolicy: 'network-only' })
    advance(10)
    invalidations.invalidate([DATE]) // Another client's write arrives while the query is in flight.
    advance(10)
    server.releaseAll() // ...and the query lands afterwards, carrying the pre-write day.
    await query
    await settle()

    // The pre-write day was written, then thrown away again, and the caller told to refetch.
    expect(holdsDay(cache)).toBe(false)
    expect(onReEvicted).toHaveBeenCalledTimes(1)
  })

  it('leaves a day alone when its query was issued after the invalidation', async () => {
    const { cache, client, invalidations, onReEvicted, server, advance } = setup()

    invalidations.invalidate([DATE])
    advance(10)
    server.nextResponse({ workspace: { __typename: 'Workspace', days: [dayWith('post-write')] } })
    const query = client.query({ query: WORKSPACE, variables: { dates: [DATE] }, fetchPolicy: 'network-only' })
    server.releaseAll()
    await query
    await settle()

    expect(holdsDay(cache)).toBe(true)
    expect(onReEvicted).not.toHaveBeenCalled()
  })

  it('never re-evicts on a mutation response, which is this client’s own authoritative write', async () => {
    const { cache, client, invalidations, onReEvicted, server, advance } = setup()

    server.nextResponse({ cancelMeeting: { __typename: 'CancelMeetingResult', day: dayWith('own write') } })
    const mutation = client.mutate({ mutation: CANCEL, variables: { id: 'm-1' } })
    advance(10)
    invalidations.invalidate([DATE]) // This client's own broadcast, arriving before the response.
    advance(10)
    server.releaseAll()
    await mutation
    await settle()

    expect(holdsDay(cache)).toBe(true)
    expect(onReEvicted).not.toHaveBeenCalled()
  })
})

describe('datesIn', () => {
  it('finds days and meeting dates however deeply they are nested', () => {
    expect(
      datesIn({
        workspace: { days: [{ __typename: 'Day', date: '2026-09-14', meetings: [] }] },
        meeting: { __typename: 'Meeting', id: 'm-9', startTime: '2026-10-08T09:00:00' },
      }).sort(),
    ).toEqual(['2026-09-14', '2026-10-08'])
  })

  it('returns nothing for a response with no days or meetings in it', () => {
    expect(datesIn({ workspace: { rooms: [{ __typename: 'Room', id: 'r-1' }] } })).toEqual([])
    expect(datesIn({ meeting: null })).toEqual([])
  })
})
