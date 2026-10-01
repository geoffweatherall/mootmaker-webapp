import type { APIRequestContext } from '@playwright/test'
import { requireEnv } from './env'

/**
 * Test setup over the API, as mootmaker-api's machine-to-machine client, which has the admin scope
 * (mootmaker-webapp#138). Rooms, people, meetings and avatars a test needs as a precondition are
 * created here rather than through the admin UI, so that:
 *
 * - a standard-user test needs no admin session at all, and
 * - the admin UI is driven only by tests whose subject it is.
 *
 * Every call goes through Playwright's own request context. Node's built-in fetch was tried first
 * and could not connect at all from a workstation where Playwright's client works fine.
 */
export class SetupApi {
  private token: string | undefined

  constructor(private readonly request: APIRequestContext) {}

  /** Runs any GraphQL operation as the machine-to-machine client. Throws on GraphQL errors. */
  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await this.request.post(requireEnv('GRAPHQL_API_URL'), {
      headers: { Authorization: await this.accessToken() },
      data: { query, variables },
    })
    const body = (await response.json()) as { data?: T; errors?: unknown }
    if (body.errors || !body.data) {
      throw new Error(`GraphQL request failed: ${JSON.stringify(body.errors ?? body)}`)
    }
    return body.data
  }

  async createRoom(name: string, capacity: number): Promise<string> {
    const data = await this.graphql<{ createRoom: { room: { id: string } | null; errors: string[] } }>(
      'mutation($room: RoomInput!) { createRoom(room: $room) { room { id } errors } }',
      { room: { name, capacity } },
    )
    failIfRejected('createRoom', data.createRoom.errors)
    return data.createRoom.room!.id
  }

  /** A guest person, with no sign-in of their own. */
  async createPerson(name: string): Promise<string> {
    const data = await this.graphql<{ createPerson: { person: { id: string } | null; errors: string[] } }>(
      'mutation($name: String!) { createPerson(name: $name) { person { id } errors } }',
      { name },
    )
    failIfRejected('createPerson', data.createPerson.errors)
    return data.createPerson.person!.id
  }

  /** The id of the Person linked to a signed-up account, found by its email. */
  async personIdByEmail(email: string): Promise<string> {
    const data = await this.graphql<{ workspace: { people: { id: string; linkedEmails: string[] }[] } }>(
      'query { workspace { people { id linkedEmails } } }',
    )
    const person = data.workspace.people.find((p) =>
      p.linkedEmails.some((linked) => linked.toLowerCase() === email.toLowerCase()),
    )
    if (!person) throw new Error(`No Person is linked to ${email}`)
    return person.id
  }

  /**
   * Books a meeting. Times are local ISO date-times, e.g. "2026-10-02T10:00:00". The organiser can
   * be anyone: the machine-to-machine client is admin.
   */
  async createMeeting(meeting: {
    subject: string
    roomId: string
    organiserId: string
    attendeeIds?: string[]
    startTime: string
    endTime: string
  }): Promise<string> {
    const data = await this.graphql<{ createMeeting: { meeting: { id: string } | null; errors: string[] } }>(
      'mutation($meeting: MeetingInput!) { createMeeting(meeting: $meeting) { meeting { id } errors } }',
      { meeting: { attendeeIds: [], ...meeting } },
    )
    failIfRejected('createMeeting', data.createMeeting.errors)
    return data.createMeeting.meeting!.id
  }

  async setPersonAdmin(personId: string, isAdmin: boolean): Promise<void> {
    await this.graphql('mutation($id: ID!, $isAdmin: Boolean!) { setPersonAdmin(id: $id, isAdmin: $isAdmin) { cognitoSyncFailed } }', {
      id: personId,
      isAdmin,
    })
  }

  /**
   * Uploads `png` as this person's avatar and returns the `avatarUrl` the API now reports for them,
   * the way mootmaker-demo-data does: requestAvatarUpload, an HTTP PUT to the presigned URL,
   * confirmAvatarUpload. The image must be a real PNG of at least 64x64.
   */
  async setAvatar(personId: string, png: Buffer): Promise<string> {
    const requested = await this.graphql<{
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
    const put = await this.request.put(upload.url, { headers: { 'Content-Type': 'image/png' }, data: png })
    if (!put.ok()) {
      throw new Error(`Avatar upload was refused with HTTP ${put.status()}: ${await put.text()}`)
    }

    const confirmed = await this.graphql<{
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

  private async accessToken(): Promise<string> {
    if (this.token) return this.token
    const response = await this.request.post(requireEnv('COGNITO_TOKEN_URL'), {
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
    this.token = body.access_token as string
    return this.token
  }
}

function failIfRejected(operation: string, errors: string[]): void {
  if (errors.length > 0) throw new Error(`${operation} was rejected: ${errors.join(', ')}`)
}
