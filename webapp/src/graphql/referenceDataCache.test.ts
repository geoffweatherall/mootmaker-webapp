import { describe, expect, it } from 'vitest'
import { InMemoryCache } from '@apollo/client'
import { REFERENCE_DATA } from './queries'
import { cachePeople, cacheRooms } from './referenceDataCache'

function cacheWith(rooms: { id: string; name: string; capacity: number }[]): InMemoryCache {
  const cache = new InMemoryCache({
    typePolicies: {
      Workspace: { keyFields: false },
      Query: { fields: { workspace: { keyArgs: false } } },
    },
  })
  cache.writeQuery({
    query: REFERENCE_DATA,
    data: {
      workspace: {
        __typename: 'Workspace',
        rooms: rooms.map((r) => ({ __typename: 'Room', ...r })),
        people: [{ __typename: 'Person', id: 'p1', name: 'Ada Lovelace' }],
      },
    },
  })
  return cache
}

const readRooms = (cache: InMemoryCache): string[] =>
  ((cache.readQuery({ query: REFERENCE_DATA }) as { workspace: { rooms: { name: string }[] } } | null)
    ?.workspace.rooms ?? []).map((r) => r.name)

describe('referenceDataCache', () => {
  it('adds a newly created room to the cached workspace', () => {
    // The bug this exists for: Apollo normalises Room by id, so a created room is stored - but it
    // is NOT added to workspace.rooms, because CreateRoomResult.rooms is a different cache field.
    // Settings showed the room (rendered from the mutation result) while Add Meeting's dropdown
    // did not (served cache-first from a list that never gained it). Nothing errored.
    const cache = cacheWith([{ id: 'r1', name: 'Kaikoura', capacity: 8 }])

    cacheRooms(cache, [
      { id: 'r1', name: 'Kaikoura', capacity: 8 },
      { id: 'r2', name: 'Wanaka', capacity: 4 },
    ] as never)

    expect(readRooms(cache)).toEqual(['Kaikoura', 'Wanaka'])
  })

  it('does nothing when reference data has not been loaded in this session', () => {
    // Writing a partial workspace here would invent a cache entry claiming these are ALL the rooms
    // and people, which the next cache-first read would believe. Absent must stay absent, so
    // "unfetched" remains distinguishable from "empty".
    const cache = new InMemoryCache({
      typePolicies: { Workspace: { keyFields: false }, Query: { fields: { workspace: { keyArgs: false } } } },
    })

    cacheRooms(cache, [{ id: 'r1', name: 'Kaikoura', capacity: 8 }] as never)

    expect(cache.readQuery({ query: REFERENCE_DATA })).toBeNull()
  })

  it('leaves people untouched when writing rooms', () => {
    const cache = cacheWith([{ id: 'r1', name: 'Kaikoura', capacity: 8 }])

    cacheRooms(cache, [{ id: 'r1', name: 'Kaikoura', capacity: 8 }] as never)

    const data = cache.readQuery({ query: REFERENCE_DATA }) as { workspace: { people: { name: string }[] } }
    expect(data.workspace.people.map((p) => p.name)).toEqual(['Ada Lovelace'])
  })

  it('adds a newly created person to the cached workspace', () => {
    const cache = cacheWith([{ id: 'r1', name: 'Kaikoura', capacity: 8 }])

    cachePeople(cache, [
      { id: 'p1', name: 'Ada Lovelace' },
      { id: 'p2', name: 'Alan Turing' },
    ] as never)

    const data = cache.readQuery({ query: REFERENCE_DATA }) as { workspace: { people: { name: string }[] } }
    expect(data.workspace.people.map((p) => p.name)).toEqual(['Ada Lovelace', 'Alan Turing'])
  })
})
