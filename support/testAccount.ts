import { randomInt } from 'node:crypto'
import { uniqueTestEmail } from './email'

export interface TestAccount {
  name: string
  email: string
  password: string
}

/**
 * A fresh, never-used identity for a real sign-up - see uniqueTestEmail for why every test needs
 * its own. Shared by both e2e/ and acceptance/ (either may need a real signed-up account).
 *
 * The name carries the same uniqueness requirement as the email now: mootmaker-api#70 made a
 * name collision (case/whitespace-insensitive) an outright sign-up rejection rather than something
 * silently allowed, so a fixed literal name here would only ever succeed once per environment - the
 * first caller creates the Person, and PreSignUpNameCollisionHandler rejects every one after it.
 * Seen for real: every test after the first to call this in a given run failed at "Verification
 * code never appears" or with a UserLambdaValidationException, well beyond just the tests this
 * feature added.
 */
export function freshTestAccount(): TestAccount {
  return {
    name: `Test Account ${randomInt(100_000, 999_999)}`,
    email: uniqueTestEmail(),
    // Meets the deployed pool's password policy (>=10 chars, a lowercase letter, a number - see
    // mootmaker-api/deploy/terraform/cognito.tf) with a bit of per-run variance, mostly so a
    // hardcoded literal isn't sitting in source control for no reason.
    password: `test-pw-${randomInt(100_000, 999_999)}`,
  }
}
