import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { describe, expect, it } from 'vitest'
import { errorMessages } from './errorMessages'

describe('errorMessages', () => {
  it('returns an empty array for no error', () => {
    expect(errorMessages(undefined)).toEqual([])
  })

  it('flattens a CombinedGraphQLErrors into each individual error message', () => {
    const error = new CombinedGraphQLErrors(
      { data: null },
      [{ message: 'Subject is required.' }, { message: 'Room could not be found.' }],
    )

    expect(errorMessages(error)).toEqual(['Subject is required.', 'Room could not be found.'])
  })

  it('falls back to the single .message for a transport/network error (not a GraphQL result)', () => {
    const error = new Error('Failed to fetch')

    expect(errorMessages(error)).toEqual(['Failed to fetch'])
  })
})
