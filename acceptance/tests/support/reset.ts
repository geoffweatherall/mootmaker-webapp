import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { requireEnv } from './env'

/**
 * Resets the environment through mootmaker-api's database-reset Lambda: every room, meeting and
 * non-reserved person and account goes, and the fixture users are repaired (see ./accounts.ts).
 *
 * Called before every test (./test.ts), which is what lets any test run alone or in any order: it
 * starts from the same known state and creates everything else it relies on. Takes about a second
 * on an environment holding only the previous test's data.
 */
const client = new LambdaClient({})

export async function resetEnvironment(): Promise<void> {
  const response = await client.send(
    new InvokeCommand({ FunctionName: requireEnv('DATABASE_RESET_FUNCTION_NAME'), Payload: new TextEncoder().encode('{}') }),
  )
  if (response.FunctionError) {
    const detail = response.Payload ? new TextDecoder().decode(response.Payload) : ''
    throw new Error(`database-reset failed (${response.FunctionError}): ${detail}`)
  }
}
