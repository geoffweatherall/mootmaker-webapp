import type { ApolloClient } from '@apollo/client'

/**
 * Runs an eviction, then refetches exactly the watched queries whose cached results it changed.
 *
 * The eviction runs inside `refetchQueries`' `updateCache`, so Apollo records which watched queries'
 * results it changed and calls `onQueryUpdated` for those alone. A broadcast for a day held only by
 * `DAYS` refetches `DAYS`, not the `BOUNDARIES` and `REFERENCE_DATA` queries mounted beside it; a
 * broadcast for a day nobody holds, or one ignored as this tab's own write, changes nothing and
 * refetches nothing (mootmaker-webapp#164).
 *
 * The refetch itself is still needed: a multi-day query whose day was evicted reads back complete,
 * minus that day, so nothing would refill it (see the pinned test in daysInvalidated.test.ts). This
 * only narrows WHICH queries are refetched. Dependency tracking sees through the `workspace` read
 * policy's `toReference`/`canRead` - evictAndRefetch.test.ts drives a real ApolloClient with the real
 * type policies to pin that, so an Apollo version that tracks differently fails a test rather than
 * silently over- or under-fetching.
 *
 * Deliberately NOT used after a reconnect or tab return. There, everything held is suspect, and
 * rooms and people are not broadcast at all, so refetching every active query is the point.
 */
export function evictAndRefetch(client: ApolloClient, evict: () => unknown): void {
  void client.refetchQueries({
    updateCache() {
      evict()
    },
    onQueryUpdated(observableQuery) {
      return observableQuery.refetch()
    },
  })
}
