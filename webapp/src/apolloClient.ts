import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client'
import { DayInvalidations } from './realtime/daysInvalidated'
import { SetContextLink } from '@apollo/client/link/context'
import { currentIdToken } from './auth/cognito'
import { runtimeConfig } from './config'

// Attaches the signed-in user's Cognito JWT to every GraphQL request; AppSync
// rejects requests without a valid token.
const authLink = new SetContextLink(async (prevContext) => {
  const token = await currentIdToken()
  return {
    headers: {
      ...prevContext.headers,
      ...(token ? { Authorization: token } : {}),
    },
  }
})

/**
 * Three policies, and each one is load-bearing.
 *
 * Getting these wrong does not break the app — it makes it quietly slower, which no test would
 * notice. That is why each has a reason written down, and why there are tests for the behaviour
 * rather than for the configuration.
 */
export const cache = new InMemoryCache({
  typePolicies: {
    /**
     * `Day` has no `id`, so without this it would be stored inline in whatever fetched it and could
     * never be shared between screens. Keyed by `date`, the cache key is `Day:2026-09-14` — readable,
     * and constructible by the client without asking the server what it is.
     *
     * It is also what lets an empty day be told apart from an unfetched one: entity present with an
     * empty `meetings` list means the day is genuinely empty, entity absent means nobody has looked.
     * A merged canonical list of meetings cannot express that difference.
     */
    Day: {
      keyFields: ['date'],
    },

    Workspace: {
      // Not an entity: there is exactly one, and it hangs off the root query. Storing it inline
      // avoids inventing an identity for a singleton.
      keyFields: false,
      fields: {
        /**
         * Replace, never accumulate - a write-time complement to `Query.workspace`'s `read` above.
         *
         * A `read` policy on `days` itself can't map `args.dates` onto constructed `Day` references:
         * `dates` is an argument of `workspace`, not of `days`, so a field policy on `days` receives
         * no `args` at all. (It could read `variables.dates` instead, but that silently couples the
         * cache to one variable name and breaks for any query that inlines its dates.) That's why the
         * args-aware reconstruction lives on `Query.workspace.read` instead, where `dates` actually
         * is the field's own argument - see there for the fix to mootmaker-webapp#66 (a stale window
         * of days rendering on scroll because this field alone never reflected the current `dates`).
         *
         * `merge: false` just keeps *this* field's write-time behaviour simple - each response
         * replaces whatever list was here rather than attempting a positional array merge. What's
         * stored here barely matters now: any query with a `dates` argument gets its `days` rebuilt
         * fresh by the `read` policy above regardless of what was last written. The individual `Day`
         * entities persist independently either way, which is what actually matters.
         */
        days: {
          merge: false,
        },
      },
    },

    Query: {
      fields: {
        /**
         * One `workspace` slot, not one per set of dates.
         *
         * Without this, every distinct `dates` array gets its own `ROOT_QUERY` entry, and the same
         * rooms and people are cached again under each. Because the array changes on every
         * navigation, those slots accumulate as junk nobody reads. The symptom is not an error — it
         * is an app that refetches everything whenever the user changes week.
         *
         * `read` rebuilds `days` from `args.dates` on every read, rather than trusting whatever
         * `days` list the single slot above last had written into it (see `Workspace.days` below -
         * that field's own key is not args-aware, so left alone it just returns the previous
         * window's list regardless of what the current query asked for). `dates` is `workspace`'s
         * own argument, which is why the fix lives here rather than as a `read` on `days` itself -
         * see the note below for why that was tried first and abandoned.
         *
         * Constructing references by date rather than trusting the stored list is what makes
         * scrolling a date window cache-correct: overlapping days resolve straight from already-
         * normalized `Day` entities, and a `toReference` for a day nothing has fetched yet simply
         * has no data behind it - `InMemoryCache` drops that entry from the list rather than
         * returning it broken or substituting something stale, so the window renders exactly the
         * days it actually has, not the previous window's days relabelled.
         *
         * The one case that needs handling explicitly: when NONE of the requested dates are
         * cached yet, dropping every entry leaves `days: []` - a *complete*, valid-looking answer
         * indistinguishable from a real response for days that truly hold nothing. That is exactly
         * the ambiguity `Day`'s own keyed identity exists to avoid (see its comment above), and for
         * a query that selects nothing but `days` (RoomAvailabilityPage's), there is no other field
         * to signal otherwise - a genuinely first, uncached visit would silently read as "already
         * complete, nothing to show" instead of triggering the network fetch a real cold load needs.
         * So: omit `days` entirely (not `[]`) when nothing requested is actually known yet, which
         * reads as a missing field rather than a real empty one. Once at least one requested date
         * is known, return the constructed list as normal - a partial overlap is real information
         * worth rendering immediately, not something to hide behind an all-or-nothing check.
         */
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
          // Explicit shallow merge, so Apollo knows a write with a narrower selection set (e.g.
          // ReferenceData's rooms/people, versus PageLoad's fuller set including days/boundaries)
          // is an intentional partial update rather than potential data loss - see
          // mootmaker-webapp#67. Without this, every write after the first logs Apollo's own
          // "Cache data may be lost when replacing the workspace field of a Query object" warning.
          merge: (existing: object | undefined, incoming: object) => ({ ...existing, ...incoming }),
        },
      },
    },
  },
})

export const apolloClient = new ApolloClient({
  link: authLink.concat(
    new HttpLink({
      uri: runtimeConfig.GRAPHQL_API_URL,
    }),
  ),
  cache,
})

/**
 * Turns day-invalidation broadcasts into cache evictions. Lives here so there is exactly one
 * instance bound to exactly one cache - its self-invalidation guard and in-flight-race marker are
 * per-client state, and a second instance would silently hold half the picture.
 */
export const dayInvalidations = new DayInvalidations(cache)
