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
 */
export function freshTestAccount(): TestAccount {
  return {
    name: 'Test Account',
    email: uniqueTestEmail(),
    // Meets the deployed pool's password policy (>=10 chars, a lowercase letter, a number - see
    // mootmaker-api/deploy/terraform/cognito.tf) with a bit of per-run variance, mostly so a
    // hardcoded literal isn't sitting in source control for no reason.
    password: `test-pw-${randomInt(100_000, 999_999)}`,
  }
}
