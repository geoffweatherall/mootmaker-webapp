import { useEffect } from 'react'
import { apolloClient, cache, dayInvalidations } from '../apolloClient'
import { currentIdToken } from '../auth/cognito'
import { runtimeConfig } from '../config'
import { openAppSyncSubscription } from './appsyncSocket'

const SUBSCRIPTION = 'subscription DaysInvalidated { daysInvalidated { dates } }'

interface InvalidationPayload {
  data?: { daysInvalidated?: { dates?: string[] } }
}

/**
 * Keeps the cache honest while the app is open: another user's booking evicts the affected day
 * here, and the ordinary gap fetch refills it.
 *
 * Mounted once, above the router, rather than per page. A page-level subscription would reconnect
 * on every navigation, and would mean days cached for screens the user is not currently looking at
 * silently stopped being maintained - which is the failure this exists to prevent.
 *
 * **Correctness does not depend on the socket surviving.** Browsers freeze background tabs and
 * AppSync closes idle connections, so both a reconnect and a return to the foreground evict every
 * held day rather than trying to work out what was missed. There is no replay to ask for.
 */
export function useDaysInvalidated(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) return

    const close = openAppSyncSubscription({
      httpEndpoint: runtimeConfig.GRAPHQL_API_URL,
      token: currentIdToken,
      query: SUBSCRIPTION,
      onData: (payload) => {
        const dates = (payload as InvalidationPayload).data?.daysInvalidated?.dates
        if (!dates?.length) return
        const evicted = dayInvalidations.invalidate(dates)

        // Evicting is not enough on its own, which is the one place the design's stated mechanism
        // does not survive contact with Apollo 4. `workspace.days` still holds a reference to the
        // evicted Day, Apollo filters dangling references out of a list on read, and the query
        // therefore reads back COMPLETE with one fewer day - not incomplete. So nothing refills it,
        // and the screen shows "no meetings" indefinitely rather than refetching. Measured, not
        // assumed: after evicting, cache.diff reports complete: true and days: [].
        //
        // Conditional on something actually being evicted, so a broadcast for a day this client is
        // not holding stays the complete no-op it should be.
        if (evicted.length > 0) void apolloClient.refetchQueries({ include: 'active' })
      },
      // A gap in the connection is a gap in knowledge: anything published while disconnected is
      // gone, so everything held is suspect. Refetching active queries is what refills whatever the
      // user is actually looking at; days nobody is watching stay evicted until navigated to.
      onResubscribed: () => {
        dayInvalidations.invalidateEverything()
        void apolloClient.refetchQueries({ include: 'active' })
      },
    })

    // Returning to the foreground is the same problem as a reconnect. A frozen tab may have kept a
    // socket that looks open but delivered nothing, so this does not wait for a close event.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      dayInvalidations.invalidateEverything()
      void apolloClient.refetchQueries({ include: 'active' })
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      close()
    }
  }, [signedIn])
}

/** Exported for tests that need to assert against the same cache the app uses. */
export { cache }
