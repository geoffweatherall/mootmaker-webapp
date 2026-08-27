import { expect, test } from '@playwright/test'
import { createConfirmedTestAccount } from '../../support/cognitoAdmin'
import { freshTestAccount } from '../../support/testAccount'

// mootmaker/use-cases.md, section L (Authorization boundaries), cases 89-91.
//
// L.89 and (half of) L.91 are explicitly framed by the catalog as the general
// authorization-boundary restatement of mechanics already built for their own sections (J.77,
// K.84, I.74) - see l-authorization-boundaries.md's own file-level note. This file re-proves the
// presentation-only half (L.89) directly rather than only cross-referencing, since it's cheap and
// keeps this file self-contained; it does NOT re-implement I.74's self-rename happy path (L.91a),
// only references it, per the catalog's explicit instruction not to make a third copy of that
// exact test.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

/** Extracts the signed-in user's real Cognito ID token straight from localStorage, the same way
 * amazon-cognito-identity-js itself stores it (see auth/cognito.ts) - this is what apolloClient.ts
 * sends as the Authorization header, so grabbing it here lets a test issue its own raw GraphQL
 * requests "as" whoever is currently signed in in the browser, bypassing the UI entirely. */
async function extractIdToken(page: import('@playwright/test').Page): Promise<string> {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith('CognitoIdentityServiceProvider.') && k.endsWith('.idToken'),
    )
    return key ? localStorage.getItem(key) : null
  })
  if (!token) {
    throw new Error('Could not find a Cognito idToken in localStorage - is the page signed in?')
  }
  return token
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign out')).toBeVisible()
}

/** Fetches an admin-equivalent access token via the OAuth2 client_credentials flow - the same
 * mechanism mootmaker-api's own `verify/` acceptance suite uses (see GraphQlClient.java there),
 * exchanging the acceptance-test app client's id/secret at Cognito's token endpoint for a JWT
 * carrying the admin resource-server scope `Identity.isAdmin` also accepts (see Identity.java's
 * `hasAdminScope`). No Cognito *user* session is involved at all - this is Terraform's
 * `aws_cognito_user_pool_client.test` client, built specifically "for M2M tooling
 * (sample-data-generator, the acceptance tests)" per cognito.tf's own comment. Used here only to
 * create this test's own room *fixture* (a real createRoom call through the real handler, no
 * different from what a real admin's UI submission would do) - the actual thing under test is
 * still the standard user's token being rejected, below. */
async function fetchAdminAccessToken(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const response = await request.post(requireEnv('COGNITO_TOKEN_URL'), {
    form: {
      grant_type: 'client_credentials',
      client_id: requireEnv('COGNITO_TEST_CLIENT_ID'),
      client_secret: requireEnv('COGNITO_TEST_CLIENT_SECRET'),
      scope: requireEnv('COGNITO_TEST_SCOPE'),
    },
  })
  const body = await response.json()
  if (!body.access_token) {
    throw new Error(`Cognito token endpoint returned no access_token: ${JSON.stringify(body)}`)
  }
  return body.access_token as string
}

test('L.89 - standard user does not see the admin-only Rooms/People sections in Settings', async ({
  page,
}) => {
  const e2eEmail = requireEnv('E2E_USER_EMAIL')
  const e2ePassword = requireEnv('E2E_USER_PASSWORD')

  await signIn(page, e2eEmail, e2ePassword)
  await page.goto('/settings')

  // Same mechanism as J.77 + K.84, checked together in one visit per this entry's own Notes.
  await expect(page.getByRole('heading', { name: 'Rooms' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add room' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'People' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add person' })).toHaveCount(0)

  // The page did render (not everything hidden by some unrelated failure) - the "Your name"
  // section is visible to every signed-in user, admin or not.
  await expect(page.getByRole('heading', { name: 'Your name' })).toBeVisible()
})

