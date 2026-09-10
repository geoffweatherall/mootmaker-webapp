import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client'
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
         * Replace, never accumulate.
         *
         * The design called for a `read` policy mapping `args.dates` onto constructed `Day`
         * references. That is not implementable as written: `dates` is an argument of `workspace`,
         * not of `days`, so a field policy on `days` receives no `args` at all. It could read
         * `variables.dates` instead, but that silently couples the cache to one variable name and
         * breaks for any query that inlines its dates.
         *
         * Replacing achieves what the read policy was chosen for — the list never grows across a
         * session, and `workspace.days` means "the days this query asked for" rather than "every day
         * ever seen". The individual `Day` entities persist independently of it, which is the part
         * that actually matters: screens render per-day from the cache, not from this list.
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
         */
        workspace: {
          keyArgs: false,
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
