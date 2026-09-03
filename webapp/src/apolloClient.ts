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

export const apolloClient = new ApolloClient({
  link: authLink.concat(
    new HttpLink({
      uri: runtimeConfig.GRAPHQL_API_URL,
    }),
  ),
  cache: new InMemoryCache(),
})
