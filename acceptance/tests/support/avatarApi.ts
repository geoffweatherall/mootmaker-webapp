/**
 * Sets a person's avatar through mootmaker-api directly, for tests that need one to exist.
 *
 * The webapp has no upload feature - setting an avatar is an API capability only - so a test that
 * wants to see one rendered has to put it there the way mootmaker-demo-data does: createPerson,
 * requestAvatarUpload, an HTTP PUT to the presigned URL, confirmAvatarUpload. Uses the same
 * machine-to-machine client the API's own acceptance suite does (exported by authenticate.sh,
 * which acceptance/run.sh sources), since a guest person has no login of their own.
 */

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see acceptance/run.sh.`)
  }
  return value
}

let cachedToken: string | undefined

async function accessToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken
  }
  const response = await fetch(requireEnv('COGNITO_TOKEN_URL'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: requireEnv('COGNITO_TEST_CLIENT_ID'),
      client_secret: requireEnv('COGNITO_TEST_CLIENT_SECRET'),
      scope: requireEnv('COGNITO_TEST_SCOPE'),
    }),
  })
  if (!response.ok) {
    throw new Error(`Cognito token endpoint returned ${response.status}: ${await response.text()}`)
  }
  cachedToken = ((await response.json()) as { access_token: string }).access_token
  return cachedToken
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(requireEnv('GRAPHQL_API_URL'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await accessToken() },
    body: JSON.stringify({ query, variables }),
  })
  const body = (await response.json()) as { data?: T; errors?: unknown }
  if (body.errors || !body.data) {
    throw new Error(`GraphQL request failed: ${JSON.stringify(body.errors ?? body)}`)
  }
  return body.data
}

function failIfRejected(operation: string, errors: string[]) {
  if (errors.length > 0) {
    throw new Error(`${operation} was rejected: ${errors.join(', ')}`)
  }
}

/** Creates a guest person and returns their id. */
export async function createPersonViaApi(name: string): Promise<string> {
  const data = await graphql<{ createPerson: { person: { id: string } | null; errors: string[] } }>(
    'mutation CreatePerson($name: String!) { createPerson(name: $name) { person { id } errors } }',
    { name },
  )
  failIfRejected('createPerson', data.createPerson.errors)
  return data.createPerson.person!.id
}

/**
 * Uploads `png` as this person's avatar and returns the `avatarUrl` the API now reports for them.
 * The image must be a real PNG of at least 64x64: the API decodes and re-encodes whatever it is
 * given, and rejects anything it cannot.
 */
export async function setAvatarViaApi(personId: string, png: Buffer): Promise<string> {
  const requested = await graphql<{
    requestAvatarUpload: { upload: { uploadId: string; url: string } | null; errors: string[] }
  }>(
    `mutation Request($personId: ID!, $contentType: String!, $contentLength: Int!) {
       requestAvatarUpload(personId: $personId, contentType: $contentType, contentLength: $contentLength) {
         upload { uploadId url } errors
       }
     }`,
    { personId, contentType: 'image/png', contentLength: png.length },
  )
  failIfRejected('requestAvatarUpload', requested.requestAvatarUpload.errors)
  const upload = requested.requestAvatarUpload.upload!

  // No Authorization header: the URL is presigned, and S3 refuses a request carrying two forms of
  // authentication. The content type and length must match what was just declared, exactly.
  const put = await fetch(upload.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: new Uint8Array(png),
  })
  if (!put.ok) {
    throw new Error(`Avatar upload was refused with HTTP ${put.status}: ${await put.text()}`)
  }

  const confirmed = await graphql<{
    confirmAvatarUpload: { person: { avatarUrl: string } | null; errors: string[] }
  }>(
    `mutation Confirm($personId: ID!, $uploadId: ID!) {
       confirmAvatarUpload(personId: $personId, uploadId: $uploadId) { person { avatarUrl } errors }
     }`,
    { personId, uploadId: upload.uploadId },
  )
  failIfRejected('confirmAvatarUpload', confirmed.confirmAvatarUpload.errors)
  return confirmed.confirmAvatarUpload.person!.avatarUrl
}
