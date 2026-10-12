// Pure logic extracted from cognito.ts so it can be unit-tested without a DOM; see signUpErrors.ts.

/**
 * Whether Cognito refused a password reset because the address has no usable account.
 *
 * With prevent_user_existence_errors on the pool, an unknown email should succeed exactly like a
 * known one, so the page reveals nothing about which addresses have accounts (use case C.17).
 * Cognito has nevertheless answered an unknown or unconfirmed address with this error
 * (mootmaker-android#45). Treating it as sent keeps the next step identical either way; no code
 * arrives.
 */
export function saysNoVerifiedAddress(error: { name?: string; code?: string; message?: string }): boolean {
  const type = error.code ?? error.name
  return type === 'InvalidParameterException' && /no registered\/verified email/i.test(error.message ?? '')
}
