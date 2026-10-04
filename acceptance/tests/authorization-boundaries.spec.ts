import { ADMIN_USER_NAME, adminUser, signInAsStandardUser } from './support/accounts'
import { requireEnv } from './support/env'
import { expect, test } from './support/test'
import { gql } from './support/gql'

// mootmaker/docs/reference/use-cases.md, section L (Authorization boundaries), cases 89-91.
//
// L.89 and (half of) L.91 are explicitly framed by the catalog as the general
// authorization-boundary restatement of mechanics already built for their own sections (P.124,
// Q.132, I.74) - see l-authorization-boundaries.md's own file-level note. This file re-proves the
// presentation-only half (L.89) directly rather than only cross-referencing, since it's cheap and
// keeps this file self-contained; it does NOT re-implement I.74's self-rename happy path (L.91a),
// only references it, per the catalog's explicit instruction not to make a third copy of that
// exact test.
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

test('L.89 - standard user has no Rooms/Persons nav links and cannot reach either page directly', async ({
  page,
}) => {
  await signInAsStandardUser(page)

  // Same mechanism as P.124 + Q.132, checked together in one visit per this entry's own Notes.
  // Rooms/Persons moved out of Settings to their own top-level pages (see the admin-rooms-and-
  // people design doc) - the old in-Settings-section check this test used to do no longer applies.
  await expect(page.getByRole('link', { name: 'Rooms' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Persons' })).toHaveCount(0)

  await page.goto('/rooms')
  await expect(page).toHaveURL('/')
  await page.goto('/persons')
  await expect(page).toHaveURL('/')
})

test('L.90 - a standard user directly calling any admin mutation is rejected server-side', async ({
  page,
  request,
  api,
}) => {
  const graphqlUrl = requireEnv('GRAPHQL_API_URL')
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const targetRoomName = `L90 Target Room ${runId}`
  const targetPersonName = `L90 Target Person ${runId}`

  // A real room and person to target with updateRoom/deleteRoom/renamePerson/setPersonAdmin/
  // deletePerson - created over the API (./support/setupApi.ts) rather than through an admin's UI.
  const existingRoomId = await api.createRoom(targetRoomName, 4)
  const existingPersonId = await api.createPerson(targetPersonName)

  await signInAsStandardUser(page)
  const token = await extractIdToken(page)

  const createRoomResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: gql`mutation ($room: RoomInput!) { createRoom(room: $room) { room { id } errors } }`,
      variables: { room: { name: `L90 Room ${runId}`, capacity: 4 } },
    },
  })
  const createRoomBody = await createRoomResponse.json()

  const updateRoomResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: gql`mutation ($id: ID!, $room: RoomInput!) { updateRoom(id: $id, room: $room) { room { id } errors } }`,
      variables: { id: existingRoomId, room: { name: `L90 Renamed ${runId}`, capacity: 4 } },
    },
  })
  const updateRoomBody = await updateRoomResponse.json()

  const deleteRoomResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: gql`mutation ($id: ID!) { deleteRoom(id: $id) { rooms { id } errors } }`,
      variables: { id: existingRoomId },
    },
  })
  const deleteRoomBody = await deleteRoomResponse.json()

  const createPersonResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: gql`mutation ($name: String!) { createPerson(name: $name) { person { id name } errors } }`,
      variables: { name: `L90 Person ${runId}` },
    },
  })
  const createPersonBody = await createPersonResponse.json()

  const renamePersonResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: gql`mutation ($id: ID!, $name: String!) { renamePerson(id: $id, name: $name) { person { id } errors } }`,
      variables: { id: existingPersonId, name: `L90 Renamed Person ${runId}` },
    },
  })
  const renamePersonBody = await renamePersonResponse.json()

  const setPersonAdminResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: gql`mutation ($id: ID!, $isAdmin: Boolean!) { setPersonAdmin(id: $id, isAdmin: $isAdmin) { person { id } errors } }`,
      variables: { id: existingPersonId, isAdmin: true },
    },
  })
  const setPersonAdminBody = await setPersonAdminResponse.json()

  const deletePersonResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: gql`mutation ($id: ID!) { deletePerson(id: $id) { people { id } errors } }`,
      variables: { id: existingPersonId },
    },
  })
  const deletePersonBody = await deletePersonResponse.json()

  // The avatar mutations are "admin, or the caller's own person" rather than admin-only, so aimed
  // at someone ELSE's person they belong in this list. This is the only place that rule meets a
  // real standard user's token: mootmaker-api's own acceptance suite authenticates as the tooling
  // client, which is admin-equivalent and so can only ever exercise the other half.
  const requestAvatarUploadResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: gql`mutation ($personId: ID!) { requestAvatarUpload(personId: $personId, contentType: "image/png", contentLength: 1000) { upload { url } errors } }`,
      variables: { personId: existingPersonId },
    },
  })
  const requestAvatarUploadBody = await requestAvatarUploadResponse.json()

  const confirmAvatarUploadResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: gql`mutation ($personId: ID!) { confirmAvatarUpload(personId: $personId, uploadId: "AAAAAAAA") { person { id } errors } }`,
      variables: { personId: existingPersonId },
    },
  })
  const confirmAvatarUploadBody = await confirmAvatarUploadResponse.json()

  const removeAvatarResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: gql`mutation ($personId: ID!) { removeAvatar(personId: $personId) { person { id } errors } }`,
      variables: { personId: existingPersonId },
    },
  })
  const removeAvatarBody = await removeAvatarResponse.json()

  // And the other half of that rule, so the rejections above are shown to be about WHOSE person it
  // is rather than about standard users being refused outright: the same token, aimed at the
  // caller's own person, is given an upload URL.
  const ownPersonId: string = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  )['custom:personId']
  const ownAvatarUploadResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: gql`mutation ($personId: ID!) { requestAvatarUpload(personId: $personId, contentType: "image/png", contentLength: 1000) { upload { url } errors } }`,
      variables: { personId: ownPersonId },
    },
  })
  const ownAvatarUploadBody = await ownAvatarUploadResponse.json()
  expect(ownAvatarUploadBody.errors, 'a standard user may request an upload for themselves').toBeUndefined()
  expect(ownAvatarUploadBody.data.requestAvatarUpload.errors).toEqual([])
  expect(ownAvatarUploadBody.data.requestAvatarUpload.upload.url).toMatch(/^https:\/\//)

  // Identity.requireAdmin throws, which AppSync surfaces as a top-level GraphQL `errors` array -
  // a different channel than each mutation's own structured Result.errors field used for ordinary
  // validation failures. Every request above should be rejected this way, with no data payload
  // for the attempted mutation. updateMyName is deliberately not included here - it isn't
  // admin-only (self-only, no id argument at all - see L.91), so it would misrepresent it as
  // symmetric with these when it isn't.
  const results = {
    createRoom: createRoomBody,
    updateRoom: updateRoomBody,
    deleteRoom: deleteRoomBody,
    createPerson: createPersonBody,
    renamePerson: renamePersonBody,
    setPersonAdmin: setPersonAdminBody,
    deletePerson: deletePersonBody,
    requestAvatarUpload: requestAvatarUploadBody,
    confirmAvatarUpload: confirmAvatarUploadBody,
    removeAvatar: removeAvatarBody,
  }
  for (const [name, body] of Object.entries(results)) {
    expect(Array.isArray(body.errors) && body.errors.length > 0, `${name} should be rejected`).toBe(true)
    expect(body.data?.[name] ?? null, `${name} should return no data`).toBeNull()
  }

  // Spot-check: nothing was actually created/changed/deleted, confirming the rejections weren't
  // just a response-shape artefact.
  const afterResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: { query: gql`query { workspace { rooms { id name } people { id name } } }` },
  })
  const afterBody = await afterResponse.json()
  // Fail loudly if the query itself did not resolve. Reading through `?? []` alone made this
  // spot-check pass vacuously once Query.rooms was deleted: data came back null, both lists were
  // empty, and "does not contain the room" was trivially true - the assertion checked nothing.
  if (!afterBody.data?.workspace) {
    throw new Error(`Spot-check query failed: ${JSON.stringify(afterBody.errors ?? afterBody)}`)
  }
  const rooms: { id: string; name: string }[] = afterBody.data.workspace.rooms
  const people: { id: string; name: string }[] = afterBody.data.workspace.people
  expect(rooms.map((r) => r.name)).not.toContain(`L90 Room ${runId}`)
  expect(rooms.map((r) => r.name)).not.toContain(`L90 Renamed ${runId}`)
  expect(rooms.find((r) => r.id === existingRoomId)?.name).toBe(targetRoomName)
  expect(people.map((p) => p.name)).not.toContain(`L90 Person ${runId}`)
  expect(people.find((p) => p.id === existingPersonId)?.name).toBe(targetPersonName)
})

