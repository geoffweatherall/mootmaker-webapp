import { ApolloClient, ApolloLink, InMemoryCache, HttpLink } from '@apollo/client'
import { typePolicies } from './cachePolicies'
import { DayInvalidations } from './realtime/daysInvalidated'
import { reconcileLink } from './realtime/reconcileLink'
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

/** The policies, and why each is load-bearing, are in cachePolicies.ts. */
export const cache = new InMemoryCache({ typePolicies })

/**
 * Turns day-invalidation broadcasts into cache evictions. Lives here so there is exactly one
 * instance bound to exactly one cache - its self-invalidation guard and in-flight-race marker are
 * per-client state, and a second instance would silently hold half the picture.
 */
export const dayInvalidations = new DayInvalidations(cache)

export const apolloClient: ApolloClient = new ApolloClient({
  link: ApolloLink.from([
    authLink,
    // Re-evicts a query's days if one was invalidated while its response was in flight, then
    // refetches - see realtime/reconcileLink.ts. The callback only runs after a response, by which
    // time apolloClient is initialised.
    reconcileLink(dayInvalidations, () => void apolloClient.refetchQueries({ include: 'active' })),
    new HttpLink({
      uri: runtimeConfig.GRAPHQL_API_URL,
    }),
  ]),
  cache,
})
