import type { ApolloCache } from '@apollo/client'
import { REFERENCE_DATA } from './queries'
import type { Person, Room } from './types'

/**
 * Writes a mutation's returned rooms/people into the cached `workspace`.
 *
 * **Why returning the collection is not enough on its own.** Apollo normalises entities by id, so a
 * mutation returning one Room updates that Room everywhere it already appears. It does NOT add a
 * newly created Room to `workspace.rooms`, because `CreateRoomResult.rooms` and `Workspace.rooms`
 * are different cache fields - nothing tells Apollo they are the same list.
 *
 * The symptom is specific and easy to misread: Settings shows the new room, because it renders
 * straight from the mutation result, while Add Meeting's cache-first reference-data query still
 * serves the list it loaded with, so the room is simply missing from the dropdown. Nothing errors.
 * Caught by acceptance tests K.85 and H.72, which create a person or room and then try to pick it.
 */

interface ReferenceDataShape {
  workspace: { rooms: Room[]; people: Person[] }
}

function update(cache: ApolloCache, change: (current: ReferenceDataShape) => ReferenceDataShape): void {
  cache.updateQuery<ReferenceDataShape>({ query: REFERENCE_DATA }, (current) =>
    // Null when nothing has loaded reference data yet in this session. Writing a partial workspace
    // then would invent a cache entry claiming these are ALL the rooms and people, which the next
    // cache-first read would believe. Leaving it absent keeps "unfetched" distinguishable from
    // "empty" - the same distinction Day entities exist to preserve.
    current ? change(current) : current,
  )
}

export function cacheRooms(cache: ApolloCache, rooms: Room[] | undefined): void {
  if (!rooms) return
  update(cache, (current) => ({ workspace: { ...current.workspace, rooms } }))
}

export function cachePeople(cache: ApolloCache, people: Person[] | undefined): void {
  if (!people) return
  update(cache, (current) => ({ workspace: { ...current.workspace, people } }))
}
