import { ApolloLink, Observable } from '@apollo/client'
import { OperationTypeNode } from 'graphql'

/**
 * Closes the in-flight race: re-evicts the days a query's response carries if any of them was
 * invalidated while that response was on its way.
 *
 * The race, as `DayInvalidations.lastInvalidatedAt` describes it: A writes at t0. B's fetch was
 * issued at t-1 and lands at t+1 carrying pre-write data, AFTER B evicted at t0 - so B's cache ends
 * up holding stale data with nothing left to trigger another refetch. It is not exotic: the refetch
 * useDaysInvalidated fires straight after an eviction can be deduplicated by Apollo onto an
 * identical request already in flight, so the "fresh" refetch is answered by the pre-write request.
 *
 * Queries only. A mutation's response is the authoritative state after this client's own write, and
 * the broadcast that write causes reaches this tab around the same time - re-evicting on it would
 * throw away exactly the data the own-write guard exists to keep.
 *
 * `reconcile` is called with the response's dates and the time its request left, once Apollo has
 * written the response. It should run `DayInvalidations.reconcileAfterFetch` through
 * evictAndRefetch: eviction alone does not refill a multi-day query, which reads back complete
 * minus the evicted day (see the pinned test in daysInvalidated.test.ts), and evictAndRefetch
 * refetches exactly the queries the re-eviction changed (#164). apolloClient.ts wires it.
 *
 * Unwired for its first month - `reconcileAfterFetch` existed and was unit-tested, but nothing
 * called it (mootmaker-webapp#162).
 */
export function reconcileLink(
  reconcile: (dates: string[], issuedAt: number) => void,
  now: () => number = Date.now,
): ApolloLink {
  return new ApolloLink((operation, forward) => {
    if (operation.operationType !== OperationTypeNode.QUERY) return forward(operation)

    // When the request leaves, not when the response arrives: anything invalidated after this
    // moment may have changed after the server read it.
    const issuedAt = now()
    return new Observable((observer) => {
      const subscription = forward(operation).subscribe({
        next: (result) => {
          observer.next(result)
          const dates = datesIn(result.data)
          if (dates.length === 0) return
          // Deferred, because reconciling must happen AFTER Apollo writes this response to the
          // cache - evicting first would just let the stale write land on top. Apollo writes it
          // synchronously inside observer.next above; reconcileLink.test.ts drives a real
          // ApolloClient to pin that ordering rather than assume it.
          setTimeout(() => reconcile(dates, issuedAt), 0)
        },
        error: (error) => observer.error(error),
        complete: () => observer.complete(),
      })
      return () => subscription.unsubscribe()
    })
  })
}

/**
 * Every date a response carries data for: each `Day`'s `date`, and the date of each `Meeting`'s
 * `startTime` - the second covers `meeting(id)`, which returns a Meeting with no Day around it.
 * Relies on `__typename`, which Apollo adds to every outgoing selection set.
 */
export function datesIn(data: unknown): string[] {
  const dates = new Set<string>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (value === null || typeof value !== 'object') return
    const entity = value as { __typename?: unknown; date?: unknown; startTime?: unknown }
    if (entity.__typename === 'Day' && typeof entity.date === 'string') dates.add(entity.date)
    if (entity.__typename === 'Meeting' && typeof entity.startTime === 'string') {
      dates.add(entity.startTime.slice(0, 10))
    }
    for (const child of Object.values(value)) visit(child)
  }
  visit(data)
  return [...dates]
}
