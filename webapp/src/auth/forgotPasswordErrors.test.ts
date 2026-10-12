import { describe, expect, it } from 'vitest'
import { saysNoVerifiedAddress } from './forgotPasswordErrors'

describe('saysNoVerifiedAddress', () => {
  it('recognises the refusal Cognito gives an address with no usable account', () => {
    expect(
      saysNoVerifiedAddress({
        code: 'InvalidParameterException',
        name: 'InvalidParameterException',
        message: 'Cannot reset password for the user as there is no registered/verified email or phone_number',
      }),
    ).toBe(true)
  })

  it('leaves every other failure to be shown', () => {
    expect(saysNoVerifiedAddress({ code: 'InvalidParameterException', message: 'Username should be an email.' })).toBe(false)
    expect(saysNoVerifiedAddress({ code: 'LimitExceededException', message: 'Attempt limit exceeded' })).toBe(false)
    expect(saysNoVerifiedAddress(new Error('Network error'))).toBe(false)
  })
})