test('L.91 - a standard user cannot rename another user\'s Person, even by forcing the mutation directly', async ({
  page,
  request,
}) => {
  const graphqlUrl = requireEnv('GRAPHQL_API_URL')
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  // accountA is the standard fixture user; accountB, the user it tries to rename, is the admin
  // fixture user - another real account. Reset repairs it if this ever succeeds by mistake.
  const accountB = { ...adminUser(), name: ADMIN_USER_NAME }

  // (a) accountA successfully renaming *itself* is already proven by I.74 - deliberately not
  // re-run here.

  // (b) accountA has no UI path to renaming anyone else: no Persons page exists for a standard
  // user at all (L.89/Q.132 above), so there's structurally nothing to click. accountA's own
  // self-rename path (Settings' "Your name") calls updateMyName, which takes no id argument at
  // all - so even that UI has no way to target anyone but the caller.
  await signInAsStandardUser(page)
  await expect(page.getByRole('link', { name: 'Persons' })).toHaveCount(0)

  const token = await extractIdToken(page)

  // Look up accountB's Person id - `people` only requires authentication (see
  // ListPeopleHandler), so accountA's own standard token can read it even though the People
  // *section* is hidden from accountA's UI.
  const peopleResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: { query: gql`query { workspace { people { id name } } }` },
  })
  const peopleBody = await peopleResponse.json()
  const personB = (peopleBody.data?.workspace?.people ?? []).find(
    (p: { name: string }) => p.name === accountB.name,
  )
  if (!personB) {
    throw new Error(`Could not find accountB's Person ("${accountB.name}") via the people query.`)
  }

  // (c) forcing a raw renamePerson mutation, as accountA, targeting accountB's Person id.
  // renamePerson is the admin-invoked half of the old self-or-admin updatePerson (see
  // RenamePersonHandler's own doc comment) - accountA's self-rename path is now the separate,
  // self-only updateMyName mutation, which takes no id at all and so has no way to even attempt
  // targeting someone else. There's no longer an "isAdmin-OR-self, fails both ways" check to
  // reason about: renamePerson is unconditionally Identity.requireAdmin, so this rejection is
  // the exact same shape as L.90's above (a thrown Forbidden, surfaced as a top-level GraphQL
  // `errors` array, not a structured RenamePersonResult.errors entry) - confirmed, not assumed.
  const renamePersonResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: {
      query: gql`mutation ($id: ID!, $name: String!) { renamePerson(id: $id, name: $name) { person { id name } errors } }`,
      variables: { id: personB.id, name: `Hijacked ${runId}` },
    },
  })
  const renamePersonBody = await renamePersonResponse.json()

  expect(Array.isArray(renamePersonBody.errors) && renamePersonBody.errors.length > 0).toBe(true)
  expect(renamePersonBody.data?.renamePerson ?? null).toBeNull()

  // accountB's Person name is unchanged afterward.
  const afterResponse = await request.post(graphqlUrl, {
    headers: { Authorization: token },
    data: { query: gql`query { workspace { people { id name } } }` },
  })
  const afterBody = await afterResponse.json()
  const personBAfter = (afterBody.data?.workspace?.people ?? []).find(
    (p: { id: string }) => p.id === personB.id,
  )
  expect(personBAfter?.name).toBe(accountB.name)
})
