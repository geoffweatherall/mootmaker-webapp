import { describe, expect, it } from 'vitest'
import { InMemoryCache, gql } from '@apollo/client'
import { DayInvalidations } from './daysInvalidated'

const WORKSPACE = gql`
  query W($dates: [String!]) {
    workspace(dates: $dates) {
      days { date meetings { id } }
    }
  }
`

function cacheHolding(...dates: string[]): InMemoryCache {
  const cache = new InMemoryCache({
    typePolicies: {
      Day: { keyFields: ['date'] },
      Workspace: { keyFields: false, fields: { days: { merge: false } } },
      Query: { fields: { workspace: { keyArgs: false } } },
    },
  })
  cache.writeQuery({
    query: WORKSPACE,
    variables: { dates },
    data: {
      workspace: {
        __typename: 'Workspace',
        days: dates.map((date) => ({
          __typename: 'Day',
          date,
          meetings: [{ __typename: 'Meeting', id: `m-${date}` }],
        })),
      },
    },
  })
  return cache
}

const holds = (cache: InMemoryCache, date: string): boolean =>
  Object.keys(cache.extract()).some((key) => key.startsWith('Day:') && key.includes(date))

describe('DayInvalidations', () => {
  it('evicts the days a broadcast names, and leaves the others alone', () => {
    const cache = cacheHolding('2026-09-14', '2026-09-15')
    const invalidations = new DayInvalidations(cache)

    expect(invalidations.invalidate(['2026-09-14'])).toEqual(['2026-09-14'])

    expect(holds(cache, '2026-09-14')).toBe(false)
    expect(holds(cache, '2026-09-15')).toBe(true)
  })

  it('is a no-op for a day nobody has fetched', () => {
    // Row 3b of the cross-client table: evicting an absent day must be harmless, not an error.
    const cache = cacheHolding('2026-09-14')
    const invalidations = new DayInvalidations(cache)

    expect(invalidations.invalidate(['2026-12-25'])).toEqual([])
    expect(holds(cache, '2026-09-14')).toBe(true)
  })

  it('ignores an invalidation for a date this client just wrote', () => {
    // The booking tab is also a subscriber. Without this it evicts the Day its own mutation
    // response authoritatively wrote and re-renders empty while refetching - the person who made
    // the booking watches their own screen flicker.
    const cache = cacheHolding('2026-09-14')
    const invalidations = new DayInvalidations(cache)

    invalidations.noteOwnWrite(['2026-09-14'])

    expect(invalidations.invalidate(['2026-09-14'])).toEqual([])
    expect(holds(cache, '2026-09-14')).toBe(true)
  })

  it('stops ignoring it once the grace window has passed', () => {
    const cache = cacheHolding('2026-09-14')
    let now = 1_000
    const invalidations = new DayInvalidations(cache, () => now)

    invalidations.noteOwnWrite(['2026-09-14'])
    now += 60_000

    expect(invalidations.invalidate(['2026-09-14'])).toEqual(['2026-09-14'])
    expect(holds(cache, '2026-09-14')).toBe(false)
  })

  it('re-evicts a day whose fetch was issued before the invalidation', () => {
    // The in-flight race: A writes at t0; B's fetch was issued at t-1 and lands at t+1 carrying
    // pre-write data, AFTER B evicted at t0. Without this B holds stale data with nothing left to
    // trigger a refetch - stale indefinitely, on one machine, with no error anywhere.
    const cache = cacheHolding('2026-09-14')
    let now = 1_000
    const invalidations = new DayInvalidations(cache, () => now)

    const issuedAt = now          // B's fetch goes out.
    now += 10
    invalidations.invalidate(['2026-09-14'])   // A's write arrives while it is in flight.
    now += 10
    // B's response lands, repopulating the day with data that predates A's write.
    cache.writeQuery({
      query: WORKSPACE,
      variables: { dates: ['2026-09-14'] },
      data: {
        workspace: {
          __typename: 'Workspace',
          days: [{ __typename: 'Day', date: '2026-09-14', meetings: [] }],
        },
      },
    })
    expect(holds(cache, '2026-09-14')).toBe(true)

    expect(invalidations.reconcileAfterFetch(['2026-09-14'], issuedAt)).toEqual(['2026-09-14'])
    expect(holds(cache, '2026-09-14')).toBe(false)
  })

  it('leaves a day alone when its fetch was issued after the invalidation', () => {
    const cache = cacheHolding('2026-09-14')
    let now = 1_000
    const invalidations = new DayInvalidations(cache, () => now)

    invalidations.invalidate(['2026-09-14'])
    now += 100
    const issuedAt = now

    // The response was requested AFTER the invalidation, so it already carries the new state.
    expect(invalidations.reconcileAfterFetch(['2026-09-14'], issuedAt)).toEqual([])
  })

  it('evicts every held day after a gap in the connection', () => {
    // A subscription cannot outlive its connection and AppSync does not replay, so the client
    // cannot know what it missed - only that it must stop trusting what it holds.
    const cache = cacheHolding('2026-09-14', '2026-09-15', '2026-09-16')
    const invalidations = new DayInvalidations(cache)

    expect(invalidations.invalidateEverything().sort())
      .toEqual(['2026-09-14', '2026-09-15', '2026-09-16'])
    expect(holds(cache, '2026-09-14')).toBe(false)
    expect(holds(cache, '2026-09-16')).toBe(false)
  })

  it('evicts even a day this client wrote when the connection dropped', () => {
    // Deliberately unlike the self-invalidation guard: while the socket was down, a date this
    // client wrote may ALSO have been changed by someone else, and there is no way to tell.
    const cache = cacheHolding('2026-09-14')
    const invalidations = new DayInvalidations(cache)

    invalidations.noteOwnWrite(['2026-09-14'])

    expect(invalidations.invalidateEverything()).toEqual(['2026-09-14'])
    expect(holds(cache, '2026-09-14')).toBe(false)
  })
})
