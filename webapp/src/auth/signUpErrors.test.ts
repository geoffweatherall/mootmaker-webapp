import { describe, expect, it } from 'vitest'
import { readableSignUpError } from './signUpErrors'

describe('readableSignUpError', () => {
  it('strips the PreSignUp wrapper text off a name-collision rejection', () => {
    // mootmaker-api#70: PreSignUpNameCollisionHandler's own message, as Cognito actually wraps it.
    const error = new Error(
      'PreSignUp failed with error A person with this name already exists. ' +
        'Contact an admin if you believe this is a mistake..',
    )
    error.name = 'UserLambdaValidationException'

    expect(readableSignUpError(error).message).toEqual(
      'A person with this name already exists. Contact an admin if you believe this is a mistake.',
    )
  })

  it('leaves a non-Lambda-validation error unchanged', () => {
    const error = new Error('UsernameExistsException: An account with this email already exists.')
    error.name = 'UsernameExistsException'

    expect(readableSignUpError(error)).toBe(error)
  })

  it('falls back to the raw message for a Lambda validation error this pattern does not match', () => {
    const error = new Error('Something unrelated went wrong')
    error.name = 'UserLambdaValidationException'

    expect(readableSignUpError(error)).toBe(error)
  })
})
