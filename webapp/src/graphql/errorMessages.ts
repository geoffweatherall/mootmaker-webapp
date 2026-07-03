import { CombinedGraphQLErrors } from '@apollo/client/errors'
import type { ErrorLike } from '@apollo/client'

export function errorMessages(error: ErrorLike | undefined): string[] {
  if (!error) return []
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors.map((e) => e.message)
  }
  return [error.message]
}
