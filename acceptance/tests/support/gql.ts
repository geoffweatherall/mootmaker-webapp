/**
 * Marks a GraphQL operation so `npm run graphql:check:tests` (in webapp/) can find it and validate
 * it against the API's schema - see webapp/scripts/check-test-graphql.mjs and mootmaker-webapp#62.
 *
 * At runtime it only returns the text. Interpolation is refused by the type (`never`), because an
 * operation built from pieces cannot be checked statically: pass values as variables instead.
 */
export function gql(strings: TemplateStringsArray, ..._values: never[]): string {
  return strings.join('')
}