test('L.90 - a standard user directly calling createRoom/updateRoom/createPerson is rejected server-side', async ({
  page,
  request,
}) => {
  const graphqlUrl = requireEnv('GRAPHQL_API_URL')
  const account = freshTestAccount()
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const targetRoomName = `L90 Target Room ${runId}`

  // A real room to target with updateRoom - created via the M2M admin-equivalent token (see
  // fetchAdminAccessToken) rather than the demo user's Settings UI, so this test's own precondition
  // doesn't depend on which real Cognito account happens to be admin in this environment.
  const adminToken = await fetchAdminAccessToken(request)
  const createFixtureResponse = await request.post(graphqlUrl, {
    headers: { Authorization: adminToken },
    data: {
      query: `mutation ($room: RoomInput!) { createRoom(room: $room) { room { id } errors } }`,
      variables: { room: { name: targetRoomName, capacity: 4 } },
    },
  })
  const createFixtureBody = await createFixtureResponse.json()
  const existingRoomId: string | undefined = createFixtureBody.data?.createRoom?.room?.id
  if (!existingRoomId) {
    throw new Error(`Failed to create this test's own room fixture: ${JSON.stringify(createFixtureBody)}`)
  }

  await createConfirmedTestAccount(account)
  await signIn(page, account.email, account.password)
  const token = await extractIdToken(page)

  const createRoomResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: `mutation ($room: RoomInput!) { createRoom(room: $room) { room { id } errors } }`,
      variables: { room: { name: `L90 Room ${runId}`, capacity: 4 } },
    },
  })
  const createRoomBody = await createRoomResponse.json()

  const updateRoomResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: `mutation ($id: ID!, $room: RoomInput!) { updateRoom(id: $id, room: $room) { room { id } errors } }`,
      variables: { id: existingRoomId, room: { name: `L90 Renamed ${runId}`, capacity: 4 } },
    },
  })
  const updateRoomBody = await updateRoomResponse.json()

  const createPersonResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: `mutation ($person: PersonInput!) { createPerson(person: $person) { id name } }`,
      variables: { person: { name: `L90 Person ${runId}` } },
    },
  })
  const createPersonBody = await createPersonResponse.json()

  // Identity.requireAdmin throws, which AppSync surfaces as a top-level GraphQL `errors` array -
  // a different channel than the structured CreateRoomResult.errors/UpdateRoomResult.errors field
  // used for ordinary validation failures. All three requests should be rejected this way, with
  // no data payload for the attempted mutation.
  for (const body of [createRoomBody, updateRoomBody, createPersonBody]) {
    expect(Array.isArray(body.errors) && body.errors.length > 0).toBe(true)
  }
  expect(createRoomBody.data?.createRoom ?? null).toBeNull()
  expect(updateRoomBody.data?.updateRoom ?? null).toBeNull()
  expect(createPersonBody.data?.createPerson ?? null).toBeNull()

  // Spot-check: neither the room nor the person was actually created, confirming the rejection
  // wasn't just a response-shape artefact.
  const afterResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: { query: 'query { rooms { name } people { name } }' },
  })
  const afterBody = await afterResponse.json()
  const roomNames: string[] = (afterBody.data?.rooms ?? []).map((r: { name: string }) => r.name)
  const personNames: string[] = (afterBody.data?.people ?? []).map((p: { name: string }) => p.name)
  expect(roomNames).not.toContain(`L90 Room ${runId}`)
  expect(roomNames).not.toContain(`L90 Renamed ${runId}`)
  expect(personNames).not.toContain(`L90 Person ${runId}`)
})

test('L.91 - a standard user cannot rename another user\'s Person, even by forcing the mutation directly', async ({
  page,
  request,
}) => {
  const graphqlUrl = requireEnv('GRAPHQL_API_URL')
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const accountA = { ...freshTestAccount(), name: `L91 Account A ${runId}` }
  const accountB = { ...freshTestAccount(), name: `L91 Account B ${runId}` }

  await createConfirmedTestAccount(accountA)
  await createConfirmedTestAccount(accountB)

  // (a) accountA successfully renaming *itself* is already proven by I.74 (same account shape -
  // a fresh createConfirmedTestAccount) - deliberately not re-run here.

  // (b) accountA has no UI path to renaming anyone else: no People section exists for a standard
  // user at all (L.89/K.84 above), so there's structurally nothing to click.
  await signIn(page, accountA.email, accountA.password)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'People' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add person' })).toHaveCount(0)

  const token = await extractIdToken(page)

  // Look up accountB's Person id - `people` only requires authentication (see
  // ListPeopleHandler), so accountA's own standard token can read it even though the People
  // *section* is hidden from accountA's UI.
  const peopleResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: { query: 'query { people { id name } }' },
  })
  const peopleBody = await peopleResponse.json()
  const personB = (peopleBody.data?.people ?? []).find(
    (p: { name: string }) => p.name === accountB.name,
  )
  if (!personB) {
    throw new Error(`Could not find accountB's Person ("${accountB.name}") via the people query.`)
  }

  // (c) forcing a raw updatePerson mutation, as accountA, targeting accountB's Person id.
  const updatePersonResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: `mutation ($id: ID!, $person: PersonInput!) { updatePerson(id: $id, person: $person) { person { id name } errors } }`,
      variables: { id: personB.id, person: { name: `Hijacked ${runId}` } },
    },
  })
  const updatePersonBody = await updatePersonResponse.json()

  // UpdatePersonHandler's isAdmin-OR-self check fails both ways for this combination and throws
  // (IllegalStateException: "Forbidden: can only update your own name unless you are admin"),
  // which - like requireAdmin's hard rejections above - surfaces as a top-level GraphQL `errors`
  // array, not a structured UpdatePersonResult.errors entry (confirmed by reading
  // UpdatePersonHandler.java directly: both the admin-only and the isAdmin-or-self checks throw
  // the same way, just with different messages, so this rejection is the *same shape* as L.90's,
  // not a differently-shaped one as this catalog entry's own Notes flagged as worth confirming).
  expect(Array.isArray(updatePersonBody.errors) && updatePersonBody.errors.length > 0).toBe(true)
  expect(updatePersonBody.data?.updatePerson ?? null).toBeNull()

  // accountB's Person name is unchanged afterward.
  const afterResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: { query: 'query { people { id name } }' },
  })
  const afterBody = await afterResponse.json()
  const personBAfter = (afterBody.data?.people ?? []).find(
    (p: { id: string }) => p.id === personB.id,
  )
  expect(personBAfter?.name).toBe(accountB.name)
})
