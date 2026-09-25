// Pure logic extracted from cognito.ts so it can be unit-tested (Vitest) without a DOM - see
// testing-strategy.md's "Unit tests" layer, and addMeetingLogic.ts for the identical reasoning.
// cognito.ts itself can't sit in that layer: it imports config.ts, which reads
// `window.__MOOTMAKER_CONFIG__` as a module-level side effect.

// Cognito wraps a PreSignUp trigger's thrown message as `PreSignUp failed with error <message>.`
// (amazon-cognito-identity-js surfaces it as `UserLambdaValidationException`) - readable enough
// to just pass through most of, but the wrapper text itself is implementation detail a person
// signing up shouldn't have to parse. Strips it down to the Lambda's own message, which is what
// PreSignUpNameCollisionHandler (mootmaker-api) writes for a human to read directly. Falls back
// to the raw message for any OTHER Lambda validation failure this pattern doesn't match, rather
// than hiding it.
const PRE_SIGN_UP_REJECTION = /^PreSignUp failed with error (.+)$/

export function readableSignUpError(error: Error): Error {
  if (error.name !== 'UserLambdaValidationException') {
    return error
  }
  const match = PRE_SIGN_UP_REJECTION.exec(error.message)
  if (!match) {
    return error
  }
  // Cognito's own trailing period lands right after whatever the Lambda's message ended
  // with - already a period here, since PreSignUpNameCollisionHandler's own message is a full
  // sentence - collapsing a run of them to exactly one avoids the doubled ".." that would
  // otherwise reach the person signing up.
  return new Error(match[1].replace(/\.+$/, '.'))
}
